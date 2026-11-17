const admin = require('firebase-admin');

function datoInvalido() {
    const err = new Error('datos_invalidos');
    err.statusCode = 400;
    return err;
}

function noEncontrado() {
    const err = new Error('reserva_no_encontrada');
    err.statusCode = 404;
    return err;
}

function fecha(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function clavePropiedad(id) {
    return String(id || '').trim().toLowerCase().replace(/^cabana-(\d{1,2})$/, 'cabana$1');
}

function validarModificacion(body) {
    if (!body || typeof body !== 'object') throw datoInvalido();
    const reservaId = String(body.reservaId || '');
    const empresaId = String(body.empresaId || '');
    if (!/^[A-Za-z0-9_-]{6,80}$/.test(reservaId) || !/^[A-Za-z0-9_-]{8,80}$/.test(empresaId)) {
        throw datoInvalido();
    }
    if (!Array.isArray(body.alojamientos) || body.alojamientos.length < 1 || body.alojamientos.length > 8) {
        throw datoInvalido();
    }
    const vistos = new Set();
    const alojamientos = body.alojamientos.map((row) => {
        const id = String(row?.id || '').trim().toLowerCase();
        const noches = Number(row?.noches);
        const personas = Number(row?.personas);
        if (!/^[a-z0-9-]{1,64}$/.test(id) || vistos.has(clavePropiedad(id))) throw datoInvalido();
        if (!fecha(row?.llegada) || !fecha(row?.salida) || row.salida <= row.llegada) throw datoInvalido();
        if (!Number.isInteger(noches) || noches < 1 || noches > 90) throw datoInvalido();
        if (!Number.isInteger(personas) || personas < 0 || personas > 60) throw datoInvalido();
        vistos.add(clavePropiedad(id));
        return { id, llegada: row.llegada, salida: row.salida, noches, personas };
    });
    const at = typeof body.at === 'string' && body.at.length <= 40 ? body.at : new Date().toISOString();
    return { reservaId, empresaId, alojamientos, at };
}

function camposEstadia(item, at) {
    const patch = {
        totalNoches: item.noches,
        modificacionManual: {
            ok: true,
            at,
            origen: 'rezerva',
            llegada: item.llegada,
            salida: item.salida,
        },
    };
    if (item.personas > 0) patch.invitados = item.personas;
    return patch;
}

function parcheModificacion(item, at) {
    return {
        ...camposEstadia(item, at),
        fechaLlegada: admin.firestore.Timestamp.fromDate(new Date(`${item.llegada}T00:00:00Z`)),
        fechaSalida: admin.firestore.Timestamp.fromDate(new Date(`${item.salida}T00:00:00Z`)),
    };
}

function docCorresponde(data, empresaId, item) {
    if (data.empresaId && data.empresaId !== empresaId) return false;
    return clavePropiedad(data.propiedadId) === clavePropiedad(item.id);
}

async function aplicarModificacionDesdeRezerva(db, body) {
    const data = validarModificacion(body);
    const snap = await db.collection('reservas').where('reservaIdOriginal', '==', data.reservaId).limit(20).get();
    if (snap.empty) throw noEncontrado();
    const batch = db.batch();
    let actualizadas = 0;
    snap.docs.forEach((doc) => {
        const prev = doc.data() || {};
        const item = data.alojamientos.find((row) => docCorresponde(prev, data.empresaId, row));
        if (!item) return;
        batch.update(doc.ref, parcheModificacion(item, data.at));
        actualizadas += 1;
    });
    if (!actualizadas) throw noEncontrado();
    await batch.commit();
    return { ok: true, actualizadas };
}

module.exports = {
    validarModificacion,
    camposEstadia,
    aplicarModificacionDesdeRezerva,
    clavePropiedad,
};
