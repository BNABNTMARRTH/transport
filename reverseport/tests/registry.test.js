const assert = require('assert');
const { TunnelRegistry } = require('../server/registry');

console.log('🧪 Iniciando test: TunnelRegistry (Singleton & Life Cycle)...');

const registry = new TunnelRegistry();

// Test 1: Singleton
{
    const reg2 = new TunnelRegistry();
    assert.strictEqual(registry, reg2, 'TunnelRegistry debe ser una única instancia');
    console.log('  ✅ Test 1: Instancia Singleton verificada.');
}

// Test 2: Control socket registration & eviction
{
    const mockSocket = { destroyed: false, writable: true, destroy() { this.destroyed = true; } };
    registry.registerControl('MiSubdominio', mockSocket);

    // Debe normalizar a lowercase
    const found = registry.getControl('misubdominio');
    assert.strictEqual(found, mockSocket);

    registry.removeControl('misubdominio', mockSocket);
    assert.strictEqual(registry.getControl('misubdominio'), null);
    console.log('  ✅ Test 2: Registro, normalización y desregistro de control OK.');
}

// Test 3: Pending request atomic take and timer cancellation
{
    let timeoutFired = false;
    const mockReqSocket = { destroyed: false, writable: true, destroy() { this.destroyed = true; } };

    registry.registerPendingRequest('req-1', mockReqSocket, 'head-data', 50, () => {
        timeoutFired = true;
    });

    const taken = registry.takePendingRequest('req-1');
    assert.ok(taken);
    assert.strictEqual(taken.reqSocket, mockReqSocket);
    assert.strictEqual(taken.head, 'head-data');

    // Comprobamos que no se puede volver a tomar (atómico)
    assert.strictEqual(registry.takePendingRequest('req-1'), null);

    // Esperar más de 50ms para confirmar que el timer fue cancelado
    setTimeout(() => {
        assert.strictEqual(timeoutFired, false, 'El timer no debió dispararse porque la petición fue atendida');
        console.log('  ✅ Test 3: Extracción atómica de peticiones pendientes y cancelación de timers OK.');

        // Test 4: Timeout ejecutado cuando no se atiende la petición
        testTimeoutExecution();
    }, 80);
}

function testTimeoutExecution() {
    let timeoutExecuted = false;
    const mockReqSocket = { destroyed: false, writable: true, destroy() { this.destroyed = true; } };

    registry.registerPendingRequest('req-timeout', mockReqSocket, 'head', 50, () => {
        timeoutExecuted = true;
    });

    setTimeout(() => {
        assert.strictEqual(timeoutExecuted, true, 'El callback de timeout debe dispararse si expira');
        console.log('  ✅ Test 4: Timeout de peticiones pendientes ejecutado correctamente.');
        registry.clear();
        console.log('🎉 Todos los tests de TunnelRegistry pasaron exitosamente.\n');
    }, 80);
}
