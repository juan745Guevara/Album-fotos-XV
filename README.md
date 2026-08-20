# Álbum de Fotos Colaborativo por Mesas (QR)

Sistema web para un evento con **10 mesas físicas**. Cada mesa tiene un código QR único; al escanearlo, los invitados suben fotos a esa mesa (máximo **10 fotos por mesa** / 100 en total). Incluye panel admin con galería y descarga masiva en ZIP.

## Stack

| Capa | Tecnología |
|------|------------|
| Backend | Node.js + Express |
| Frontend | React + Vite (mobile-first) |
| Imágenes | Cloudinary |
| Base de datos | PostgreSQL |
| Auth admin | JWT + bcrypt |
| QR | `qrcode` + PDF opcional con `pdfkit` |

## Estructura

```
Album-fotos-XV/
├── backend/
│   ├── src/
│   │   ├── config/          # DB y Cloudinary
│   │   ├── controllers/
│   │   ├── middleware/      # auth admin, multer
│   │   ├── routes/
│   │   ├── scripts/         # seed, init-db, generar-qr
│   │   └── app.js
│   ├── qr-generados/        # salida de los QR
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── pages/           # SubirFoto, GaleriaAdmin, LoginAdmin
│   │   ├── services/api.js
│   │   └── ...
│   └── .env.example
└── README.md
```

## Supuestos

- Evento de una sola ocasión (no multi-tenant).
- Invitados **sin cuenta**: acceso solo por link/QR de su mesa.
- Admin con login (JWT en `sessionStorage` — se borra al cerrar la pestaña).
- Sin moderación previa: las fotos aparecen al subirlas.
- Formatos: jpg, jpeg, png, webp · tamaño máx. configurable (`MAX_FILE_SIZE_MB`, default 100).

Si quieres aprobación manual, multi-evento o token solo en memoria (sin `sessionStorage`), se puede agregar después.

## Setup local

### 1. PostgreSQL

Crea una base vacía, por ejemplo:

```sql
CREATE DATABASE album_fotos_qr;
```

### 2. Backend

```bash
cd backend
cp .env.example .env
# Edita .env con DATABASE_URL, Cloudinary, JWT_SECRET, ADMIN_USER, ADMIN_PASSWORD
npm install
npm run seed          # crea tablas + 10 mesas + admin
npm run dev           # http://localhost:4000
```

### 3. Frontend

```bash
cd frontend
cp .env.example .env
# VITE_API_URL=http://localhost:4000/api  (o deja /api y usa el proxy de Vite)
npm install
npm run dev           # http://localhost:5173
```

- Subida mesa 1: http://localhost:5173/mesa/1  
- Admin: http://localhost:5173/admin/login  

### 4. Generar QR para imprimir

Con `FRONTEND_URL` apuntando al dominio real (o a localhost para pruebas):

```bash
cd backend
npm run generar-qr
```

Genera:

- `backend/qr-generados/mesa-1.png` … `mesa-10.png`
- `backend/qr-generados/qrs-mesas.pdf` (1 QR por página A4, con número de mesa)

## API

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/api/mesas` | No | Lista las 10 mesas con contadores |
| GET | `/api/mesas/:id` | No | Info de mesa + fotos + contador |
| POST | `/api/mesas/:id/fotos` | No | Sube foto (`multipart` campo `foto`) |
| GET | `/api/fotos` | Admin | Todas las fotos (`?mesa_id=` opcional) |
| GET | `/api/fotos/zip` | Admin | ZIP con todas las fotos |
| DELETE | `/api/fotos/:id` | Admin | Elimina foto (DB + Cloudinary) |
| POST | `/api/admin/login` | No | `{ usuario, password }` → JWT |

### Regla de límite

Antes de aceptar una subida, el backend hace `SELECT … FOR UPDATE` sobre la mesa, verifica `cantidad_fotos < 10` y solo entonces sube a Cloudinary e inserta. Si ya llegó al límite responde **409**.

Carpetas Cloudinary: `album-evento/mesa-1/`, `album-evento/mesa-2/`, etc.

## Variables de entorno

**Backend (`.env`):**

- `PORT`, `DATABASE_URL`
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- `JWT_SECRET`, `ADMIN_USER`, `ADMIN_PASSWORD`
- `FRONTEND_URL` (para generar QR)
- `MAX_FOTOS_POR_MESA`, `MAX_FILE_SIZE_MB` (opcionales)

**Frontend (`.env`):**

- `VITE_API_URL` — en producción con Nginx: `/api` o `https://tu-dominio.com/api`
- `VITE_PUBLIC_URL` — URL pública del sitio (para QR en el panel admin)

**Nunca subas `.env` a git.**

## Deploy en AWS (EC2 + Nginx + PM2)

Stack recomendado para dejar el sitio **siempre encendido** con subidas grandes (hasta 100 MB):

| Servicio | Uso |
|----------|-----|
| **EC2** | Node (API) + Nginx (frontend estático) |
| **RDS PostgreSQL** o Postgres en la misma EC2 | Base de datos |
| **Cloudinary** | Almacenamiento de imágenes |

### 1. Servidor EC2

- Ubuntu 22.04, tipo `t3.micro` o `t3.small`
- Abre puertos **22**, **80** y **443** en el Security Group
- Instala: Node 20, Nginx, PM2, PostgreSQL (local) o usa RDS

### 2. Clonar y configurar

```bash
git clone <tu-repo> /var/www/album-fotos
cd /var/www/album-fotos

cd backend && cp .env.example .env
# Edita .env: DATABASE_URL, Cloudinary, JWT_SECRET, FRONTEND_URL=https://tu-dominio.com
npm install && npm run seed

cd ../frontend && cp .env.example .env
# VITE_API_URL=/api   VITE_PUBLIC_URL=https://tu-dominio.com
npm install && npm run build
```

### 3. Arrancar API con PM2

```bash
cd /var/www/album-fotos
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # sigue las instrucciones que imprime
```

### 4. Nginx

```nginx
server {
  server_name tu-dominio.com;

  location /api/ {
    proxy_pass http://127.0.0.1:4000/api/;
    proxy_read_timeout 300s;
    client_max_body_size 105M;
  }

  location / {
    root /var/www/album-fotos/frontend/dist;
    try_files $uri $uri/ /index.html;
  }
}
```

SSL con Certbot:

```bash
sudo certbot --nginx -d tu-dominio.com
```

### 5. QR finales

```bash
cd backend
FRONTEND_URL=https://tu-dominio.com npm run generar-qr
```

URLs:

- Invitados: `https://tu-dominio.com/mesa/1`
- Admin: `https://tu-dominio.com/admin/login`

## UX invitados

- Mobile-first, botón grande para cámara/galería.
- Preview antes de confirmar.
- Compresión en cliente (`browser-image-compression`) para redes lentas.
- Reintentos automáticos de subida (hasta 2) ante fallos de red.
- Contador visual `X de 10` y grid de fotos de la mesa.
