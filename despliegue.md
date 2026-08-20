# Guía de despliegue en Amazon AWS

Guía paso a paso para publicar el **Álbum de Fotos XV** en producción usando **EC2 + Amazon RDS + Nginx + PM2 + Cloudinary**.

---

## Resumen de servicios

| Servicio | Obligatorio | Para qué |
|----------|-------------|----------|
| **Amazon EC2** | Sí | Servidor: API Node.js, frontend estático, Nginx |
| **Amazon RDS (PostgreSQL)** | Sí | Base de datos: mesas, fotos, admin |
| **Cloudinary** | Sí | Almacenamiento de imágenes |
| **Dominio** | Recomendado | URL fija para los QR (`https://tudominio.com`) |
| **Route 53** | Opcional | DNS si el dominio está en AWS |
| **Elastic IP** | Opcional | IP fija para la EC2 |

---

## Arquitectura

```
Invitado escanea QR
        │
        ▼
  tu-dominio.com (EC2)
        │
   ┌────┴────┐
   │  Nginx  │
   └────┬────┘
        │
   ┌────┴─────────────┐
   │                  │
Frontend          API Node.js
(dist/)           (PM2 :4000)
                       │
              ┌────────┴────────┐
              │                 │
         Amazon RDS          Cloudinary
         (PostgreSQL)          (fotos)
```

---

## Requisitos previos

Antes de empezar, ten listo:

1. Cuenta en [AWS](https://aws.amazon.com)
2. Cuenta en [Cloudinary](https://cloudinary.com) (plan free sirve)
3. Repositorio del proyecto en GitHub (o forma de subir código al servidor)
4. Dominio (opcional pero recomendado para los QR impresos)
5. Par de claves SSH para conectarte a la EC2

---

## Parte 1 — Crear la instancia EC2

### 1.1 Lanzar instancia

1. Entra a **AWS Console → EC2 → Launch instance**
2. Configuración sugerida:
   - **Nombre:** `album-fotos-xv`
   - **AMI:** Ubuntu Server 22.04 LTS
   - **Tipo:** `t3.micro` (económico) o `t3.small` (más cómodo con muchas subidas)
   - **Key pair:** crea o selecciona una (.pem)
   - **Storage:** 20–30 GB gp3

### 1.2 Security Group (firewall)

Abre estos puertos entrantes:

| Puerto | Origen | Uso |
|--------|--------|-----|
| 22 | Tu IP | SSH |
| 80 | 0.0.0.0/0 | HTTP |
| 443 | 0.0.0.0/0 | HTTPS |

> No abras el puerto 4000 al público. La API solo se expone vía Nginx en `/api`.

### 1.3 Elastic IP (opcional)

1. **EC2 → Elastic IPs → Allocate**
2. **Associate** con tu instancia

Así la IP no cambia al reiniciar la EC2.

### 1.4 Conectarte por SSH

```bash
chmod 400 tu-clave.pem
ssh -i tu-clave.pem ubuntu@TU_IP_PUBLICA
```

---

## Parte 2 — Amazon RDS (PostgreSQL)

La base de datos va en **RDS**, separada de la EC2. Haz esta parte **después** de crear la EC2 (necesitas el Security Group de la instancia).

### 2.1 Crear la instancia RDS

1. **AWS Console → RDS → Create database**
2. Configuración sugerida:

| Campo | Valor |
|-------|-------|
| Engine | **PostgreSQL** |
| Version | 16.x (o la más reciente estable) |
| Template | Free tier (si aplica) o Production |
| DB instance identifier | `album-fotos-xv` |
| Master username | `album_admin` |
| Master password | Guarda una contraseña segura |
| DB instance class | `db.t3.micro` o `db.t4g.micro` |
| Storage | 20 GB gp3 |
| Public access | **No** |
| VPC | La misma VPC donde está tu EC2 |
| Database name | `album_fotos_qr` |

3. Crea la instancia y espera a que el estado sea **Available** (5–10 min).

### 2.2 Security Group de RDS

El RDS debe aceptar conexiones **solo desde la EC2**, no desde internet.

1. **RDS → tu instancia → Connectivity & security → VPC security group**
2. Edita las reglas **Inbound**:
   - **Type:** PostgreSQL
   - **Port:** 5432
   - **Source:** el Security Group de tu EC2 (ej. `sg-0abc123...`)

> No uses `0.0.0.0/0` en RDS. Solo la EC2 debe poder conectarse.

### 2.3 Obtener el endpoint

En **RDS → Connectivity & security**, copia el **Endpoint**, por ejemplo:

```
album-fotos-xv.xxxxx.us-east-1.rds.amazonaws.com
```

### 2.4 `DATABASE_URL` y SSL

En `backend/.env` (producción):

```env
DATABASE_URL=postgresql://album_admin:TU_PASSWORD@album-fotos-xv.xxxxx.us-east-1.rds.amazonaws.com:5432/album_fotos_qr
DB_SSL=true
```

`DB_SSL=true` es **obligatorio** con RDS.

### 2.5 Probar conexión desde la EC2

Conectado por SSH a la EC2:

```bash
sudo apt install -y postgresql-client
psql "postgresql://album_admin:TU_PASSWORD@TU_ENDPOINT.rds.amazonaws.com:5432/album_fotos_qr?sslmode=require"
```

Si entras a `psql`, la conexión está bien. Sal con `\q`.

### 2.6 Crear tablas (seed)

Desde la EC2, con `backend/.env` ya configurado:

```bash
cd /var/www/album-fotos
npm install --prefix backend --omit=dev
npm run seed --prefix backend
```

Esto crea las tablas `mesas`, `fotos`, `admins`, las 10 mesas y el usuario admin.

---

## Parte 3 — Cloudinary

1. Crea cuenta en [cloudinary.com](https://cloudinary.com)
2. En el Dashboard copia:
   - **Cloud name**
   - **API Key**
   - **API Secret**
3. Esas tres variables van al `.env` del backend

Las fotos se guardan en carpetas: `album-evento/mesa-1/`, `mesa-2/`, etc.

---

## Parte 4 — Preparar el servidor

Conectado por SSH a la EC2:

### 4.1 Instalar software base

Desde la raíz del proyecto clonado:

```bash
sudo bash deploy/scripts/install-server.sh
```

O manualmente:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git nginx certbot python3-certbot-nginx ufw
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

### 4.2 Clonar el proyecto

```bash
sudo mkdir -p /var/www
sudo chown ubuntu:ubuntu /var/www
cd /var/www
git clone https://github.com/TU_USUARIO/Album-fotos-XV.git album-fotos
cd album-fotos
```

---

## Parte 5 — Configurar variables de entorno

### 5.1 Backend

```bash
cp deploy/env/backend.production.example backend/.env
nano backend/.env
```

Completa **todas** las variables:

| Variable | Ejemplo | Notas |
|----------|---------|-------|
| `PORT` | `4000` | No cambiar |
| `DATABASE_URL` | `postgresql://...@....rds.amazonaws.com:5432/album_fotos_qr` | Ver Parte 2 |
| `DB_SSL` | `true` | **Obligatorio** con RDS |
| `CLOUDINARY_*` | — | Del dashboard Cloudinary |
| `JWT_SECRET` | string largo aleatorio | Mín. 32 caracteres |
| `ADMIN_USER` | `admin` | Usuario del panel |
| `ADMIN_PASSWORD` | — | Contraseña del evento |
| `FRONTEND_URL` | `https://tu-dominio.com` | Sin barra final |
| `MAX_FOTOS_POR_MESA` | `10` | Opcional |
| `MAX_FILE_SIZE_MB` | `100` | Opcional |

### 5.2 Frontend (antes del build)

```bash
cp deploy/env/frontend.production.example frontend/.env
nano frontend/.env
```

| Variable | Valor en producción |
|----------|---------------------|
| `VITE_API_URL` | `/api` |
| `VITE_PUBLIC_URL` | `https://tu-dominio.com` |

> Las variables `VITE_*` se embeben en el build. Si cambias el dominio, debes recompilar el frontend.

---

## Parte 6 — Instalar, seed y build

```bash
cd /var/www/album-fotos

# Dependencias backend
npm install --prefix backend --omit=dev

# Crear tablas + 10 mesas + usuario admin
npm run seed --prefix backend

# Build del frontend (usa frontend/.env)
bash deploy/scripts/build-production.sh
```

Verifica que exista `frontend/dist/index.html`.

---

## Parte 7 — Arrancar la API con PM2

```bash
cd /var/www/album-fotos
pm2 start ecosystem.config.js
pm2 save
pm2 startup
# Ejecuta el comando que PM2 te imprime (con sudo)
```

Comandos útiles:

```bash
pm2 status
pm2 logs album-fotos-api
pm2 restart album-fotos-api
```

Prueba local en el servidor:

```bash
curl http://127.0.0.1:4000/api/health
# Debe responder: {"ok":true,"servicio":"album-fotos-qr"}
```

---

## Parte 8 — Configurar Nginx

```bash
sudo cp /var/www/album-fotos/deploy/nginx/album-fotos.conf /etc/nginx/sites-available/album-fotos
sudo nano /etc/nginx/sites-available/album-fotos
# Cambia tu-dominio.com por tu dominio real

sudo ln -sf /etc/nginx/sites-available/album-fotos /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

Si aún no tienes dominio, puedes probar con la IP:

- Cambia `server_name` por `_` o tu IP
- Accede: `http://TU_IP/mesa/1`

---

## Parte 9 — Dominio y SSL (HTTPS)

### 9.1 DNS

En tu registrador de dominio (GoDaddy, Namecheap, Route 53, etc.):

| Tipo | Nombre | Valor |
|------|--------|-------|
| A | `@` | IP pública de tu EC2 |
| A | `www` | IP pública de tu EC2 |

Espera 5–30 minutos a que propague.

### 9.2 Certificado SSL con Certbot

```bash
sudo certbot --nginx -d tu-dominio.com -d www.tu-dominio.com
```

Certbot renueva automáticamente. Prueba:

```bash
curl https://tu-dominio.com/api/health
```

---

## Parte 10 — Generar los QR finales

Con el dominio ya funcionando:

```bash
cd /var/www/album-fotos/backend
FRONTEND_URL=https://tu-dominio.com npm run generar-qr
```

Se generan en `backend/qr-generados/`:

- `mesa-1.png` … `mesa-10.png`
- `qrs-mesas.pdf` (para imprimir)

Descárgalos a tu PC:

```bash
# Desde tu máquina local:
scp -i tu-clave.pem -r ubuntu@TU_IP:/var/www/album-fotos/backend/qr-generados ./
```

---

## URLs finales

| Uso | URL |
|-----|-----|
| Mesa 1 (invitados) | `https://tu-dominio.com/mesa/1` |
| Mesa N | `https://tu-dominio.com/mesa/N` |
| Login admin | `https://tu-dominio.com/admin/login` |
| Health check | `https://tu-dominio.com/api/health` |

Credenciales admin: las que pusiste en `ADMIN_USER` / `ADMIN_PASSWORD`.

---

## Checklist de despliegue

- [ ] EC2 creada con puertos 22, 80, 443
- [ ] RDS PostgreSQL creado y en estado Available
- [ ] Security Group de RDS permite solo la EC2 (puerto 5432)
- [ ] `DATABASE_URL` y `DB_SSL=true` en `backend/.env`
- [ ] Conexión probada con `psql` desde la EC2
- [ ] Cloudinary configurado
- [ ] `backend/.env` completo
- [ ] `frontend/.env` con dominio real
- [ ] `npm run seed` ejecutado sin errores
- [ ] Frontend compilado (`frontend/dist`)
- [ ] PM2 corriendo (`pm2 status`)
- [ ] Nginx configurado y activo
- [ ] DNS apuntando a la EC2
- [ ] SSL con Certbot
- [ ] `/api/health` responde OK
- [ ] Subida de prueba en `/mesa/1`
- [ ] Login admin funciona
- [ ] QR generados con URL final

---

## Actualizar la app (redeploy)

```bash
cd /var/www/album-fotos
git pull

npm install --prefix backend --omit=dev
bash deploy/scripts/build-production.sh

pm2 restart album-fotos-api
sudo systemctl reload nginx
```

Si cambiaste variables `VITE_*`, el script de build es obligatorio.

---

## Solución de problemas

### La API no responde

```bash
pm2 logs album-fotos-api
curl http://127.0.0.1:4000/api/health
```

Revisa `backend/.env` y los logs de PM2. Si el error menciona PostgreSQL, ve a la sección siguiente.

### Error de conexión a RDS

- Verifica `DATABASE_URL` (usuario, contraseña, endpoint, nombre de DB)
- Confirma `DB_SSL=true` en `backend/.env`
- Security Group de RDS: inbound 5432 desde el Security Group de la EC2
- RDS y EC2 deben estar en la **misma VPC**
- Estado de RDS: **Available** (no `Creating` ni `Stopped`)
- Prueba manual: `psql` desde la EC2 con `?sslmode=require`

### Error 502 en `/api`

- PM2 no está corriendo → `pm2 start ecosystem.config.js`
- Puerto incorrecto → backend debe usar `PORT=4000`

### Las fotos no suben (413 Request Entity Too Large)

En Nginx debe estar:

```nginx
client_max_body_size 105M;
```

Luego: `sudo nginx -t && sudo systemctl reload nginx`

### Subida falla en Cloudinary

- Revisa `CLOUDINARY_*` en `backend/.env`
- Verifica cuota del plan free de Cloudinary

### Frontend carga pero la API falla (CORS / 404)

- `VITE_API_URL` debe ser `/api` en producción
- Recompila: `bash deploy/scripts/build-production.sh`

### Los QR apuntan a localhost

Regenera con la URL correcta:

```bash
FRONTEND_URL=https://tu-dominio.com npm run generar-qr --prefix backend
```

---

## Costos estimados (referencia)

| Recurso | Costo aproximado/mes |
|---------|----------------------|
| EC2 t3.micro | ~$8–10 USD |
| EC2 t3.small | ~$15–18 USD |
| RDS db.t3.micro | ~$15–20 USD |
| Elastic IP | Gratis si está asociada |
| Cloudinary free | $0 (con límites) |
| Dominio | ~$10–15 USD/año |

**Stack completo (EC2 + RDS + Cloudinary free):** ≈ **$25–35 USD/mes**.

---

## Estructura de archivos de deploy en el repo

```
deploy/
├── env/
│   ├── backend.production.example
│   └── frontend.production.example
├── nginx/
│   └── album-fotos.conf
└── scripts/
    ├── build-production.sh
    └── install-server.sh
ecosystem.config.js    # PM2
despliegue.md          # Esta guía
```

---

## Soporte rápido post-evento

Para apagar y no seguir pagando:

1. Descarga el ZIP desde el panel admin
2. Guarda los QR generados
3. **EC2 → Instance state → Stop** (o Terminate si ya no lo necesitas)
4. **RDS → Delete** la instancia (desmarca “Create final snapshot” si no necesitas backup)
