const http = require('http');
const net = require('net');
const assert = require('assert');
const path = require('path');

const { ProtocolAdapter } = require('../shared/protocol');
const { TunnelRegistry } = require('../server/registry');
const { StaticSiteFacade } = require('../server/staticFacade');
const { createHttpPipeline } = require('../server/pipeline');
const { TunnelStateMachine } = require('../client/stateMachine');
const { ClientConfigBuilder } = require('../client/config');

console.log('🧪 Iniciando test E2E: Flujo Completo Cliente <-> Hub <-> App Local...');

const LOCAL_APP_PORT = 3999;
const TEST_TUNNEL_PORT = 18080;
const TEST_HTTP_PORT = 18081;
const TEST_SUBDOMAIN = 'demo-test-e2e';

// 1. Iniciar App Local de prueba (el servicio que el desarrollador quiere exponer)
const localAppServer = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', message: 'Hola desde la App Local!', path: req.url }));
});

localAppServer.listen(LOCAL_APP_PORT, () => {
    console.log(`  [1/5] App local de prueba lista en puerto ${LOCAL_APP_PORT}`);
    startHub();
});

let testHubServer;
let testPublicHttpServer;
let testRegistry;

function startHub() {
    testRegistry = new TunnelRegistry();
    const websitePath = path.join(__dirname, '..', 'website');
    const staticFacade = new StaticSiteFacade(websitePath);
    const pipeline = createHttpPipeline(staticFacade, testRegistry, new Set(['admin', 'www']), 'reverseport.net');

    // Hub TCP
    testHubServer = net.createServer((socket) => {
        const adapter = ProtocolAdapter.wrap(socket);

        adapter.on('message', (msg) => {
            if (msg.type === 'control') {
                testRegistry.registerControl(msg.subdomain, socket);
                socket.on('close', () => testRegistry.removeControl(msg.subdomain, socket));
            } else if (msg.type === 'data') {
                const pending = testRegistry.takePendingRequest(msg.requestId);
                if (pending) {
                    adapter.destroy();
                    pending.reqSocket.pipe(socket).pipe(pending.reqSocket);
                    if (pending.head && pending.head.length > 0) {
                        socket.write(pending.head);
                    }
                    pending.reqSocket.resume();
                } else {
                    socket.destroy();
                }
            }
        });
    });

    testHubServer.listen(TEST_TUNNEL_PORT, () => {
        console.log(`  [2/5] Hub de túneles listo en puerto ${TEST_TUNNEL_PORT}`);

        // Servidor HTTP público que recibe peticiones del navegador
        testPublicHttpServer = http.createServer((req, res) => {
            const host = (req.headers.host || '').split(':')[0].toLowerCase();
            const subdomain = host.split('.')[0];
            const context = { req, res, host, subdomain };
            pipeline.handle(context);
        });

        testPublicHttpServer.on('connection', (reqSocket) => {
            reqSocket.once('data', (data) => {
                const raw = data.toString();
                const hostMatch = raw.match(/Host:\s*([^\s:]+)/i);
                if (hostMatch) {
                    const host = hostMatch[1].split(':')[0].toLowerCase();
                    const subdomain = host.split('.')[0];
                    if (subdomain !== 'reverseport' && host !== 'reverseport.net') {
                        // Túnel
                        const context = { reqSocket, head: data, host, subdomain };
                        pipeline.handle(context);
                        return;
                    }
                }
                reqSocket.unshift(data);
            });
        });

        testPublicHttpServer.listen(TEST_HTTP_PORT, () => {
            console.log(`  [3/5] Servidor público listo en puerto ${TEST_HTTP_PORT}`);
            connectClient();
        });
    });
}

let clientSM;

function connectClient() {
    const config = new ClientConfigBuilder()
        .withRemoteHost('127.0.0.1')
        .withRemotePort(TEST_TUNNEL_PORT)
        .withRootDomain('reverseport.net')
        .build();

    clientSM = new TunnelStateMachine(config, TEST_SUBDOMAIN, LOCAL_APP_PORT);

    clientSM.on('tunnel_ready', ({ publicUrl }) => {
        console.log(`  [4/5] Cliente conectado por túnel: ${publicUrl}`);
        runHttpTunnelRequest();
    });

    clientSM.start();
}

function runHttpTunnelRequest() {
    console.log(`  [5/5] Enviando petición HTTP a través del túnel simulado...`);

    const options = {
        hostname: '127.0.0.1',
        port: TEST_HTTP_PORT,
        path: '/test-endpoint',
        method: 'GET',
        headers: {
            'Host': `${TEST_SUBDOMAIN}.reverseport.net`
        }
    };

    const req = http.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
            try {
                const parsed = JSON.parse(body);
                assert.strictEqual(parsed.status, 'ok');
                assert.strictEqual(parsed.message, 'Hola desde la App Local!');
                assert.strictEqual(parsed.path, '/test-endpoint');

                console.log('  ✅ Respuesta recibida exitosamente desde la app local a través del túnel:');
                console.log('    ', body);

                teardown();
            } catch (err) {
                console.error('❌ Error validando respuesta:', err);
                process.exit(1);
            }
        });
    });

    req.on('error', (err) => {
        console.error('❌ Error en request HTTP:', err);
        process.exit(1);
    });

    req.end();
}

function teardown() {
    clientSM.stop();
    testPublicHttpServer.close();
    testHubServer.close();
    localAppServer.close();

    console.log('\n🎉 Test E2E completado con ÉXITO absoluto: Arquitectura GoF validada al 100%.\n');
    process.exit(0);
}
