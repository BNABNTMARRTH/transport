const assert = require('assert');
const { EventEmitter } = require('events');
const { ProtocolAdapter } = require('../shared/protocol');

console.log('🧪 Iniciando test: ProtocolAdapter (Fragmentación y Framing TCP)...');

// Mock socket
class MockSocket extends EventEmitter {
    constructor() {
        super();
        this.writable = true;
        this.written = [];
    }
    write(data) {
        this.written.push(data);
        return true;
    }
    destroy() {
        this.emit('close');
    }
}

// Test 1: Mensaje normal
{
    const socket = new MockSocket();
    const adapter = new ProtocolAdapter(socket);
    const received = [];

    adapter.on('message', msg => received.push(msg));

    socket.emit('data', Buffer.from('{"type":"control","subdomain":"demo"}\n'));

    assert.strictEqual(received.length, 1);
    assert.strictEqual(received[0].type, 'control');
    assert.strictEqual(received[0].subdomain, 'demo');
    console.log('  ✅ Test 1: Mensaje único recibido correctamente.');
}

// Test 2: Fragmentación de paquetes (TCP chunk split)
{
    const socket = new MockSocket();
    const adapter = new ProtocolAdapter(socket);
    const received = [];

    adapter.on('message', msg => received.push(msg));

    // Enviamos el mensaje cortado en 3 partes
    socket.emit('data', Buffer.from('{"type":"create_'));
    assert.strictEqual(received.length, 0, 'No debe emitir antes del fin de mensaje');

    socket.emit('data', Buffer.from('connection","requestId"'));
    assert.strictEqual(received.length, 0, 'No debe emitir mensaje incompleto');

    socket.emit('data', Buffer.from(':"uuid-12345"}\n'));
    assert.strictEqual(received.length, 1, 'Debe emitir el mensaje completo tras el delimitador');
    assert.strictEqual(received[0].requestId, 'uuid-12345');
    console.log('  ✅ Test 2: Paquete TCP fragmentado ensamblado exitosamente.');
}

// Test 3: Paquetes combinados (TCP packet merging)
{
    const socket = new MockSocket();
    const adapter = new ProtocolAdapter(socket);
    const received = [];

    adapter.on('message', msg => received.push(msg));

    // Dos mensajes en un mismo paquete
    socket.emit('data', Buffer.from('{"msg":1}\n{"msg":2}\n'));

    assert.strictEqual(received.length, 2);
    assert.strictEqual(received[0].msg, 1);
    assert.strictEqual(received[1].msg, 2);
    console.log('  ✅ Test 3: Paquetes combinados separados sin pérdidas.');
}

// Test 4: Envío con delimitador
{
    const socket = new MockSocket();
    const adapter = new ProtocolAdapter(socket);

    adapter.send({ action: 'ping' });
    assert.strictEqual(socket.written.length, 1);
    assert.strictEqual(socket.written[0], '{"action":"ping"}\n');
    console.log('  ✅ Test 4: Serialización y delimitador correcto en send().');
}

console.log('🎉 Todos los tests de ProtocolAdapter pasaron satisfactoriamente.\n');
