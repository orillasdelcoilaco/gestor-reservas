const assert = require('assert');
const { validarAlta } = require('../services/puenteSodc.write');

const base = {
    reservaId: '6480883529',
    empresaId: 'empresaPrueba000001',
    llegada: '2027-01-25',
    salida: '2027-01-31',
    noches: 6,
    personas: 6,
    total: 893609,
    abono: 0,
    canal: 'Booking',
    monedaOriginal: 'USD',
    valorDolarDia: 980,
    alojamientos: [{
        id: 'cabana-7',
        nombre: 'Cabaña 7',
        total: 893609,
        abono: 0,
        valorOriginal: 910.35,
    }],
    huesped: { nombre: 'Ada Lovelace', email: 'ada@example.com', telefono: '+56912345678' },
};

const ok = validarAlta(base);
assert.strictEqual(ok.canal, 'Booking');
assert.strictEqual(ok.monedaOriginal, 'USD');
assert.strictEqual(ok.alojamientos[0].valorOriginal, 910.35);

const sitio = validarAlta({
    ...base,
    reservaId: 'ssr-29102026-001',
    canal: undefined,
    monedaOriginal: undefined,
    valorDolarDia: undefined,
    total: 220000,
    abono: 22000,
    llegada: '2027-06-15',
    salida: '2027-06-17',
    noches: 2,
    personas: 2,
    alojamientos: [{ id: 'cabana-3', nombre: 'Cabaña 3', total: 220000, abono: 22000 }],
});
assert.strictEqual(sitio.canal, 'SODC');
assert.strictEqual(sitio.monedaOriginal, 'CLP');

console.log('puenteSodc.write.test ok');
