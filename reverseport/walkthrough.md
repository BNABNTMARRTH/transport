# Walkthrough: ReversePort Local Prototype

Hemos logrado implementar la base técnica de **ReversePort**. Aquí te muestro cómo funciona el "tubo" de datos localmente.

## Estructura del Proyecto
- `server/`: El hub central (el que irá al VPS).
- `client/`: El agente que corre en tu compu.

## Pruebas Realizadas

### 1. Servidor Central
El servidor levanta dos escuchas:
- **Puerto 8080 (TCP)**: Para que los clientes se conecten.
- **Puerto 80 (HTTP)**: Para recibir las visitas de la web.

### 2. Cliente (Agente)
El cliente se conecta al servidor indicando su subdominio.
```bash
node index.js --subdomain naza --localPort 3000
```

## Estado Actual: ¡EN VIVO! 🚀
El servidor central ya está operando en el VPS de Hostinger (**82.180.160.218**). El dominio `reverseport.net` y sus subdominios ya están apuntando correctamente.

## Próximos Pasos
1. **Prueba Real**: Correr el cliente localmente y conectarlo a la IP del VPS.
2. **Refinar la Multiplexación**: Asegurarnos de que múltiples requests no se mezclen en el mismo socket.
3. **Seguridad**: Implementar SSL/TLS y API Keys.

---
**ReversePort** ya es una realidad en la nube. ¡Felicidades! ☁️🔥
