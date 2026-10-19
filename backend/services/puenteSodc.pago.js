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

function validarPagoDesdeRezerva(body) {
    if (!body || typeof body !== 'object') throw datoInvalido();

    const origenId = String(body.origenId || '').trim();
    const origenPagoId = String(body.origenPagoId || '').trim();
    const medioDePago = String(body.medioDePago || '').trim();
    const tipo = String(body.tipo || '').trim();
    const fecha = String(body.fecha || '').trim();
    const monto = Number(body.monto);

    if (!origenId || origenId.length > 120) throw datoInvalido();
    if (!/^[A-Za-z0-9_-]{4,80}$/.test(origenPagoId)) throw datoInvalido();
    if (!Number.isInteger(monto) || monto < 1 || monto > 100000000) throw datoInvalido();
    if (!medioDePago || medioDePago.length > 80) throw datoInvalido();
    if (tipo !== 'Abono') throw datoInvalido();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw datoInvalido();

    return { origenId, origenPagoId, monto, medioDePago, tipo, fecha };
}

/**
 * Registra un abono nacido en Rezerva.
 * Idempotente por origenPagoId. No cambia estado/estadoGestion. No reenvía a Rezerva.
 */
async function aplicarPagoDesdeRezerva(db, body) {
    const data = validarPagoDesdeRezerva(body);
    const reservaRef = db.collection('reservas').doc(data.origenId);
    const reservaSnap = await reservaRef.get();
    if (!reservaSnap.exists) throw noEncontrado();

    const txRef = reservaRef.collection('transacciones').doc(data.origenPagoId);
    const txSnap = await txRef.get();
    if (txSnap.exists) {
        return {
            ok: true,
            ya_registrado: true,
            origenId: data.origenId,
            origenPagoId: data.origenPagoId,
        };
    }

    const batch = db.batch();
    batch.set(txRef, {
        monto: data.monto,
        medioDePago: data.medioDePago,
        tipo: data.tipo,
        fecha: admin.firestore.Timestamp.fromDate(new Date(`${data.fecha}T00:00:00Z`)),
        origenPagoId: data.origenPagoId,
        puenteDesdeRezerva: true,
        enlaceComprobante: null,
    });

    const txs = await reservaRef.collection('transacciones').get();
    const totalAbonado = txs.docs.reduce((sum, doc) => sum + (Number(doc.data().monto) || 0), 0) + data.monto;
    batch.update(reservaRef, {
        abono: totalAbonado,
        fechaUltimoPuentePago: admin.firestore.FieldValue.serverTimestamp(),
    });

    await batch.commit();
    return {
        ok: true,
        registrado: true,
        origenId: data.origenId,
        origenPagoId: data.origenPagoId,
        abono: totalAbonado,
    };
}

function validarBajaPagoDesdeRezerva(body) {
    if (!body || typeof body !== 'object') throw datoInvalido();
    const origenId = String(body.origenId || '').trim();
    const origenPagoId = String(body.origenPagoId || '').trim();
    if (!origenId || origenId.length > 120) throw datoInvalido();
    if (!/^[A-Za-z0-9_-]{4,80}$/.test(origenPagoId)) throw datoInvalido();
    return { origenId, origenPagoId };
}

/**
 * Borra un abono que Rezerva ya eliminó.
 * Idempotente si el doc no está. No cambia estado. No reenvía a Rezerva.
 */
async function aplicarBajaPagoDesdeRezerva(db, body) {
    const data = validarBajaPagoDesdeRezerva(body);
    const reservaRef = db.collection('reservas').doc(data.origenId);
    const reservaSnap = await reservaRef.get();
    if (!reservaSnap.exists) throw noEncontrado();

    const txRef = reservaRef.collection('transacciones').doc(data.origenPagoId);
    const txSnap = await txRef.get();
    if (!txSnap.exists) {
        return { ok: true, ya_ausente: true, origenId: data.origenId, origenPagoId: data.origenPagoId };
    }

    await txRef.delete();
    const txs = await reservaRef.collection('transacciones').get();
    const totalAbonado = txs.docs.reduce((sum, doc) => sum + (Number(doc.data().monto) || 0), 0);
    await reservaRef.update({
        abono: totalAbonado,
        fechaUltimoPuentePago: admin.firestore.FieldValue.serverTimestamp(),
    });
    return {
        ok: true,
        eliminado: true,
        origenId: data.origenId,
        origenPagoId: data.origenPagoId,
        abono: totalAbonado,
    };
}

module.exports = {
    validarPagoDesdeRezerva,
    aplicarPagoDesdeRezerva,
    validarBajaPagoDesdeRezerva,
    aplicarBajaPagoDesdeRezerva,
};
