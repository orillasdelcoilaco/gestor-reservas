const assert = require('assert');
const { validarPagoDesdeRezerva, validarBajaPagoDesdeRezerva } = require('../services/puenteSodc.pago');

const ok = validarPagoDesdeRezerva({
    origenId: 'APP_APP-1792411118675_Cabaña7',
    origenPagoId: 'rzv_abono_0001',
    monto: 500,
    medioDePago: 'Transferencia',
    tipo: 'Abono',
    fecha: '2026-10-19',
});
assert.strictEqual(ok.origenPagoId, 'rzv_abono_0001');
assert.strictEqual(ok.monto, 500);

assert.throws(() => validarPagoDesdeRezerva({
    origenId: 'x',
    origenPagoId: 'ab',
    monto: 1,
    medioDePago: 'Transferencia',
    tipo: 'Abono',
    fecha: '2026-10-19',
}), /datos_invalidos/);

assert.throws(() => validarPagoDesdeRezerva({
    origenId: 'APP_APP-1_Cabaña7',
    origenPagoId: 'rzv_abono_0001',
    monto: 0,
    medioDePago: 'Transferencia',
    tipo: 'Abono',
    fecha: '2026-10-19',
}), /datos_invalidos/);

assert.throws(() => validarPagoDesdeRezerva({
    origenId: 'APP_APP-1_Cabaña7',
    origenPagoId: 'rzv_abono_0001',
    monto: 100,
    medioDePago: 'Transferencia',
    tipo: 'Pago Final',
    fecha: '2026-10-19',
}), /datos_invalidos/);

const baja = validarBajaPagoDesdeRezerva({
    origenId: 'APP_APP-1792411118675_Cabaña7',
    origenPagoId: 'rzv_abono_0001',
});
assert.strictEqual(baja.origenPagoId, 'rzv_abono_0001');
assert.throws(() => validarBajaPagoDesdeRezerva({
    origenId: 'APP_APP-1_Cabaña7',
    origenPagoId: 'ab',
}), /datos_invalidos/);

console.log('puenteSodc.pago.test ok');
