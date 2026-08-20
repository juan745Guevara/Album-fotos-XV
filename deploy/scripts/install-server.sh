#!/usr/bin/env bash
# Ejecutar en Ubuntu 22.04 como root o con sudo:
#   curl -fsSL ... | bash   (o clonar el repo y ejecutar este script)
set -euo pipefail

echo "==> Actualizando paquetes..."
apt-get update
apt-get upgrade -y

echo "==> Instalando utilidades base..."
apt-get install -y curl git nginx certbot python3-certbot-nginx ufw

echo "==> Instalando Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

echo "==> Instalando PM2..."
npm install -g pm2

echo "==> Configurando firewall..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo "==> Listo. Node: $(node -v) | npm: $(npm -v) | PM2: $(pm2 -v)"
