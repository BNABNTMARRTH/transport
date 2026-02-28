const net = require('net');

/**
 * ReversePort Client Agent (Multiplexed)
 * 
 * Uso: node index.js --subdomain benavente --localPort 3000
 */

const subdomain = process.argv.includes('--subdomain') ? process.argv[process.argv.indexOf('--subdomain') + 1] : 'test';
const localPort = process.argv.includes('--localPort') ? parseInt(process.argv[process.argv.indexOf('--localPort') + 1]) : 3000;
const remoteHost = '82.180.160.218';
const remotePort = 8080;

console.log(`--- Iniciando cliente ReversePort (Multiplexed) ---`);
console.log(`Subdominio: ${subdomain}`);
console.log(`Redirigiendo a: localhost:${localPort}`);

// 1. Canal de Control (Mantener la sesión viva)
function connectControl() {
    const controlSocket = net.connect(remotePort, remoteHost, () => {
        console.log('✅ Canal de CONTROL conectado.');
        controlSocket.write(JSON.stringify({ type: 'control', subdomain }));
    });

    controlSocket.on('data', (data) => {
        try {
            const raw = data.toString().trim();
            if (!raw) return;

            const msg = JSON.parse(raw);
            if (msg.type === 'create_connection') {
                console.log(`⚡ Solicitud de conexión: ${msg.requestId}`);
                createDataConnection(msg.requestId);
            }
        } catch (e) {
            // Ignorar errores de parsing menores o fragmentos
        }
    });

    controlSocket.on('close', () => {
        console.log('🔴 Canal de CONTROL cerrado. Reintentando en 5s...');
        setTimeout(connectControl, 5000);
    });

    controlSocket.on('error', (err) => {
        console.error('Error en CONTROL:', err.message);
    });
}

// 2. Canal de Datos (Uno por cada request HTTP del navegador)
function createDataConnection(requestId) {
    const remoteDataSocket = net.connect(remotePort, remoteHost, () => {
        // 2a. Identificarse como canal de datos para un request específico
        remoteDataSocket.write(JSON.stringify({ type: 'data', requestId }));

        // 2b. Conectar al servidor local del usuario
        const localSocket = net.connect(localPort, '127.0.0.1', () => {
            console.log(`🔗 Canal de DATOS activo para request: ${requestId}`);

            // Unimos los dos flujos: Internet <-> Local
            remoteDataSocket.pipe(localSocket).pipe(remoteDataSocket);
        });

        localSocket.on('error', (err) => {
            console.error(`❌ Error conectando a localhost:${localPort}:`, err.message);
            remoteDataSocket.destroy();
        });

        localSocket.on('close', () => {
            remoteDataSocket.destroy();
        });
    });

    remoteDataSocket.on('error', (err) => {
        console.error(`⚠️ Error en canal de datos (${requestId}):`, err.message);
    });

    remoteDataSocket.on('close', () => {
        // Canal terminado
    });
}

connectControl();
