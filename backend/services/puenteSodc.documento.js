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

function validarDocumentoDesdeRezerva(body) {
    if (!body || typeof body !== 'object') throw datoInvalido();

    const origenId = String(body.origenId || '').trim();
    const reservaIdOriginal = String(body.reservaIdOriginal || '').trim();
    const campo = String(body.campo || '').trim();
    const urlRaw = body.url == null ? '' : String(body.url).trim();

    if (!origenId || origenId.length > 120) throw datoInvalido();
    if (!reservaIdOriginal || reservaIdOriginal.length > 80) throw datoInvalido();
    if (campo !== 'enlaceBoleta' && campo !== 'enlaceReserva') throw datoInvalido();

    if (urlRaw !== '') {
        if (urlRaw.length > 500) throw datoInvalido();
        if (/\s/.test(urlRaw)) throw datoInvalido();
        if (!/^https:\/\//i.test(urlRaw)) throw datoInvalido();
    }

    return { origenId, reservaIdOriginal, campo, url: urlRaw };
}

/**
 * Copia enlaceBoleta / enlaceReserva nacido en Rezerva.
 * Url vacía borra la clave. No cambia estado. No reenvía a Rezerva.
 */
async function aplicarDocumentoDesdeRezerva(db, body) {
    const data = validarDocumentoDesdeRezerva(body);
    const reservaRef = db.collection('reservas').doc(data.origenId);
    const reservaSnap = await reservaRef.get();
    if (!reservaSnap.exists) throw noEncontrado();

    const path = `documentos.${data.campo}`;
    const update = {};

    if (data.url === '') {
        update[path] = admin.firestore.FieldValue.delete();
        if (data.campo === 'enlaceBoleta') update.boleta = false;
    } else {
        update[path] = data.url;
        if (data.campo === 'enlaceBoleta') update.boleta = true;
    }

    update.fechaUltimoPuenteDocumento = admin.firestore.FieldValue.serverTimestamp();
    await reservaRef.update(update);

    return {
        ok: true,
        actualizada: true,
        origenId: data.origenId,
        campo: data.campo,
        borrada: data.url === '',
    };
}

module.exports = {
    validarDocumentoDesdeRezerva,
    aplicarDocumentoDesdeRezerva,
};
