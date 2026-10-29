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

function enlaceComprobanteValido(value) {
    const url = String(value || '').trim();
    if (!url || url === 'SIN_DOCUMENTO') return null;
    if (!/^https:\/\/[^\s]{1,500}$/i.test(url)) return null;
    return url.slice(0, 500);
}

function textoOpcional(value, max) {
    if (value === undefined || value === null || value === '') return null;
    const text = String(value).trim();
    if (!text || text.length > max) throw datoInvalido();
    return text;
}

function validarPagoDesdeRezerva(body) {
    if (!body || typeof body !== 'object') throw datoInvalido();

    const origenId = textoOpcional(body.origenId, 120);
    const reservaId = textoOpcional(body.reservaId, 80);
    const reservaIdOriginal = textoOpcional(body.reservaIdOriginal, 80);
    const empresaId = textoOpcional(body.empresaId, 80);
    const medioDePago = String(body.medioDePago || '').trim();
    const tipo = String(body.tipo || '').trim();
    const fecha = String(body.fecha || '').trim();
    const monto = Number(body.monto);
    const enlaceComprobante = enlaceComprobanteValido(body.enlaceComprobante);

    if (!origenId && !reservaId && !reservaIdOriginal) throw datoInvalido();
    if (!/^[A-Za-z0-9_-]{4,80}$/.test(String(body.origenPagoId || '').trim())) throw datoInvalido();
    if (!Number.isInteger(monto) || monto < 1 || monto > 100000000) throw datoInvalido();
    if (!medioDePago || medioDePago.length > 80) throw datoInvalido();
    if (tipo !== 'Abono') throw datoInvalido();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw datoInvalido();

    return {
        origenId,
        reservaId,
        reservaIdOriginal,
        empresaId,
        origenPagoId: String(body.origenPagoId).trim(),
        monto,
        medioDePago,
        tipo,
        fecha,
        enlaceComprobante,
    };
}

async function buscarReservasPago(db, data) {
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

async function aplicarPagoEnReserva(reservaRef, data) {
    const txRef = reservaRef.collection('transacciones').doc(data.origenPagoId);
    const txSnap = await txRef.get();
    if (txSnap.exists) {
        const prev = txSnap.data() || {};
        const prevUrl = String(prev.enlaceComprobante || '').trim();
        if (data.enlaceComprobante && (!prevUrl || prevUrl === 'SIN_DOCUMENTO')) {
            await txRef.set({ enlaceComprobante: data.enlaceComprobante }, { merge: true });
            return { ya_registrado: true, comprobante_actualizado: true };
        }
        return { ya_registrado: true, comprobante_actualizado: false };
    }

    const batch = dbBatchFor(reservaRef);
    batch.set(txRef, {
        monto: data.monto,
        medioDePago: data.medioDePago,
        tipo: data.tipo,
        fecha: admin.firestore.Timestamp.fromDate(new Date(`${data.fecha}T00:00:00Z`)),
        origenPagoId: data.origenPagoId,
        puenteDesdeRezerva: true,
        enlaceComprobante: data.enlaceComprobante,
    });

    const txs = await reservaRef.collection('transacciones').get();
    const totalAbonado = txs.docs.reduce((sum, doc) => sum + (Number(doc.data().monto) || 0), 0) + data.monto;
    batch.update(reservaRef, {
        abono: totalAbonado,
        fechaUltimoPuentePago: admin.firestore.FieldValue.serverTimestamp(),
    });
    await batch.commit();
    return { registrado: true, abono: totalAbonado };
}

function dbBatchFor(reservaRef) {
    return reservaRef.firestore.batch();
}

/**
 * Registra un abono nacido en Rezerva.
 * Idempotente por origenPagoId. No cambia estado/estadoGestion. No reenvía a Rezerva.
 * Acepta origenId (doc gestor) o reservaId/reservaIdOriginal como el aviso de estado.
 */
async function aplicarPagoDesdeRezerva(db, body) {
    const data = validarPagoDesdeRezerva(body);
    const docs = await buscarReservasPago(db, data);
    if (!docs.length) throw noEncontrado();

    let registrado = false;
    let comprobanteActualizado = false;
    let abono = null;
    const ids = [];
    for (const doc of docs) {
        const result = await aplicarPagoEnReserva(doc.ref, data);
        ids.push(doc.id);
        if (result.registrado) {
            registrado = true;
            abono = result.abono;
        }
        if (result.comprobante_actualizado) comprobanteActualizado = true;
    }

    return {
        ok: true,
        registrado,
        ya_registrado: !registrado,
        comprobante_actualizado: comprobanteActualizado,
        origenId: data.origenId || ids[0] || null,
        origenPagoId: data.origenPagoId,
        ids,
        abono,
    };
}

function validarBajaPagoDesdeRezerva(body) {
    if (!body || typeof body !== 'object') throw datoInvalido();
    const origenId = textoOpcional(body.origenId, 120);
    const reservaId = textoOpcional(body.reservaId, 80);
    const reservaIdOriginal = textoOpcional(body.reservaIdOriginal, 80);
    const origenPagoId = String(body.origenPagoId || '').trim();
    if (!origenId && !reservaId && !reservaIdOriginal) throw datoInvalido();
    if (!/^[A-Za-z0-9_-]{4,80}$/.test(origenPagoId)) throw datoInvalido();
    return {
        origenId,
        reservaId,
        reservaIdOriginal,
        empresaId: textoOpcional(body.empresaId, 80),
        origenPagoId,
    };
}

/**
 * Borra un abono que Rezerva ya eliminó.
 * Idempotente si el doc no está. No cambia estado. No reenvía a Rezerva.
 */
async function aplicarBajaPagoDesdeRezerva(db, body) {
    const data = validarBajaPagoDesdeRezerva(body);
    const docs = await buscarReservasPago(db, data);
    if (!docs.length) throw noEncontrado();

    let eliminado = false;
    let abono = 0;
    for (const doc of docs) {
        const txRef = doc.ref.collection('transacciones').doc(data.origenPagoId);
        const txSnap = await txRef.get();
        if (txSnap.exists) {
            await txRef.delete();
            eliminado = true;
        }
        const txs = await doc.ref.collection('transacciones').get();
        abono = txs.docs.reduce((sum, row) => sum + (Number(row.data().monto) || 0), 0);
        await doc.ref.update({
            abono,
            fechaUltimoPuentePago: admin.firestore.FieldValue.serverTimestamp(),
        });
    }
    return {
        ok: true,
        eliminado,
        ya_ausente: !eliminado,
        origenId: data.origenId || docs[0].id,
        origenPagoId: data.origenPagoId,
        abono,
    };
}

module.exports = {
    validarPagoDesdeRezerva,
    aplicarPagoDesdeRezerva,
    validarBajaPagoDesdeRezerva,
    aplicarBajaPagoDesdeRezerva,
};
