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

function validarNotaDesdeRezerva(body) {
    if (!body || typeof body !== 'object') throw datoInvalido();

    const origenId = String(body.origenId || '').trim();
    const origenNotaId = String(body.origenNotaId || '').trim();
    const reservaIdOriginal = String(body.reservaIdOriginal || '').trim();
    const texto = String(body.texto || '').trim();
    const autor = String(body.autor || '').trim();
    const fecha = String(body.fecha || '').trim();

    if (!origenId || origenId.length > 120) throw datoInvalido();
    if (!/^[A-Za-z0-9_-]{4,80}$/.test(origenNotaId)) throw datoInvalido();
    if (!reservaIdOriginal || reservaIdOriginal.length > 80) throw datoInvalido();
    if (!texto || texto.length > 4000) throw datoInvalido();
    if (!autor || autor.length > 120) throw datoInvalido();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw datoInvalido();

    return { origenId, origenNotaId, reservaIdOriginal, texto, autor, fecha };
}

/**
 * Copia una nota nacida en Rezerva a gestion_notas.
 * Idempotente por origenNotaId. No cambia estado. No reenvía a Rezerva.
 */
async function aplicarNotaDesdeRezerva(db, body) {
    const data = validarNotaDesdeRezerva(body);
    const reservaSnap = await db.collection('reservas').doc(data.origenId).get();
    if (!reservaSnap.exists) throw noEncontrado();

    const notaRef = db.collection('gestion_notas').doc(data.origenNotaId);
    const notaSnap = await notaRef.get();
    if (notaSnap.exists) {
        return {
            ok: true,
            ya_registrada: true,
            origenId: data.origenId,
            origenNotaId: data.origenNotaId,
        };
    }

    await notaRef.set({
        reservaIdOriginal: data.reservaIdOriginal,
        texto: data.texto,
        autor: data.autor,
        fecha: admin.firestore.Timestamp.fromDate(new Date(`${data.fecha}T00:00:00Z`)),
    });

    return {
        ok: true,
        creada: true,
        origenId: data.origenId,
        origenNotaId: data.origenNotaId,
    };
}

module.exports = {
    validarNotaDesdeRezerva,
    aplicarNotaDesdeRezerva,
};
