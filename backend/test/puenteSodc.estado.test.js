const assert = require('assert');
const { validarCambioEstado, ESTADOS_GESTION, ESTADOS_RESERVA } = require('../services/puenteSodc.estado');

assert.ok(ESTADOS_GESTION.has('Pendiente Bienvenida'));
assert.ok(ESTADOS_RESERVA.has('Confirmada'));

const ok = validarCambioEstado({
    origenId: 'APP_APP-1_Cabaña2',
    estado: 'Confirmada',
    estadoGestion: 'Pendiente Cobro',
});
assert.strictEqual(ok.origenId, 'APP_APP-1_Cabaña2');
assert.strictEqual(ok.estado, 'Confirmada');
assert.strictEqual(ok.estadoGestion, 'Pendiente Cobro');

assert.throws(() => validarCambioEstado({ origenId: 'x' }), /datos_invalidos/);
assert.throws(() => validarCambioEstado({
    origenId: 'x',
    estado: 'Inventado',
}), /datos_invalidos/);
assert.throws(() => validarCambioEstado({
    origenId: 'x',
    estadoGestion: 'Inventado',
}), /datos_invalidos/);

console.log('puenteSodc.estado.test ok');
