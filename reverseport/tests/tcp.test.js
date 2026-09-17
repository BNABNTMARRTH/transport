const assert = require('assert');
const net = require('net');
const { EventEmitter } = require('events');
const { TcpTunnelHub } = require('../server/tcpHub');
const { TunnelRegistry } = require('../server/registry');
const { ProtocolAdapter } = require('../shared/protocol');

console.log('🧪 Iniciando test: TcpTunnelHub (Raw TCP Tunnels - Postgres/MySQL/SSH)...');

async function runTcpTest() {
    const registry = new TunnelRegistry();
    const hub = new TcpTunnelHub(registry, 19000, 19010);

    // 1. Simular un servicio local TCP (por ejemplo, Postgres en puerto 15432)
    let serviceReceivedData = '';
    const mockPostgresServer = net.createServer((socket) => {
        socket.on('data', (data) => {
            serviceReceivedData += data.toString('utf-8');
            socket.write('PG_READY_OK');
        });
    });

    await new Promise(resolve => mockPostgresServer.listen(15432, '127.0.0.1', resolve));
    console.log('  [1/4] Servicio TCP local simulado (Postgres) iniciado en puerto 15432');

    // 2. Simular un socket de control de cliente conectado
    const fakeClientControl = new EventEmitter();
    let sentToClient = null;
    fakeClientControl.write = (chunk) => {
        sentToClient = JSON.parse(chunk.toString().trim());
    };

    // 3. Crear túnel TCP en el Hub
    const publicPort = await hub.createTcpTunnel(fakeClientControl, 15432, 19005);
    assert.strictEqual(publicPort, 19005, 'Debe asignar el puerto solicitado');
    console.log(`  [2/4] Puerto público asignado en el Hub: ${publicPort}`);

    // 4. Un cliente externo se conecta al puerto público del VPS
    const externalClientSocket = net.connect(publicPort, '127.0.0.1', () => {
        // Al conectar, el hub debe haber enviado 'create_connection' al socket de control
        assert(sentToClient, 'Debe haber enviado create_connection');
        assert.strictEqual(sentToClient.type, 'create_connection');
        assert(sentToClient.isTcp, 'Debe indicar isTcp = true');

        const { requestId } = sentToClient;
        const pending = registry.takePendingRequest(requestId);
        assert(pending, 'Debe existir pending request en el registro');

        // Simular que el cliente local abre el canal de datos
        const localTargetSocket = net.connect(15432, '127.0.0.1', () => {
            pending.reqSocket.pipe(localTargetSocket).pipe(pending.reqSocket);
            pending.reqSocket.resume();

            // Enviamos query desde el cliente externo
            externalClientSocket.write('SELECT 1 FROM users;');
        });
    });

    let externalReceivedResponse = '';
    externalClientSocket.on('data', (chunk) => {
        externalReceivedResponse += chunk.toString('utf-8');
    });

    // Esperar transmisión
    await new Promise(resolve => setTimeout(resolve, 300));

    assert.strictEqual(serviceReceivedData, 'SELECT 1 FROM users;');
    assert.strictEqual(externalReceivedResponse, 'PG_READY_OK');
    console.log('  ✅ Test 1: Flujo TCP bidireccional puro completado sin corrupción.');

    // Cleanup
    externalClientSocket.destroy();
    hub.releaseClientTunnels(fakeClientControl);
    assert.strictEqual(hub.activeListeners.size, 0, 'Debe haber liberado el listener');
    console.log('  ✅ Test 2: Cierre y liberación limpia de recursos TCP en el Hub.');

    await new Promise(resolve => mockPostgresServer.close(resolve));
    console.log('🎉 Todos los tests de TcpTunnelHub pasaron exitosamente.\n');
}

runTcpTest().catch(err => {
    console.error('❌ Error en test de TcpTunnelHub:', err);
    process.exit(1);
});
