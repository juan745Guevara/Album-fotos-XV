# Guía de despliegue en Amazon AWS

Guía paso a paso para publicar el **Álbum de Fotos XV** en producción usando **EC2 + Amazon RDS + Amazon S3 + Nginx + PM2**.

---

## Orden exacto (rápido)

Sigue este orden sin saltarte pasos:

1. Crear **EC2** (Ubuntu, puertos 22/80/443) y conectarte por SSH.
2. Crear **RDS PostgreSQL** (misma VPC) y abrir 5432 solo desde el Security Group de EC2.
3. Crear **S3 bucket** y configurar policy + usuario de acceso programático.
4. Clonar repo en EC2 y dar permisos a `/var/www`.
5. Configurar `backend/.env` y `frontend/.env` de producción.
6. Instalar dependencias, correr `seed`, compilar frontend.
7. Levantar API con PM2.
8. Configurar Nginx (`/` frontend y `/api` backend).
9. Configurar dominio y SSL con Certbot.
10. Probar app completa y generar QR finales con dominio real.

Comandos mínimos del flujo:

```bash
sudo mkdir -p /var/www && sudo chown -R ubuntu:ubuntu /var/www
cd /var/www && git clone https://github.com/juan745Guevara/Album-fotos-XV.git
cd /var/www/Album-fotos-XV

sudo bash deploy/scripts/install-server.sh
cp deploy/env/backend.production.example backend/.env
cp deploy/env/frontend.production.example frontend/.env

npm install --prefix backend --omit=dev
npm run seed --prefix backend
bash deploy/scripts/build-production.sh

pm2 start ecosystem.config.js && pm2 save
sudo cp deploy/nginx/album-fotos.conf /etc/nginx/sites-available/album-fotos
sudo ln -sf /etc/nginx/sites-available/album-fotos /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

FRONTEND_URL=https://tu-dominio.com npm run generar-qr --prefix backend
```

---

## Resumen de servicios

| Servicio | Obligatorio | Para qué |
|----------|-------------|----------|
| **Amazon EC2** | Sí | Servidor: API Node.js, frontend estático, Nginx |
| **Amazon RDS (PostgreSQL)** | Sí | Base de datos: mesas, fotos, admin |
| **Amazon S3** | Sí | Almacenamiento de fotos |
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
         Amazon RDS            Amazon S3
         (PostgreSQL)           (fotos)
```

---

## Requisitos previos

Antes de empezar, ten listo:

1. Cuenta en [AWS](https://aws.amazon.com)
2. Repositorio del proyecto en GitHub (o forma de subir código al servidor)
3. Dominio (opcional pero recomendado para los QR impresos)
4. Par de claves SSH para conectarte a la EC2

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

## Parte 3 — Amazon S3 (fotos)

Las imágenes se guardan en **S3**, no en la EC2. Estructura: `album-evento/mesa-1/`, `mesa-2/`, etc.

### 3.1 Crear el bucket

1. **AWS Console → S3 → Create bucket**
2. Configuración sugerida:

| Campo | Valor |
|-------|-------|
| Bucket name | `album-fotos-xv-prod` (único globalmente) |
| Region | La misma que tu EC2/RDS (ej. `us-east-1`) |
| Block Public Access | Desactiva solo si usarás lectura pública del prefijo `album-evento/` (ver abajo) |
| Versioning | Opcional |

### 3.2 Política de lectura pública (prefijo album-evento)

Para que invitados vean fotos en el navegador, el prefijo `album-evento/*` debe ser legible públicamente.

**Bucket → Permissions → Bucket policy:**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadAlbumEvento",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::album-fotos-xv-prod/album-evento/*"
    }
  ]
}
```

> Cambia `album-fotos-xv-prod` por el nombre de tu bucket. Si Block Public Access está activo, desmarca “Block all public access” o la policy no aplicará.

### 3.3 Usuario IAM (Access Key) para S3

Aquí se usa un **usuario IAM** con claves de acceso programático:

1. **IAM → Users → Create user**
2. Marca **Provide user access to the AWS Management Console: Off** (solo programático).
3. En permisos, adjunta una policy inline (ajusta bucket y región):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::album-fotos-xv-prod/album-evento/*"
    }
  ]
}
```

4. Crea y guarda la **Access key** y **Secret access key** (se muestran una sola vez).

### 3.4 Variables en backend/.env

```env
AWS_REGION=us-east-1
AWS_S3_BUCKET=album-fotos-xv-prod
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
```

Opcional con **CloudFront** (CDN):

```env
AWS_S3_PUBLIC_URL=https://d123456abcdef.cloudfront.net
```

### 3.5 Desarrollo local

Usa las mismas variables AWS en `backend/.env`.

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
| `AWS_REGION` | `us-east-1` | Región del bucket |
| `AWS_S3_BUCKET` | `album-fotos-xv-prod` | Nombre del bucket |
| `AWS_S3_PUBLIC_URL` | — | Opcional (CloudFront) |
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
- [ ] Bucket S3 creado con policy de lectura en `album-evento/*`
- [ ] Usuario IAM creado con permisos Put/Get/Delete en S3
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

### Subida falla en S3

- Verifica `AWS_S3_BUCKET` y `AWS_REGION` en `backend/.env`
- Revisa `AWS_ACCESS_KEY_ID` y `AWS_SECRET_ACCESS_KEY` en `backend/.env`
- Bucket policy: lectura pública en `album-evento/*` para ver fotos en el navegador
- Policy del usuario: `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` en el prefijo

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
| S3 (pocas GB) | ~$0.50–2 USD |
| Dominio | ~$10–15 USD/año |

**Stack completo (EC2 + RDS + S3):** ≈ **$25–38 USD/mes**.

---

## Estructura de archivos de deploy en el repo

```
deploy/
├── env/
│   ├── backend.production.example
│   └── frontend.production.example
├── nginx/
│   └── album-fotos.conf
├── s3/
│   ├── bucket-policy.example.json
│   └── iam-user-policy.example.json
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
