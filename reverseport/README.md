# ReversePort 🚀

ReversePort es un servicio ligero de túneles reversos multi-usuario construido con Node.js. Te permite exponer puertos locales (como `localhost:3000`) al internet público a través de subdominios personalizados (ej. `tu-nombre.reverseport.net`).

## Características
- **Diseño Multiplexado**: Utiliza canales de Control y Datos separados para manejar múltiples peticiones simultáneas de forma confiable.
- **Enrutamiento por Subdominios**: Direcciona el tráfico dinámicamente basado en la cabecera Host de la petición.
- **Proxy TCP Crudo (Raw)**: Salta el procesamiento complejo de HTTP para máxima velocidad y estabilidad.
- **Soporte Multi-usuario**: Conecta múltiples clientes al mismo tiempo con subdominios únicos.

## Arquitectura
- **Servidor (El Hub)**: Corre en un VPS con IP pública. Escucha conexiones de túnel en el puerto 8080 y tráfico web público en el puerto 80.
- **Cliente (El Agente)**: Corre en tu máquina local. Se conecta al Hub y redirige el tráfico a tu puerto local.

## Configuración

### Servidor
1. Apunta los registros A de tu dominio (incluyendo un wildcard `*`) a la IP de tu VPS.
2. Instala Node.js y PM2.
3. Ejecuta `npm install` en el directorio `server`.
4. Inicia con `pm2 start index.js --name "reverseport-server"`.

### Cliente
1. Ejecuta `npm install` en el directorio `client`.
2. Inicia el túnel:
   ```bash
   node index.js --subdomain tu-nombre --localPort 3000
   ```
3. Accede a tu app en `http://tu-nombre.tudominio.com`.

## Pendientes (To-Do)
- [ ] Soporte SSL/TLS (HTTPS) con Certbot.
- [ ] Autenticación por API Key para seguridad.
- [ ] Dashboard web para monitorear los túneles activos.

---
Construido -- by_benavente.
