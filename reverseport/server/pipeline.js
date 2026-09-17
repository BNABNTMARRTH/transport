const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();

/**
 * BaseHandler (GoF Behavioral - Chain of Responsibility Pattern)
 */
class BaseHandler {
    constructor() {
        this.nextHandler = null;
    }

    setNext(handler) {
        this.nextHandler = handler;
        return handler;
    }

    handle(context) {
        if (this.nextHandler) {
            return this.nextHandler.handle(context);
        }
        return false;
    }
}

/**
 * SecurityFilterHandler:
 * Valida y protege contra el uso de subdominios reservados para phishing o spoofing.
 */
class SecurityFilterHandler extends BaseHandler {
    constructor(reservedSet, rootDomain = 'reverseport.net') {
        super();
        this.reservedSet = reservedSet || new Set();
        this.rootDomain = rootDomain;
    }

    handle(context) {
        const { host, subdomain, socket, res } = context;
        const isRoot = (subdomain === 'reverseport' && (host === this.rootDomain || host.startsWith('localhost') || !host));
        
        // Solo bloquea si NO es el dominio raíz de la landing
        if (!isRoot && subdomain && this.reservedSet.has(subdomain.toLowerCase())) {
            console.log(`[Seguridad] Bloqueado intento de uso de subdominio reservado: ${subdomain}`);
            if (res) {
                res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Subdominio reservado por políticas de seguridad.');
            } else if (socket && socket.writable) {
                socket.write(JSON.stringify({ type: 'error', message: 'Subdominio reservado por políticas de seguridad.' }) + '\n');
                socket.destroy();
            }
            return true;
        }
        return super.handle(context);
    }
}

/**
 * InstallerRouteHandler:
 * Atiende la petición de instalación curl /install
 */
class InstallerRouteHandler extends BaseHandler {
    constructor(staticFacade, rootDomain = 'reverseport.net') {
        super();
        this.staticFacade = staticFacade;
        this.rootDomain = rootDomain;
    }

    handle(context) {
        const { req, res, host, subdomain } = context;
        if (!req || !res) return super.handle(context);

        const isRoot = (subdomain === 'reverseport' || host === this.rootDomain || host.startsWith('localhost'));
        if (req.url === '/install' && isRoot) {
            this.staticFacade.serveInstaller(res);
            return true;
        }
        return super.handle(context);
    }
}

/**
 * SecurityDocsRouteHandler:
 * Atiende la petición a /security
 */
class SecurityDocsRouteHandler extends BaseHandler {
    constructor(staticFacade, rootDomain = 'reverseport.net') {
        super();
        this.staticFacade = staticFacade;
        this.rootDomain = rootDomain;
    }

    handle(context) {
        const { req, res, host, subdomain } = context;
        if (!req || !res) return super.handle(context);

        const isRoot = (subdomain === 'reverseport' || host === this.rootDomain || host.startsWith('localhost'));
        if (req.url === '/security' && isRoot) {
            this.staticFacade.serveSecurityDocs(res);
            return true;
        }
        return super.handle(context);
    }
}

/**
 * LandingPageRouteHandler:
 * Sirve los archivos estáticos de la landing page si la petición es al dominio principal.
 */
class LandingPageRouteHandler extends BaseHandler {
    constructor(staticFacade, rootDomain = 'reverseport.net') {
        super();
        this.staticFacade = staticFacade;
        this.rootDomain = rootDomain;
    }

    handle(context) {
        const { req, res, host, subdomain } = context;
        if (!req || !res) return super.handle(context);

        const isRoot = (subdomain === 'reverseport' || host === this.rootDomain || host.startsWith('localhost'));
        if (isRoot) {
            this.staticFacade.serveFile(res, req.url);
            return true;
        }
        return super.handle(context);
    }
}

/**
 * TunnelProxyHandler:
 * Enruta la petición entrante al canal de túnel correspondiente mediante el TunnelRegistry.
 */
class TunnelProxyHandler extends BaseHandler {
    constructor(registry, timeoutMs = 15000) {
        super();
        this.registry = registry;
        this.timeoutMs = timeoutMs;
    }

    handle(context) {
        const { reqSocket, head, subdomain, protocolAdapter } = context;
        if (!reqSocket) return super.handle(context);

        const controlSocket = this.registry.getControl(subdomain);

        if (!controlSocket) {
            if (reqSocket.writable) {
                reqSocket.write('HTTP/1.1 404 Not Found\r\nContent-Type: text/plain; charset=utf-8\r\nConnection: close\r\n\r\nSubdominio no activo o cliente desconectado.');
                reqSocket.destroy();
            }
            return true;
        }

        const requestId = uuidv4();

        // Pausamos el socket para evitar perder datos del body hasta que se conecte el canal de datos
        reqSocket.pause();

        this.registry.registerPendingRequest(requestId, reqSocket, head, this.timeoutMs, (timedOutSocket) => {
            if (timedOutSocket && timedOutSocket.writable) {
                timedOutSocket.write('HTTP/1.1 504 Gateway Timeout\r\nContent-Type: text/plain; charset=utf-8\r\nConnection: close\r\n\r\n504 Gateway Timeout: El cliente local no respondió.');
                timedOutSocket.destroy();
            }
        });

        // Enviamos el mensaje estructurado con framing de protocolo
        const msg = { type: 'create_connection', requestId };
        const payload = JSON.stringify(msg) + '\n';
        controlSocket.write(payload);

        return true;
    }
}

/**
 * Factory para armar la cadena completa
 */
function createHttpPipeline(staticFacade, registry, reservedSubdomains, rootDomain = 'reverseport.net') {
    const security = new SecurityFilterHandler(reservedSubdomains, rootDomain);
    const installer = new InstallerRouteHandler(staticFacade, rootDomain);
    const docs = new SecurityDocsRouteHandler(staticFacade, rootDomain);
    const landing = new LandingPageRouteHandler(staticFacade, rootDomain);
    const tunnel = new TunnelProxyHandler(registry);

    security
        .setNext(installer)
        .setNext(docs)
        .setNext(landing)
        .setNext(tunnel);

    return security;
}

module.exports = {
    BaseHandler,
    SecurityFilterHandler,
    InstallerRouteHandler,
    SecurityDocsRouteHandler,
    LandingPageRouteHandler,
    TunnelProxyHandler,
    createHttpPipeline
};
