const assert = require('assert');
const { generateMatrix, renderToTerminal } = require('../client/qr');

console.log('🧪 Iniciando test: Terminal QR Code Generator...');

// Test 1: Matriz generada con dimensiones válidas
const url = 'https://dev-1234.reverseport.net';
const matrix = generateMatrix(url);
assert(Array.isArray(matrix), 'La matriz debe ser un array');
assert(matrix.length > 20, 'El tamaño de la matriz QR debe ser mayor a 20x20');
assert(matrix.length === matrix[0].length, 'La matriz debe ser cuadrada');
console.log(`  ✅ Test 1: Matriz QR generada correctamente (${matrix.length}x${matrix.length})`);

// Test 2: Patrones de búsqueda (Finders) en esquinas
// El finder superior izquierdo es 7x7
assert.strictEqual(matrix[0][0], true, 'Esquina top-left debe ser módulo oscuro');
assert.strictEqual(matrix[0][6], true, 'Borde finder top-left debe ser oscuro');
assert.strictEqual(matrix[6][0], true, 'Borde finder top-left debe ser oscuro');
console.log('  ✅ Test 2: Patrones de búsqueda (Finders) posicionados correctamente');

// Test 3: Renderizado a terminal con medios bloques Unicode
const rendered = renderToTerminal(url, { border: 2 });
assert(typeof rendered === 'string', 'El resultado debe ser un string');
assert(rendered.includes('█'), 'Debe contener caracteres de bloque');
assert(rendered.includes('\n'), 'Debe contener saltos de línea');
console.log('  ✅ Test 3: Renderizado ANSI con half-blocks validado.');

console.log('🎉 Todos los tests de QR Code pasaron exitosamente.\n');
