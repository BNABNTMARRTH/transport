const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { AuthManager } = require('../server/auth');

console.log('🧪 Iniciando test: AuthManager (API Keys & Subdomain Reservation)...');

const testDataPath = path.join(__dirname, 'test_keys.json');
if (fs.existsSync(testDataPath)) fs.unlinkSync(testDataPath);

const auth = new AuthManager(testDataPath);

// 1. Acceso a subdominio anónimo sin API key
const anonCheck = auth.validateTunnelAccess('dev-9876', null);
assert.strictEqual(anonCheck.allowed, true, 'Subdominio anónimo debe permitirse');
assert.strictEqual(anonCheck.vip, false, 'No debe ser VIP');
console.log('  ✅ Test 1: Subdominios gratuitos y anónimos autorizados correctamente.');

// 2. Creación de API Key y reserva de subdominio
const { key: newKey } = auth.createApiKey('Enterprise Client', ['mi-empresa', 'staging-crm']);
assert(newKey.startsWith('rport_'), 'Debe generar clave con prefijo rport_');

// 3. Intento de conectar al subdominio reservado SIN API key
const unauthCheck = auth.validateTunnelAccess('mi-empresa', null);
assert.strictEqual(unauthCheck.allowed, false, 'Debe denegar acceso sin la API key dueña');
console.log('  ✅ Test 2: Intento no autorizado a subdominio reservado bloqueado correctamente.');

// 4. Intento con API key correcta
const authCheck = auth.validateTunnelAccess('mi-empresa', newKey);
assert.strictEqual(authCheck.allowed, true, 'Debe permitir acceso con API key válida');
assert.strictEqual(authCheck.vip, true, 'Debe reconocer como VIP');
console.log('  ✅ Test 3: Acceso legítimo a subdominio reservado autorizado con éxito.');

// 5. Reclamar nuevo subdominio permanente
auth.claimSubdomain('produccion-vip', newKey);
const checkReclaimed = auth.validateTunnelAccess('produccion-vip', null);
assert.strictEqual(checkReclaimed.allowed, false, 'Subdominio recién reclamado debe quedar protegido');
console.log('  ✅ Test 4: Reclamación dinámica de subdominios permanente OK.');

// Cleanup
if (fs.existsSync(testDataPath)) fs.unlinkSync(testDataPath);
console.log('🎉 Todos los tests de AuthManager pasaron exitosamente.\n');
