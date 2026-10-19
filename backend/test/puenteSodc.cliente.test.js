const assert = require('assert');
const { validarClienteDesdeRezerva } = require('../services/puenteSodc.cliente');

const ok = validarClienteDesdeRezerva({
    origenId: 'APP_APP-1792411118675_Cabaña7',
    reservaIdOriginal: 'APP-1792411118675',
    telefono: '54 9 299 555-5576',
    calificacion: 4,
});
assert.strictEqual(ok.telefono, '5492995555576');
assert.strictEqual(ok.calificacion, 4);
assert.strictEqual(ok.tieneNotas, false);

const soloNotas = validarClienteDesdeRezerva({
    origenId: 'APP_APP-1792411118675_Cabaña7',
    reservaIdOriginal: 'APP-1792411118675',
    telefono: '5492995555576',
    notas: 'espejo-cliente-1',
});
assert.strictEqual(soloNotas.tieneCalificacion, false);
assert.strictEqual(soloNotas.notas, 'espejo-cliente-1');

assert.throws(() => validarClienteDesdeRezerva({
    origenId: 'APP_APP-1792411118675_Cabaña7',
    reservaIdOriginal: 'APP-1792411118675',
    telefono: '5492995555576',
}), /datos_invalidos/);

assert.throws(() => validarClienteDesdeRezerva({
    origenId: 'APP_APP-1792411118675_Cabaña7',
    reservaIdOriginal: 'APP-1792411118675',
    telefono: '5492995555576',
    calificacion: 9,
}), /datos_invalidos/);

console.log('puenteSodc.cliente.test ok');
