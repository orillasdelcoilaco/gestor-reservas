const { cleanCabanaName } = require('../utils/helpers');

const NOCHES_MAX = 120;

function datosInvalidos() {
    const err = new Error('datos_invalidos');
    err.statusCode = 400;
    return err;
}

function noEncontrado() {
    const err = new Error('alojamiento_no_encontrado');
    err.statusCode = 404;
    return err;
}

function fechaValida(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year
        && date.getUTCMonth() === month - 1
        && date.getUTCDate() === day;
}

function nochesEntre(desde, hasta) {
    const ms = Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`);
    return Math.round(ms / 86400000);
}

function validarConsulta(body) {
    if (!body || typeof body !== 'object') throw datosInvalidos();
    const empresaId = String(body.empresaId || '');
    const alojamientoId = String(body.alojamientoId || '');
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(empresaId)) throw datosInvalidos();
    if (!/^[a-z0-9-]{1,64}$/.test(alojamientoId)) throw datosInvalidos();
    if (!fechaValida(body.desde) || !fechaValida(body.hasta)) throw datosInvalidos();
    const noches = nochesEntre(body.desde, body.hasta);
    if (noches < 1 || noches > NOCHES_MAX) throw datosInvalidos();
    return { empresaId, alojamientoId, desde: body.desde, hasta: body.hasta };
}

function nombreCabanaDesdeId(alojamientoId) {
    const match = String(alojamientoId || '').match(/^cabana-?(\d{1,2})$/);
    if (!match) return '';
    const numero = Number(match[1]);
    if (numero < 1) return '';
    return `Cabaña ${numero}`;
}

function bloqueaCalendario(estado) {
    return String(estado || '').trim().toLowerCase() === 'confirmada';
}

function esCopiaSitio(data, docId) {
    if (data && data.puenteSodc === true) return true;
    if (String(data && data.canal || '').trim().toLowerCase() === 'sodc') return true;
    return String(docId || '').startsWith('SODC_');
}

function diaUtc(value) {
    if (!value || typeof value.toDate !== 'function') return '';
    return value.toDate().toISOString().slice(0, 10);
}

function origenTramo(canal) {
    const nombre = String(canal || '').trim().toLowerCase();
    if (nombre === 'app' || nombre === 'directa' || nombre === 'manual' || nombre === 'gestor') {
        return 'gestor';
    }
    return 'ota';
}

function mismaCabana(data, alojamientoId, nombre) {
    if (String(data.propiedadId || '') === alojamientoId) return true;
    const alojamiento = cleanCabanaName(String(data.alojamiento || ''));
    return alojamiento.toLowerCase() === String(nombre || '').toLowerCase();
}

function pisa(llegada, salida, desde, hasta) {
    return llegada < hasta && salida > desde;
}

function seleccionarTramos(docs, consulta, nombre) {
    const vistos = new Set();
    const tramos = [];
    docs.forEach((doc) => {
        const data = doc.data();
        if (!data || !mismaCabana(data, consulta.alojamientoId, nombre)) return;
        if (!bloqueaCalendario(data.estado) || esCopiaSitio(data, doc.id)) return;
        const llegada = diaUtc(data.fechaLlegada);
        const salida = diaUtc(data.fechaSalida);
        if (!fechaValida(llegada) || !fechaValida(salida)) return;
        if (!pisa(llegada, salida, consulta.desde, consulta.hasta)) return;
        const origen = origenTramo(data.canal);
        const clave = `${llegada}|${salida}|${origen}`;
        if (vistos.has(clave)) return;
        vistos.add(clave);
        tramos.push({ desde: llegada, hasta: salida, origen });
    });
    tramos.sort((a, b) => a.desde.localeCompare(b.desde) || a.hasta.localeCompare(b.hasta));
    return tramos;
}

async function consultarDisponibilidad(db, body) {
    const consulta = validarConsulta(body);
    const nombre = nombreCabanaDesdeId(consulta.alojamientoId);
    if (!nombre) throw noEncontrado();
    const cabanas = await db.collection('cabanas').where('nombre', '==', nombre).limit(1).get();
    if (cabanas.empty) throw noEncontrado();

    const admin = require('firebase-admin');
    const desde = admin.firestore.Timestamp.fromDate(new Date(`${consulta.desde}T00:00:00Z`));
    const hasta = admin.firestore.Timestamp.fromDate(new Date(`${consulta.hasta}T00:00:00Z`));
    const snap = await db.collection('reservas')
        .where('fechaSalida', '>=', desde)
        .where('fechaLlegada', '<', hasta)
        .get();
    const tramos = seleccionarTramos(snap.docs, consulta, nombre);
    return {
        alojamientoId: consulta.alojamientoId,
        desde: consulta.desde,
        hasta: consulta.hasta,
        ocupada: tramos.length > 0,
        tramos,
    };
}

module.exports = {
    validarConsulta,
    nombreCabanaDesdeId,
    seleccionarTramos,
    consultarDisponibilidad,
    NOCHES_MAX,
};
