const assert = require('assert');
const {
    propiedadIdDesdeReserva,
    debeOmitirAlta,
    listoParaReintento,
} = require('../services/puenteSodc.outbound');

assert.strictEqual(propiedadIdDesdeReserva({ alojamiento: 'Cabaña 10' }), 'cabana10');
assert.strictEqual(propiedadIdDesdeReserva({ alojamiento: 'Cabaña 8 1' }), 'cabana8');
assert.strictEqual(propiedadIdDesdeReserva({ propiedadId: 'cabana2', alojamiento: 'Otro' }), 'cabana2');
assert.strictEqual(propiedadIdDesdeReserva({ alojamiento: 'Sala' }), '');

assert.strictEqual(debeOmitirAlta('SODC_x_cabana1', { puenteSodc: true }), true);
assert.strictEqual(debeOmitirAlta('APP_APP-1_Cabaña1', { puenteSodc: false }), false);
assert.strictEqual(
    debeOmitirAlta('APP_APP-1792024232886_Cabaña10', { puenteSodc: false }),
    false
);

assert.strictEqual(listoParaReintento({ ok: true, intentos: 3, at: new Date().toISOString() }), false);
assert.strictEqual(listoParaReintento({ ok: false, intentos: 0, at: new Date().toISOString() }), true);
assert.strictEqual(listoParaReintento({
    ok: false,
    intentos: 1,
    at: new Date(Date.now() - 30 * 1000).toISOString(),
}), false);
assert.strictEqual(listoParaReintento({
    ok: false,
    intentos: 1,
    at: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
}), true);

console.log('puenteSodc.outbound.test ok');
