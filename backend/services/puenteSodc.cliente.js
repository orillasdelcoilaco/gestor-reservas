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

function validarClienteDesdeRezerva(body) {
    if (!body || typeof body !== 'object') throw datoInvalido();

    const origenId = String(body.origenId || '').trim();
    const reservaIdOriginal = String(body.reservaIdOriginal || '').trim();
    const telefono = String(body.telefono ?? '').replace(/\D/g, '');
    const email = String(body.email ?? '').trim().toLowerCase();
    const tieneCalificacion = Object.prototype.hasOwnProperty.call(body, 'calificacion');
    const tieneNotas = Object.prototype.hasOwnProperty.call(body, 'notas');

    if (!origenId || origenId.length > 180) throw datoInvalido();
    if (!/^[A-Za-z0-9_-]{4,80}$/.test(reservaIdOriginal)) throw datoInvalido();
    if (!telefono && !email) throw datoInvalido();
    if (telefono && !/^\d{8,15}$/.test(telefono)) throw datoInvalido();
    if (email && (!/^[^\s@]+@[^\s@]+$/.test(email) || email.length > 120)) throw datoInvalido();
    if (!tieneCalificacion && !tieneNotas) throw datoInvalido();

    const calificacion = tieneCalificacion ? Number(body.calificacion) : null;
    if (tieneCalificacion && (!Number.isInteger(calificacion) || calificacion < 0 || calificacion > 5)) {
        throw datoInvalido();
    }
    const notas = tieneNotas ? String(body.notas ?? '').trim() : null;
    if (tieneNotas && notas.length > 2000) throw datoInvalido();

    return {
        origenId,
        reservaIdOriginal,
        telefono,
        email,
        tieneCalificacion,
        tieneNotas,
        calificacion,
        notas,
    };
}

async function buscarClientes(db, telefono, email) {
    const porId = new Map();

    if (telefono) {
        const snap = await db.collection('clientes').where('phone', '==', telefono).limit(5).get();
        snap.docs.forEach((doc) => porId.set(doc.id, doc));
    }
    if (email) {
        const snap = await db.collection('clientes').where('email', '==', email).limit(5).get();
        snap.docs.forEach((doc) => porId.set(doc.id, doc));
    }

    return [...porId.values()];
}

/**
 * Copia calificacion / notas nacidas en Rezerva al cliente de Firestore.
 * Si el cliente no está: 200 ausente, no crea. No cambia estado. No reenvía.
 */
async function aplicarClienteDesdeRezerva(db, body) {
    const data = validarClienteDesdeRezerva(body);
    const reservaSnap = await db.collection('reservas').doc(data.origenId).get();
    if (!reservaSnap.exists) throw noEncontrado();

    const reserva = reservaSnap.data() || {};
    const encontrados = await buscarClientes(db, data.telefono, data.email);
    const deLaReserva = reserva.clienteId
        ? encontrados.find((doc) => doc.id === reserva.clienteId)
        : null;
    const elegido = deLaReserva || (encontrados.length === 1 ? encontrados[0] : null);

    if (!elegido) {
        return {
            ok: true,
            accion: encontrados.length ? 'ambigua' : 'ausente',
            origenId: data.origenId,
            calificacion: data.tieneCalificacion,
            notas: data.tieneNotas,
        };
    }

    const update = {
        fechaUltimoPuenteCliente: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (data.tieneCalificacion) update.calificacion = data.calificacion;
    if (data.tieneNotas) update.notas = data.notas;

    await elegido.ref.update(update);

    return {
        ok: true,
        accion: 'actualizada',
        origenId: data.origenId,
        clienteId: elegido.id,
        calificacion: data.tieneCalificacion,
        notas: data.tieneNotas,
    };
}

module.exports = {
    validarClienteDesdeRezerva,
    aplicarClienteDesdeRezerva,
};
