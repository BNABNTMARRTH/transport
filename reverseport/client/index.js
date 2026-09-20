#!/usr/bin/env node
const path = require('path');
const readline = require('readline');
const { ClientConfigBuilder } = require('./config');
const { TunnelStateMachine } = require('./stateMachine');
const { renderToTerminal } = require('./qr');
const {
    CommandDispatcher,
    StartDirectTunnelCommand,
    StartTcpTunnelCommand,
    StartInteractiveTunnelCommand,
    OpenSecurityDocsCommand,
    UninstallCommand,
    ExitCommand
} = require('./commands');

const COLORS = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    blue: '\x1b[34m',
    underline: '\x1b[4m'
};

const PULPEMERGE_BANNER = `
${COLORS.cyan}     .-'''''-.
   .'  _     _  '.    ${COLORS.bright}P U L P E M E R G E${COLORS.reset}${COLORS.cyan} // Emerge a la Superficie
  /   (o)   (o)   \\   ${COLORS.dim}v2.1.0 (GoF Enterprise Edition)${COLORS.reset}${COLORS.cyan}
 |     .-. .-.     |  
  \\   (   '   )   /   ${COLORS.magenta}DX Visual • Traffic Inspector • Mobile Ready${COLORS.reset}${COLORS.cyan}
   '.  \`'--'\`  .'
     /\`/\`--\`\\\`\\
    / /      \\ \\
   '-'        '-'${COLORS.reset}
`;

const REVERSE_BANNER = `
${COLORS.bright}${COLORS.green}⚡ REVERSE${COLORS.reset} ${COLORS.dim}v2.1.0 [DevOps Silent Mode // Low-Latency Engine]${COLORS.reset}
`;

function terminalLink(text, url) {
    return `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\`;
}

class ReversePortCLI {
    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        this.colors = COLORS;

        const binName = path.basename(process.argv[1] || '').toLowerCase();
        this.isReverseMode = binName === 'reverse';

        // Configuración extensible vía Builder Pattern
        this.config = new ClientConfigBuilder()
            .withRemoteHost(process.env.REVERSEPORT_HOST)
            .withRemotePort(process.env.REVERSEPORT_PORT)
            .withApiKey(process.env.REVERSEPORT_KEY)
            .build();

        this.dispatcher = new CommandDispatcher();
        this.currentStateMachine = null;

        this._registerCommands();
    }

    _registerCommands() {
        this.dispatcher.register('1', new StartInteractiveTunnelCommand(this));
        this.dispatcher.register('2', new OpenSecurityDocsCommand(this));
        this.dispatcher.register('3', new UninstallCommand(this));
        this.dispatcher.register('0', new ExitCommand());
    }

    prompt(query) {
        return new Promise(resolve => this.rl.question(query, resolve));
    }

    showMenu() {
        console.clear();
        console.log(this.isReverseMode ? REVERSE_BANNER : PULPEMERGE_BANNER);
        console.log(`${COLORS.bright}[ MENU DE GESTION ]${COLORS.reset}\n`);
        console.log(`${COLORS.cyan}1.${COLORS.reset} Iniciar nuevo túnel HTTP/Web`);
        console.log(`${COLORS.cyan}2.${COLORS.reset} Ver documentación de seguridad`);
        console.log(`${COLORS.cyan}3.${COLORS.reset} Desinstalar herramienta`);
        console.log(`${COLORS.cyan}0.${COLORS.reset} Salir\n`);

        this.rl.question(`${COLORS.bright}> Seleccione una opción: ${COLORS.reset}`, async (opt) => {
            const handled = await this.dispatcher.dispatch(opt.trim());
            if (!handled && opt.trim() !== '1') {
                this.showMenu();
            }
        });
    }

    launchTunnel(subdomain, localPort) {
        if (!this.isReverseMode) {
            console.clear();
            console.log(PULPEMERGE_BANNER);
            console.log(`${COLORS.dim}--- INICIALIZANDO TUNEL HTTP/WEB (GoF SmartBridge) ---${COLORS.reset}`);
            console.log(`${COLORS.bright}Subdominio:${COLORS.reset} ${COLORS.green}${subdomain}${COLORS.reset}`);
            console.log(`${COLORS.bright}Puerto Local:${COLORS.reset} ${COLORS.yellow}${localPort}${COLORS.reset}`);
            console.log(`${COLORS.bright}Servidor Hub:${COLORS.reset} ${COLORS.cyan}${this.config.remoteHost}:${this.config.remotePort}${COLORS.reset}`);
            if (this.config.apiKey) {
                console.log(`${COLORS.bright}API Key:${COLORS.reset} ${COLORS.magenta}activa (Modo VIP)${COLORS.reset}`);
            }
            console.log('');
        }

        this.currentStateMachine = new TunnelStateMachine(this.config, subdomain, localPort);

        this.currentStateMachine.on('tunnel_ready', ({ publicUrl, inspectorUrl }) => {
            if (this.isReverseMode) {
                console.log(`\n${COLORS.green}⚡ [REVERSE] Túnel activo:${COLORS.reset} ${COLORS.bright}${COLORS.cyan}${publicUrl}${COLORS.reset} -> ${COLORS.yellow}127.0.0.1:${localPort}${COLORS.reset}`);
                console.log(`${COLORS.dim}   SSL TLS • GoF SmartBridge • Pool Standby (Presiona 'q' o 'Ctrl+C' para salir)${COLORS.reset}\n`);
                return;
            }

            console.log(`${COLORS.green}[OK] Canal de CONTROL y Object Pool establecidos con éxito.${COLORS.reset}\n`);
            console.log(`${COLORS.bright}🌐 URL PUBLICA SEGURA:${COLORS.reset}`);
            console.log(`   ${COLORS.cyan}${COLORS.bright}${terminalLink(publicUrl, publicUrl)}${COLORS.reset}\n`);

            if (inspectorUrl) {
                console.log(`${COLORS.bright}🔍 INSPECTOR DE TRAFICO LOCAL (Web UI):${COLORS.reset}`);
                console.log(`   ${COLORS.magenta}${terminalLink(inspectorUrl, inspectorUrl)}${COLORS.reset}\n`);
            }

            console.log(`${COLORS.bright}📱 VISTA PREVIA MÓVIL AL INSTANTE:${COLORS.reset}`);
            console.log(`${COLORS.dim}   Escanea este código con la cámara de tu smartphone para probar tu interfaz${COLORS.reset}`);
            console.log(`${COLORS.dim}   responsiva en vivo bajo HTTPS (sin cables ni configuraciones):${COLORS.reset}\n`);
            try {
                const qrRender = renderToTerminal(publicUrl);
                if (qrRender) {
                    console.log(qrRender);
                }
            } catch (e) { }

            console.log(`\n${COLORS.dim}(Presiona 'q' o 'Ctrl+C' para cerrar el túnel y regresar)${COLORS.reset}\n`);
        });

        this.currentStateMachine.on('log', ({ level, message }) => {
            const color = level === 'error' ? COLORS.red : level === 'warn' ? COLORS.yellow : COLORS.dim;
            console.log(`${color}[${level.toUpperCase()}] ${message}${COLORS.reset}`);
        });

        this._setupExitKey();
        this.currentStateMachine.start();
    }

    launchTcpTunnel(localPort, preferredPort = null) {
        if (!this.isReverseMode) {
            console.clear();
            console.log(PULPEMERGE_BANNER);
            console.log(`${COLORS.dim}--- INICIALIZANDO TUNEL TCP PURO (Postgres / MySQL / SSH) ---${COLORS.reset}`);
            console.log(`${COLORS.bright}Puerto Local:${COLORS.reset} ${COLORS.yellow}${localPort}${COLORS.reset}`);
            console.log(`${COLORS.bright}Servidor Hub:${COLORS.reset} ${COLORS.cyan}${this.config.remoteHost}:${this.config.remotePort}${COLORS.reset}`);
            if (this.config.apiKey) {
                console.log(`${COLORS.bright}API Key:${COLORS.reset} ${COLORS.magenta}activa (Modo VIP)${COLORS.reset}`);
            }
            console.log('');
        }

        this.currentStateMachine = new TunnelStateMachine(this.config, 'tcp', localPort, {
            isTcp: true,
            preferredPort
        });

        this.currentStateMachine.on('tcp_ready', ({ publicPort, publicHost, localPort }) => {
            if (this.isReverseMode) {
                console.log(`\n${COLORS.green}🔌 [REVERSE] TCP activo:${COLORS.reset} ${COLORS.bright}${COLORS.cyan}${publicHost}:${publicPort}${COLORS.reset} -> ${COLORS.yellow}127.0.0.1:${localPort}${COLORS.reset}`);
                console.log(`${COLORS.dim}   (Presiona 'q' o 'Ctrl+C' para salir)${COLORS.reset}\n`);
                return;
            }

            console.log(`${COLORS.green}[OK] Canal TCP establecido con éxito.${COLORS.reset}\n`);
            console.log(`${COLORS.bright}🔌 ACCESO TCP PUBLICO ACTIVO:${COLORS.reset}`);
            console.log(`   ${COLORS.cyan}${COLORS.bright}${publicHost}:${publicPort}${COLORS.reset} -> ${COLORS.yellow}127.0.0.1:${localPort}${COLORS.reset}\n`);

            console.log(`${COLORS.bright}EJEMPLOS DE CONEXION:${COLORS.reset}`);
            console.log(`   ${COLORS.dim}PostgreSQL:${COLORS.reset} psql -h ${publicHost} -p ${publicPort} -U tu_usuario`);
            console.log(`   ${COLORS.dim}SSH / Raw:${COLORS.reset}  ssh -p ${publicPort} tu_usuario@${publicHost}\n`);

            console.log(`${COLORS.dim}(Presiona 'q' o 'Ctrl+C' para cerrar el túnel y regresar)${COLORS.reset}\n`);
        });

        this.currentStateMachine.on('log', ({ level, message }) => {
            const color = level === 'error' ? COLORS.red : level === 'warn' ? COLORS.yellow : COLORS.dim;
            console.log(`${color}[${level.toUpperCase()}] ${message}${COLORS.reset}`);
        });

        this._setupExitKey();
        this.currentStateMachine.start();
    }

    _setupExitKey() {
        readline.emitKeypressEvents(process.stdin);
        if (process.stdin.isTTY) process.stdin.setRawMode(true);

        const keyHandler = (str, key) => {
            if (key && (key.name === 'q' || key.name === 'escape' || (key.ctrl && key.name === 'c'))) {
                console.log(`\n${COLORS.yellow}[SISTEMA] Cerrando túnel de forma segura...${COLORS.reset}`);
                process.stdin.removeListener('keypress', keyHandler);
                if (process.stdin.isTTY) process.stdin.setRawMode(false);
                if (this.currentStateMachine) this.currentStateMachine.stop();
                if (this.isReverseMode) {
                    process.exit(0);
                } else {
                    setTimeout(() => this.showMenu(), 800);
                }
            }
        };

        process.stdin.on('keypress', keyHandler);
    }

    async run() {
        const args = process.argv.slice(2);

        // Parsear flag --key <apiKey> o -k <apiKey>
        const keyIdx = args.findIndex(a => a === '--key' || a === '-k');
        if (keyIdx !== -1 && args[keyIdx + 1]) {
            this.config = new ClientConfigBuilder()
                .withRemoteHost(this.config.remoteHost)
                .withRemotePort(this.config.remotePort)
                .withApiKey(args[keyIdx + 1])
                .build();
            args.splice(keyIdx, 2);
        }

        // Parsear flag --tcp <puertoLocal> [puertoRemotoDeseado]
        const tcpIdx = args.findIndex(a => a === '--tcp' || a === '-t');
        if (tcpIdx !== -1) {
            const tcpPort = parseInt(args[tcpIdx + 1]);
            if (isNaN(tcpPort)) {
                console.error(`${COLORS.red}[ERROR] Debes especificar un puerto local para el túnel TCP. Ej: pulpemerge --tcp 5432${COLORS.reset}`);
                process.exit(1);
            }
            const preferredPort = parseInt(args[tcpIdx + 2]) || null;
            const tcpCmd = new StartTcpTunnelCommand(this, tcpPort, preferredPort);
            return tcpCmd.execute();
        }

        // Soporte para argumentos directos: pulpemerge <puerto> [subdominio]
        const argPort = parseInt(args[0]);
        if (!isNaN(argPort)) {
            const argSubdomain = args[1] || 'dev-' + Math.floor(Math.random() * 10000);
            const directCmd = new StartDirectTunnelCommand(this, argPort, argSubdomain);
            return directCmd.execute();
        }

        this.showMenu();
    }
}

if (require.main === module) {
    process.on('uncaughtException', (err) => {
        if (err && (err.code === 'ECONNRESET' || err.code === 'EPIPE' || err.code === 'ETIMEDOUT')) {
            return; // Red transitoria manejada por la máquina de estados de reconexión
        }
        console.error(`${COLORS.red}[FATAL] ${err.message}${COLORS.reset}`);
    });

    const cli = new ReversePortCLI();
    cli.run().catch(err => {
        console.error(`${COLORS.red}[FATAL] ${err.message}${COLORS.reset}`);
    });
}

module.exports = { ReversePortCLI };
