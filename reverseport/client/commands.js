const { exec } = require('child_process');
const readline = require('readline');
const { TunnelStateMachine } = require('./stateMachine');

/**
 * Command Interface (GoF Behavioral - Command Pattern)
 */
class Command {
    async execute() {
        throw new Error('Method execute() must be implemented');
    }
}

class StartDirectTunnelCommand extends Command {
    constructor(cliContext, port, subdomain) {
        super();
        this.cliContext = cliContext;
        this.port = port;
        this.subdomain = subdomain;
    }

    async execute() {
        return this.cliContext.launchTunnel(this.subdomain, this.port);
    }
}

class StartTcpTunnelCommand extends Command {
    constructor(cliContext, port, preferredPort = null) {
        super();
        this.cliContext = cliContext;
        this.port = port;
        this.preferredPort = preferredPort;
    }

    async execute() {
        return this.cliContext.launchTcpTunnel(this.port, this.preferredPort);
    }
}

class StartInteractiveTunnelCommand extends Command {
    constructor(cliContext) {
        super();
        this.cliContext = cliContext;
    }

    async execute() {
        const { rl, colors } = this.cliContext;
        console.log(`\n${colors.bright}[ CONFIGURACION DEL TUNEL ]${colors.reset}\n`);

        const subdomain = await this.cliContext.prompt(`${colors.cyan}> Subdominio deseado (enter para aleatorio): ${colors.reset}`);
        const portStr = await this.cliContext.prompt(`${colors.cyan}> Puerto local (defecto: 3000): ${colors.reset}`);
        const localPort = parseInt(portStr) || 3000;
        const finalSubdomain = subdomain.trim() || 'dev-' + Math.floor(Math.random() * 10000);

        return this.cliContext.launchTunnel(finalSubdomain, localPort);
    }
}

class OpenSecurityDocsCommand extends Command {
    constructor(cliContext) {
        super();
        this.cliContext = cliContext;
    }

    async execute() {
        const { colors, config } = this.cliContext;
        const url = `https://${config.rootDomain}/security`;
        console.log(`\nAbriendo documentación: ${colors.blue}${url}${colors.reset}`);

        const startCmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
        exec(`${startCmd} ${url}`);
        return new Promise(resolve => setTimeout(resolve, 2000));
    }
}

class UninstallCommand extends Command {
    constructor(cliContext) {
        super();
        this.cliContext = cliContext;
    }

    async execute() {
        const { colors } = this.cliContext;
        const answer = await this.cliContext.prompt(`\n${colors.red}${colors.bright}¿Está seguro de desinstalar reversePort? (s/n): ${colors.reset}`);

        if (answer.toLowerCase() === 's') {
            console.log(`\n${colors.yellow}[SISTEMA] Desinstalando binarios globales...${colors.reset}`);
            return new Promise((resolve) => {
                exec('sudo npm uninstall -g rport-go', (err) => {
                    if (err) {
                        console.error(`${colors.red}[ERROR] No se pudo desinstalar: ${err.message}${colors.reset}`);
                    } else {
                        console.log(`${colors.green}[OK] reversePort ha sido eliminado.${colors.reset}`);
                    }
                    process.exit(0);
                });
            });
        }
    }
}

class ExitCommand extends Command {
    async execute() {
        process.exit(0);
    }
}

/**
 * CommandDispatcher / Invoker
 */
class CommandDispatcher {
    constructor() {
        this.commands = new Map();
    }

    register(key, command) {
        this.commands.set(key, command);
    }

    async dispatch(key) {
        const cmd = this.commands.get(key);
        if (cmd) {
            return await cmd.execute();
        }
        return false;
    }
}

module.exports = {
    Command,
    StartDirectTunnelCommand,
    StartTcpTunnelCommand,
    StartInteractiveTunnelCommand,
    OpenSecurityDocsCommand,
    UninstallCommand,
    ExitCommand,
    CommandDispatcher
};
