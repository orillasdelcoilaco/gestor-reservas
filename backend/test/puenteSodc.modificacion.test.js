const assert = require('assert');
const { validarModificacion, camposEstadia, clavePropiedad } = require('../services/puenteSodc.modificacion');

const ok = validarModificacion({
    reservaId: 'APP-1790019755037',
    empresaId: 'empresaPrueba000001',
    at: '2026-11-16T17:09:51.000Z',
    alojamientos: [
        { id: 'cabana10', llegada: '2026-12-17', salida: '2026-12-20', noches: 3, personas: 30 },
        { id: 'cabana-2', llegada: '2026-12-17', salida: '2026-12-20', noches: 3, personas: 0 },
    ],
});
assert.strictEqual(ok.alojamientos.length, 2);
assert.strictEqual(clavePropiedad('cabana-2'), clavePropiedad('cabana2'));

const patch = camposEstadia(ok.alojamientos[1], ok.at);
assert.strictEqual(patch.totalNoches, 3);
assert.strictEqual(patch.modificacionManual.ok, true);
assert.strictEqual(patch.modificacionManual.llegada, '2026-12-17');
assert.strictEqual(Object.prototype.hasOwnProperty.call(patch, 'invitados'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(patch, 'valorCLP'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(patch, 'abono'), false);

const conPersonas = camposEstadia(ok.alojamientos[0], ok.at);
assert.strictEqual(conPersonas.invitados, 30);

assert.throws(() => validarModificacion({
    reservaId: 'APP-1790019755037',
    empresaId: 'empresaPrueba000001',
    alojamientos: [{ id: 'cabana10', llegada: '2026-12-20', salida: '2026-12-17', noches: 3, personas: 1 }],
}), /datos_invalidos/);

console.log('puenteSodc.modificacion.test ok');
