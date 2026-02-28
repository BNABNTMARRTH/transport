# Implementation Plan: ReversePort (Multi-usuario)

Este proyecto consiste en crear un servicio similar a ngrok que permita a múltiples usuarios exponer sus puertos locales a través de URLs públicas.

## User Review Required

> [!IMPORTANT]
> Para que esto funcione en "la vida real", necesitarás un servidor con una IP pública y un dominio propio. Sin esto, el túnel solo funcionará en tu red local.

> [!TIP]
> Para el soporte multi-usuario, usaremos "subdominios" (ej. `usuario1.tudominio.com`, `usuario2.tudominio.com`). Esto requiere configurar registros wildcard DNS (`*.tudominio.com`).

## Proposed Changes

### 1. Servidor (The Hub)
El servidor vivirá en la nube y será el punto de entrada para el tráfico público.

- **Componente**: `tunnel-server`
- **Tecnología**: Node.js (Net module para TCP y Express para manejo de subdominios).
- **Lógica**:
    - Escuchar conexiones de **múltiples clientes** simultáneamente.
    - Identificar a cada cliente mediante un **API Key**.
    - Asignar un subdominio único basado en el usuario (ej. `pato-rojo.tudominio.com`).
    - **Routing dinámico**: Recibir peticiones HTTP, identificar el subdominio y mandar la data al socket del cliente correspondiente.

### 2. Cliente (The Agent)
Es el programa que el usuario corre en su compu.

- **Componente**: `tunnel-client`
- **Tecnología**: Node.js CLI.
- **Lógica**:
    - Conectarse al servidor central enviando su **API Key**.
    - Recibir los datos que el servidor le manda.
    - Reenviarlos al puerto local (ej. `localhost:3000`).
    - Mandar la respuesta de regreso al servidor.

## Deployment Strategy (Hostinger VPS)

### Paso 1: Configuración de DNS en Hostinger
1. Ir a la sección de **Dominios** -> `reverseport.net` -> **DNS / Nameservers**.
2. Crear un registro **A** que apunte a la IP de tu VPS (ej. `reverseport.net` -> `IP_DEL_VPS`).
3. **CRUCIAL**: Crear un registro **A** tipo "Wildcard":
    - Nombre: `*`
    - IP: `IP_DEL_VPS`
    - TTL: `3600` (o el por defecto).

### Paso 2: Preparación del VPS
1. Acceder por SSH al VPS.
2. Instalar Node.js (si no está): `curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs`.
3. Instalar PM2: `sudo npm install -g pm2`.
4. Abrir los puertos en el firewall (UFW):
    - `sudo ufw allow 80/tcp` (HTTP Público)
    - `sudo ufw allow 8080/tcp` (Conexión de Túneles)

### Paso 3: Despliegue del Código
1. Subir la carpeta `server/` al VPS.
2. Correr `npm install`.
3. Iniciar con PM2: `pm2 start index.js --name "reverseport-server"`.

## Verification Plan

### Automated Tests
- Simular conexiones concurrentes de dos clientes distintos.
- Enviar requests a diferentes subdominios y verificar que lleguen a los clientes correctos.

### Manual Verification
1. Correr el `tunnel-server` localmente.
2. Correr dos servidores "Hola Mundo" en puertos distintos (ej. 3000 y 4000).
3. Correr dos instancias del `tunnel-client` con diferentes API Keys.
4. Verificar que cada URL pública muestre el contenido del puerto local correcto.
