const assert = require('assert');
const {
    validarConsulta,
    nombreCabanaDesdeId,
    seleccionarTramos,
} = require('../services/puenteSodc.disponibilidad');

function dia(value) {
    return { toDate: () => new Date(`${value}T00:00:00Z`) };
}

function doc(id, data) {
    return { id, data: () => data };
}

function estadia(extra) {
    return {
        alojamiento: 'Cabaña 9',
        estado: 'Confirmada',
        canal: 'Booking',
        fechaLlegada: dia('2026-10-24'),
        fechaSalida: dia('2026-10-26'),
        ...extra,
    };
}

const consulta = {
    empresaId: 'empresaPrueba000001',
    alojamientoId: 'cabana9',
    desde: '2026-10-01',
    hasta: '2026-12-01',
};

assert.strictEqual(nombreCabanaDesdeId('cabana9'), 'Cabaña 9');
assert.strictEqual(nombreCabanaDesdeId('cabana-1'), 'Cabaña 1');
assert.strictEqual(nombreCabanaDesdeId('cabana10'), 'Cabaña 10');
assert.strictEqual(nombreCabanaDesdeId('cabana-01'), 'Cabaña 1');
assert.strictEqual(nombreCabanaDesdeId('otra'), '');

const base = validarConsulta({ ...consulta });
assert.strictEqual(base.hasta, '2026-12-01');
validarConsulta({ ...consulta, desde: '2026-10-01', hasta: '2027-01-29' });
assert.throws(() => validarConsulta({ ...consulta, hasta: '2027-01-30' }), (error) => error.statusCode === 400);
assert.throws(() => validarConsulta({ ...consulta, desde: '2026-10-24', hasta: '2026-10-24' }), (error) => error.statusCode === 400);
assert.throws(() => validarConsulta({ ...consulta, desde: '2026-02-31', hasta: '2026-03-02' }), (error) => error.statusCode === 400);

const tramos = seleccionarTramos([
    doc('BOOKING_1', estadia({})),
    doc('AIRBNB_1', estadia({ canal: 'Airbnb', fechaLlegada: dia('2026-11-02'), fechaSalida: dia('2026-11-04') })),
    doc('APP_1', estadia({ canal: 'App', fechaLlegada: dia('2026-11-10'), fechaSalida: dia('2026-11-11') })),
    doc('SODC_ssr_cabana9', estadia({ canal: 'SODC', puenteSodc: true })),
    doc('CANCEL', estadia({ estado: 'Cancelada', fechaLlegada: dia('2026-10-10'), fechaSalida: dia('2026-10-12') })),
    doc('NOSHOW', estadia({ estado: 'No Presentado', fechaLlegada: dia('2026-10-12'), fechaSalida: dia('2026-10-14') })),
    doc('OTRA', estadia({ alojamiento: 'Cabaña 1' })),
    doc('SALE', estadia({ fechaLlegada: dia('2026-09-28'), fechaSalida: dia('2026-10-01') })),
    doc('ENTRA', estadia({ fechaLlegada: dia('2026-12-01'), fechaSalida: dia('2026-12-03') })),
    doc('BORDE', estadia({ estado: 'Confirmada ', canal: 'Booking', fechaLlegada: dia('2026-10-20'), fechaSalida: dia('2026-10-21') })),
    doc('POR_ID', estadia({ alojamiento: 'Otro nombre', propiedadId: 'cabana9', canal: 'Booking', fechaLlegada: dia('2026-10-05'), fechaSalida: dia('2026-10-06') })),
], consulta, 'Cabaña 9');

assert.deepStrictEqual(tramos.map((row) => row.origen), ['ota', 'ota', 'ota', 'ota', 'gestor']);
assert.strictEqual(tramos.some((row) => row.desde === '2026-10-24' && row.hasta === '2026-10-26'), true);
assert.strictEqual(tramos.some((row) => row.desde === '2026-10-01'), false);
assert.strictEqual(tramos.some((row) => row.desde === '2026-12-01'), false);
assert.strictEqual(tramos.filter((row) => row.origen === 'gestor').length, 1);

const soloCopia = seleccionarTramos([
    doc('SODC_ssr_cabana9', estadia({ canal: 'SODC', puenteSodc: true })),
], consulta, 'Cabaña 9');
assert.strictEqual(soloCopia.length, 0);

console.log('puenteSodc.disponibilidad.test ok');
