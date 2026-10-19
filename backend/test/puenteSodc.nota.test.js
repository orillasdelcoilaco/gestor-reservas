const assert = require('assert');
const { validarNotaDesdeRezerva } = require('../services/puenteSodc.nota');

const ok = validarNotaDesdeRezerva({
    origenId: 'APP_APP-1792411118675_Cabaña7',
    origenNotaId: 'rzv_nota_0001',
    reservaIdOriginal: 'APP-1792411118675',
    texto: 'espejo-bitacora-2',
    autor: 'puente',
    fecha: '2026-10-19',
});
assert.strictEqual(ok.origenNotaId, 'rzv_nota_0001');

assert.throws(() => validarNotaDesdeRezerva({
    origenId: 'APP_APP-1_Cabaña7',
    origenNotaId: 'ab',
    reservaIdOriginal: 'APP-1',
    texto: 'x',
    autor: 'puente',
    fecha: '2026-10-19',
}), /datos_invalidos/);

assert.throws(() => validarNotaDesdeRezerva({
    origenId: 'APP_APP-1_Cabaña7',
    origenNotaId: 'rzv_nota_0001',
    reservaIdOriginal: 'APP-1',
    texto: 'x',
    autor: 'puente',
    fecha: '19-10-2026',
}), /datos_invalidos/);

console.log('puenteSodc.nota.test ok');
