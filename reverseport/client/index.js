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

// 1. Canal de Control
function connectControl() {
    const controlSocket = net.connect(remotePort, remoteHost, () => {
        console.log('✅ Canal de CONTROL conectado.');
        controlSocket.write(JSON.stringify({ type: 'control', subdomain }));
    });

    controlSocket.on('data', (data) => {
        try {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'create_connection') {
                console.log(`📡 Solicitud de conexión: ${msg.requestId}`);
                createDataConnection(msg.requestId);
            }
        } catch (e) {
            console.error('Error en mensaje de control:', e.message);
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

// 2. Canal de Datos (uno por cada request HTTP)
function createDataConnection(requestId) {
    const remoteDataSocket = net.connect(remotePort, remoteHost, () => {
        // Primero nos identificamos como canal de datos
        remoteDataSocket.write(JSON.stringify({ type: 'data', requestId }));

        // Luego conectamos al puerto local (usamos 127.0.0.1 para evitar rollos de localhost)
        const localSocket = net.connect(localPort, '127.0.0.1', () => {
            remoteDataSocket.pipe(localSocket).pipe(remoteDataSocket);
        });

        localSocket.on('error', (err) => {
            console.error(`❌ Error conectando al puerto local ${localPort}:`, err.message);
            remoteDataSocket.destroy();
        });
    });

    remoteDataSocket.on('error', (err) => {
        console.error('Error en DATA channel:', err.message);
    });
}

connectControl();
