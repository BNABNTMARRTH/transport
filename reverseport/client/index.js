const net = require('net');
const readline = require('readline');

/**
 * reversePort Client Agent (Guided & Multiplexed)
 */

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const remoteHost = '82.180.160.218';
const remotePort = 8080;

const ASCII_ART = `
\x1b[35m   +-----------------------------------------------------------+
   |                                                           |
   |  ██████╗ ███████╗██╗   ██╗███████╗██████╗ ███████╗███████╗|
   |  ██╔══██╗██╔════╝██║   ██║██╔════╝██╔══██╗██╔════╝██╔════╝|
   |  ██████╔╝█████╗  ██║   ██║█████╗  ██████╔╝███████╗█████╗  |
   |  ██╔══██╗██╔══╝  ╚██╗ ██╔╝██╔══╝  ██╔══██╗╚════██║██╔══╝  |
   |  ██║  ██║███████╗ ╚████╔╝ ███████╗██║  ██║███████║███████╗|
   |  ╚═╝  ╚═╝╚══════╝  ╚═══╝  ╚══════╝╚═╝  ╚═╝╚══════╝╚══════╝|
   |                                                           |
   |            ██████╗  ██████╗ ██████╗ ████████╗             |
   |            ██╔══██╗██╔═══██╗██╔══██╗╚══██╔══╝             |
   |            ██████╔╝██║   ██║██████╔╝   ██║                |
   |            ██╔═══╝ ██║   ██║██╔══██╗   ██║                |
   |            ██║     ╚██████╔╝██║  ██║   ██║                |
   |            ╚═╝      ╚═════╝ ╚═╝  ╚═╝   ╚═╝                |
   |                                                           |
   |                        A B I S M O                        |
   |                          v0.1.0                           |
   +-----------------------------------------------------------+\x1b[0m
`;

console.clear();
console.log(ASCII_ART);

async function start() {
    let subdomain = process.argv.includes('--subdomain') ? process.argv[process.argv.indexOf('--subdomain') + 1] : null;
    let localPort = process.argv.includes('--localPort') ? parseInt(process.argv[process.argv.indexOf('--localPort') + 1]) : null;

    if (!subdomain) {
        subdomain = await new Promise(resolve => rl.question('\x1b[36m🐙 Elige tu subdominio (ej. mi-proyecto): \x1b[0m', resolve));
    }
    if (!localPort) {
        const portStr = await new Promise(resolve => rl.question('\x1b[36m🔌 Puerto local a exponer (ej. 3000): \x1b[0m', resolve));
        localPort = parseInt(portStr) || 3000;
    }

    if (!subdomain) subdomain = 'test-' + Math.floor(Math.random() * 1000);

    console.log(`\n\x1b[35m--- Iniciando túnel reversePort ---\x1b[0m`);
    console.log(`Subdominio: \x1b[32m${subdomain}\x1b[0m`);
    console.log(`Redirigiendo a: \x1b[33mlocalhost:${localPort}\x1b[0m\n`);

    const controlConnections = new Map();
    const pendingRequests = new Map();

    function connectControl() {
        const controlSocket = net.connect(remotePort, remoteHost, () => {
            console.log('\x1b[32m✅ Canal de CONTROL conectado satisfactoriamente.\x1b[0m');
            console.log(`\n✨ Tu puerto ya es público en:`);
            console.log(`👉 \x1b[1m\x1b[34mhttps://${subdomain}.reverseport.net\x1b[0m\n`);

            controlSocket.write(JSON.stringify({ type: 'control', subdomain }));
        });

        controlSocket.on('data', (data) => {
            try {
                const raw = data.toString().trim();
                if (!raw) return;
                const msg = JSON.parse(raw);

                if (msg.type === 'create_connection') {
                    createDataConnection(msg.requestId, localPort);
                } else if (msg.type === 'error') {
                    console.error(`\x1b[31m❌ Error del servidor: ${msg.message}\x1b[0m`);
                    process.exit(1);
                }
            } catch (e) { }
        });

        controlSocket.on('close', () => {
            console.log('\x1b[31m🔴 Canal de CONTROL cerrado. Reintentando en 5s...\x1b[0m');
            setTimeout(connectControl, 5000);
        });

        controlSocket.on('error', (err) => {
            // Error silenciado si es caída de red, el listener 'close' manejará el reintento
        });
    }

    function createDataConnection(requestId, port) {
        const remoteDataSocket = net.connect(remotePort, remoteHost, () => {
            remoteDataSocket.write(JSON.stringify({ type: 'data', requestId }));

            const localSocket = net.connect(port, '127.0.0.1', () => {
                remoteDataSocket.pipe(localSocket).pipe(remoteDataSocket);
            });

            localSocket.on('error', (err) => {
                remoteDataSocket.destroy();
            });

            localSocket.on('close', () => {
                remoteDataSocket.destroy();
            });
        });

        remoteDataSocket.on('error', () => { });
    }

    connectControl();
}

start();
