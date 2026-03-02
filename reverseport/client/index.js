#!/usr/bin/env node
const net = require('net');
const readline = require('readline');

/**
 * reversePort CLI Agent
 * High-performance reverse tunnel client
 */

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const remoteHost = '82.180.160.218';
const remotePort = 8080;

const COLORS = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    blue: '\x1b[34m'
};

const ASCII_ART = `
${COLORS.magenta}   +-----------------------------------------------------------+
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
   |                      TERMINAL ABISAL                      |
   |                          v1.0.0                           |
   +-----------------------------------------------------------+${COLORS.reset}
`;

async function main() {
    // Si se pasan argumentos directos, saltamos el menú
    if (process.argv[2]) {
        return startDirectTunnel();
    }

    showMenu();
}

function showMenu() {
    console.clear();
    console.log(ASCII_ART);
    console.log(`${COLORS.bright}[ MENU DE GESTION ]${COLORS.reset}\n`);
    console.log(`${COLORS.cyan}1.${COLORS.reset} Iniciar nuevo túnel`);
    console.log(`${COLORS.cyan}2.${COLORS.reset} Ver documentación de seguridad`);
    console.log(`${COLORS.cyan}3.${COLORS.reset} Desinstalar reversePort`);
    console.log(`${COLORS.cyan}0.${COLORS.reset} Salir\n`);

    rl.question(`${COLORS.bright}> Seleccione una opción: ${COLORS.reset}`, async (opt) => {
        switch (opt) {
            case '1':
                await startInteractiveTunnel();
                break;
            case '2':
                console.log(`\nVisita: ${COLORS.blue}https://reverseport.net/security${COLORS.reset}`);
                setTimeout(showMenu, 3000);
                break;
            case '3':
                confirmUninstallation();
                break;
            case '0':
                process.exit(0);
                break;
            default:
                showMenu();
        }
    });
}

async function startDirectTunnel() {
    console.clear();
    console.log(ASCII_ART);
    let localPort = parseInt(process.argv[2]);
    let subdomain = process.argv[3] || 'dev-' + Math.floor(Math.random() * 1000);

    if (isNaN(localPort)) {
        console.error(`${COLORS.red}[ERROR] El puerto debe ser un número.${COLORS.reset}`);
        process.exit(1);
    }

    executeTunnel(subdomain, localPort);
}

async function startInteractiveTunnel() {
    console.log(`\n${COLORS.bright}[ CONFIGURACION ]${COLORS.reset}\n`);
    const subdomain = await askQuestion(`${COLORS.cyan}> Subdominio deseado: ${COLORS.reset}`);
    const localPortStr = await askQuestion(`${COLORS.cyan}> Puerto local (defecto: 3000): ${COLORS.reset}`);
    const localPort = parseInt(localPortStr) || 3000;

    executeTunnel(subdomain || 'dev-' + Math.floor(Math.random() * 1000), localPort);
}

function confirmUninstallation() {
    rl.question(`\n${COLORS.red}${COLORS.bright}¿Esta seguro de desinstalar reversePort? (s/n): ${COLORS.reset}`, (ans) => {
        if (ans.toLowerCase() === 's') {
            console.log(`\n${COLORS.yellow}[SISTEMA] Eliminando binarios globales...${COLORS.reset}`);
            const { exec } = require('child_process');
            exec('sudo npm uninstall -g reverseport-client', (err) => {
                if (err) {
                    console.error(`${COLORS.red}[ERROR] No se pudo desinstalar: ${err.message}${COLORS.reset}`);
                } else {
                    console.log(`${COLORS.green}[OK] reversePort ha sido eliminado.${COLORS.reset}`);
                }
                process.exit(0);
            });
        } else {
            showMenu();
        }
    });
}

function askQuestion(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

function executeTunnel(subdomain, localPort) {
    console.log(`\n${COLORS.dim}--- ESTABLECIENDO CONEXION ---${COLORS.reset}`);
    console.log(`${COLORS.bright}Subdominio:${COLORS.reset} ${COLORS.green}${subdomain}${COLORS.reset}`);
    console.log(`${COLORS.bright}Local Port:${COLORS.reset} ${COLORS.yellow}${localPort}${COLORS.reset}\n`);

    function connectControl() {
        const controlSocket = net.connect(remotePort, remoteHost, () => {
            console.log(`${COLORS.green}[OK] Canal de CONTROL establecido.${COLORS.reset}`);
            console.log(`\n${COLORS.bright}ACCESO PUBLICO ACTIVO:${COLORS.reset}`);
            console.log(`${COLORS.blue}https://${subdomain}.reverseport.net${COLORS.reset}\n`);

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
                    console.error(`${COLORS.red}[ERROR] ${msg.message}${COLORS.reset}`);
                    process.exit(1);
                }
            } catch (e) { }
        });

        controlSocket.on('close', () => {
            console.log(`${COLORS.red}[DISCONNECTED] Canal de CONTROL cerrado. Reintentando...${COLORS.reset}`);
            setTimeout(connectControl, 5000);
        });

        controlSocket.on('error', () => { });
    }

    function createDataConnection(requestId, port) {
        const remoteDataSocket = net.connect(remotePort, remoteHost, () => {
            remoteDataSocket.write(JSON.stringify({ type: 'data', requestId }));

            const localSocket = net.connect(port, '127.0.0.1', () => {
                remoteDataSocket.pipe(localSocket).pipe(remoteDataSocket);
            });

            localSocket.on('error', () => {
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

main().catch(err => {
    console.error(`${COLORS.red}[FATAL] ${err.message}${COLORS.reset}`);
});
