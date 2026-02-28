#!/bin/bash

# --- ReversePort VPS Setup Script ---

echo "🚀 Iniciando configuración de ReversePort en el VPS..."

# 1. Actualizar el sistema
sudo apt-get update && sudo apt-get upgrade -y

# 2. Instalar Node.js (especificamos la versión 20.x)
echo "📦 Instalando Node.js..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 3. Instalar PM2 para mantener el proceso vivo
echo "⚙️ Instalando PM2..."
sudo npm install -g pm2

# 4. Configurar el Firewall (UFW)
echo "🛡️ Configurando Firewall..."
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 8080/tcp
sudo ufw --force enable

# 5. Crear carpeta del proyecto
mkdir -p ~/reverseport/server

echo "✅ ¡Configuración inicial lista!"
echo "Ahora puedes subir el archivo index.js y package.json a ~/reverseport/server"
