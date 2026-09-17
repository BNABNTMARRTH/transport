#!/bin/bash
set -e

VPS_IP="82.180.160.218"
BASE_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "🚀 Iniciando despliegue de ReversePort (GoF Architecture & Features 1, 2, 4, 5) al VPS Hostinger ($VPS_IP)..."

# 1. Asegurar directorios remotos
echo "📁 Creando estructura de directorios en el VPS..."
ssh -o StrictHostKeyChecking=no root@$VPS_IP "mkdir -p ~/reverseport/shared ~/reverseport/server ~/reverseport/server/data ~/reverseport/website ~/reverseport/client"

# 2. Copiar archivos del núcleo refactorizado
echo "📤 Subiendo protocolo (Adapter Pattern)..."
scp "$BASE_DIR/shared/protocol.js" root@$VPS_IP:~/reverseport/shared/

echo "📤 Subiendo servidor (Registry, Facade, Pipeline, Auth, TcpHub, Index)..."
scp "$BASE_DIR/server/"*.js root@$VPS_IP:~/reverseport/server/
scp "$BASE_DIR/server/package.json" root@$VPS_IP:~/reverseport/server/

echo "📤 Subiendo cliente actualizado (Inspector, QR, Commands, StateMachine)..."
scp "$BASE_DIR/client/"*.js root@$VPS_IP:~/reverseport/client/

echo "📤 Subiendo frontend / landing page bioluminiscente..."
scp "$BASE_DIR/website/"*.html "$BASE_DIR/website/"*.css "$BASE_DIR/website/"*.js "$BASE_DIR/website/"*.sh root@$VPS_IP:~/reverseport/website/
scp -r "$BASE_DIR/website/assets" root@$VPS_IP:~/reverseport/website/

# 3. Reiniciar proceso en PM2
echo "⚙️ Reiniciando proceso en PM2..."
ssh -o StrictHostKeyChecking=no root@$VPS_IP "cd ~/reverseport/server && npm install --production --silent 2>/dev/null || true; pm2 restart reverseport-server || pm2 restart all"

echo "🔍 Comprobando estado del proceso PM2..."
ssh -o StrictHostKeyChecking=no root@$VPS_IP "pm2 status reverseport-server"

echo "✅ ¡Despliegue completado exitosamente en Hostinger!"
echo "Verifica el estado en: https://reverseport.net"
