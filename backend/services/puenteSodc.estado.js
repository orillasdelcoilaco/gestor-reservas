const admin = require('firebase-admin');

const ESTADOS_RESERVA = new Set([
    'Confirmada',
    'Cancelada',
    'No Presentado',
    'Pendiente Aprobación',
    'Abandonada',
    'Rechazada',
]);

const ESTADOS_GESTION = new Set([
    'Pendiente Bienvenida',
    'Pendiente Cobro',
    'Pendiente Pago',
    'Pendiente Boleta',
    'Pendiente Salida',
    'Facturado',
]);

function datoInvalido(mensaje = 'datos_invalidos') {
    const err = new Error(mensaje);
    err.statusCode = 400;
    return err;
}

function noEncontrado() {
    const err = new Error('reserva_no_encontrada');
    err.statusCode = 404;
    return err;
}

function textoOpcional(value, max = 80) {
    if (value === undefined || value === null || value === '') return null;
    const text = String(value).trim();
    if (!text || text.length > max) throw datoInvalido();
    return text;
}

function validarCambioEstado(body) {
    if (!body || typeof body !== 'object') throw datoInvalido();

    const origenId = textoOpcional(body.origenId, 120);
    const reservaId = textoOpcional(body.reservaId, 80);
    const reservaIdOriginal = textoOpcional(body.reservaIdOriginal, 80);
    const empresaId = textoOpcional(body.empresaId, 80);

    if (!origenId && !reservaId && !reservaIdOriginal) throw datoInvalido();

    const estado = body.estado === undefined || body.estado === null || body.estado === ''
        ? null
        : String(body.estado).trim();
    const estadoGestion = body.estadoGestion === undefined || body.estadoGestion === null || body.estadoGestion === ''
        ? null
        : String(body.estadoGestion).trim();

    if (!estado && !estadoGestion) throw datoInvalido();
    if (estado && !ESTADOS_RESERVA.has(estado)) throw datoInvalido();
    if (estadoGestion && !ESTADOS_GESTION.has(estadoGestion)) throw datoInvalido();

    return { origenId, reservaId, reservaIdOriginal, empresaId, estado, estadoGestion };
}

async function buscarDocs(db, data) {
    if (data.origenId) {
        const snap = await db.collection('reservas').doc(data.origenId).get();
        return snap.exists ? [snap] : [];
    }

    if (data.reservaId) {
        let query = db.collection('reservas').where('rezervaReservaId', '==', data.reservaId);
        if (data.empresaId) query = query.where('empresaId', '==', data.empresaId);
        const snap = await query.limit(20).get();
        if (!snap.empty) return snap.docs;
    }

    if (data.reservaIdOriginal) {
        const snap = await db.collection('reservas')
            .where('reservaIdOriginal', '==', data.reservaIdOriginal)
            .limit(20)
            .get();
        return snap.docs;
    }

    return [];
}

/**
 * Aplica estado / estadoGestion enviados por Rezerva.
 * No reenvía a Rezerva (evita bucles).
 */
async function aplicarEstadoDesdeRezerva(db, body) {
    const data = validarCambioEstado(body);
    const docs = await buscarDocs(db, data);
    if (!docs.length) throw noEncontrado();

    const batch = db.batch();
    const ids = [];
    docs.forEach((doc) => {
        const update = {
            fechaUltimoPuenteEstado: admin.firestore.FieldValue.serverTimestamp(),
        };
        if (data.estado) update.estado = data.estado;
        if (data.estadoGestion) update.estadoGestion = data.estadoGestion;
        batch.update(doc.ref, update);
        ids.push(doc.id);
    });
    await batch.commit();
    return { ok: true, actualizadas: ids.length, ids };
}

module.exports = {
    ESTADOS_RESERVA,
    ESTADOS_GESTION,
    validarCambioEstado,
    aplicarEstadoDesdeRezerva,
};
