const assert = require('assert');
const http = require('http');
const { TrafficInspector } = require('../client/inspector');

console.log('🧪 Iniciando test: TrafficInspector (localhost:4040, SSE & Replay)...');

async function runInspectorTest() {
    // 1. Iniciar un servidor HTTP local de prueba
    let localReceivedHeaders = null;
    let localReceivedBody = '';
    const testLocalServer = http.createServer((req, res) => {
        localReceivedHeaders = req.headers;
        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => {
            localReceivedBody = Buffer.concat(chunks).toString('utf-8');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ greeting: 'Hello from local server!' }));
        });
    });

    await new Promise(resolve => testLocalServer.listen(14041, '127.0.0.1', resolve));
    console.log('  [1/4] Servidor local de prueba iniciado en puerto 14041');

    // 2. Iniciar TrafficInspector
    const inspector = new TrafficInspector(14040, 14041);
    await inspector.start();
    console.log('  [2/4] Inspector iniciado en puerto 14040');

    // 3. Simular captura de request y response
    const rawReq = Buffer.from(
        'POST /api/test?filter=active HTTP/1.1\r\n' +
        'Host: myapp.reverseport.net\r\n' +
        'Content-Type: application/json\r\n' +
        'X-Custom-Header: TestVal\r\n' +
        '\r\n' +
        '{"user":"BNABNT"}'
    );

    const rawRes = Buffer.from(
        'HTTP/1.1 200 OK\r\n' +
        'Content-Type: application/json\r\n' +
        '\r\n' +
        '{"greeting":"Hello from local server!"}'
    );

    const reqEntry = inspector.captureRequest('req-101', rawReq);
    assert.strictEqual(reqEntry.method, 'POST');
    assert.strictEqual(reqEntry.path, '/api/test?filter=active');
    assert.strictEqual(reqEntry.headers['x-custom-header'], 'TestVal');
    assert.strictEqual(reqEntry.body, '{"user":"BNABNT"}');

    inspector.captureResponse('req-101', rawRes);
    assert.strictEqual(reqEntry.status, 200);
    assert.strictEqual(reqEntry.statusText, 'OK');
    console.log('  ✅ Test 1: Captura y parseo de Request & Response exitosa.');

    // 4. Test Replay request contra el servidor local
    const replayResult = await inspector.replayRequest('req-101');
    assert.strictEqual(replayResult.status, 200);
    assert.strictEqual(replayResult.replayed, true);
    assert.strictEqual(localReceivedHeaders['x-replay-of'], 'req-101');
    assert.strictEqual(localReceivedBody, '{"user":"BNABNT"}');
    console.log('  ✅ Test 2: Replay de petición ejecutado correctamente hacia el servidor local.');

    // 5. Test SSE & Dashboard endpoint
    const dashboardHtml = await new Promise(resolve => {
        http.get('http://127.0.0.1:14040/', res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });
    });
    assert(dashboardHtml.includes('ReversePort // Inspector'));
    console.log('  ✅ Test 3: Dashboard Web UI y endpoint SSE sirviendo en HTTP 200.');

    // Cleanup
    inspector.stop();
    await new Promise(resolve => testLocalServer.close(resolve));
    console.log('🎉 Todos los tests de TrafficInspector pasaron exitosamente.\n');
}

runInspectorTest().catch(err => {
    console.error('❌ Error en test de TrafficInspector:', err);
    process.exit(1);
});
