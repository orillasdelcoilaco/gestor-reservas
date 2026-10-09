const admin = require('firebase-admin');
const { findOrCreateClient } = require('./clienteService');
const { cleanPhoneNumber, cleanCabanaName } = require('../utils/helpers');

function datoInvalido() {
    const err = new Error('datos_invalidos');
    err.statusCode = 400;
    return err;
}

function entero(value, min, max) {
    const number = Number(value);
    return Number.isInteger(number) && number >= min && number <= max;
}

function fecha(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function validarAlta(body) {
    if (!body || typeof body !== 'object') throw datoInvalido();
    const reservaId = String(body.reservaId || '');
    const empresaId = String(body.empresaId || '');
    if (!/^[A-Za-z0-9_-]{6,80}$/.test(reservaId) || !/^[A-Za-z0-9_-]{8,80}$/.test(empresaId)) {
        throw datoInvalido();
    }
    if (!fecha(body.llegada) || !fecha(body.salida) || body.salida <= body.llegada) throw datoInvalido();
    if (!entero(body.noches, 1, 90) || !entero(body.personas, 1, 60)) throw datoInvalido();
    if (!entero(body.total, 1, 100000000) || !entero(body.abono, 0, body.total)) throw datoInvalido();
    const guest = body.huesped || {};
    const nombre = String(guest.nombre || '').trim();
    const email = String(guest.email || '').trim();
    const telefono = String(guest.telefono || '').trim();
    if (nombre.length < 2 || nombre.length > 120 || email.length > 120 || !/^[^\s@]+@[^\s@]+$/.test(email)) {
        throw datoInvalido();
    }
    if (!/^\+?[0-9]{8,15}$/.test(telefono)) throw datoInvalido();
    if (!Array.isArray(body.alojamientos) || body.alojamientos.length < 1 || body.alojamientos.length > 8) {
        throw datoInvalido();
    }
    let sumaTotal = 0;
    let sumaAbono = 0;
    const vistos = new Set();
    const alojamientos = body.alojamientos.map((row) => {
        const id = String(row?.id || '');
        const nombreCabana = cleanCabanaName(String(row?.nombre || '')).slice(0, 80);
        if (!/^[a-z0-9-]{1,64}$/.test(id) || !nombreCabana || vistos.has(id)) throw datoInvalido();
        if (!entero(row.total, 0, body.total) || !entero(row.abono, 0, row.total)) throw datoInvalido();
        vistos.add(id);
        sumaTotal += row.total;
        sumaAbono += row.abono;
        return { id, nombre: nombreCabana, total: row.total, abono: row.abono };
    });
    if (sumaTotal !== body.total || sumaAbono !== body.abono) throw datoInvalido();
    return {
        reservaId,
        empresaId,
        llegada: body.llegada,
        salida: body.salida,
        noches: body.noches,
        personas: body.personas,
        alojamientos,
        huesped: { nombre, email, telefono },
    };
}

async function crearDesdeSodc(db, body) {
    const data = validarAlta(body);
    const existentes = await db.collection('reservas').where('reservaIdOriginal', '==', data.reservaId).get();
    const ya = new Set(existentes.docs.map((doc) => doc.data().propiedadId).filter(Boolean));
    const faltan = data.alojamientos.filter((row) => !ya.has(row.id));
    if (!faltan.length) return { creada: false, reservaId: data.reservaId };

    const clienteId = await findOrCreateClient(db, {
        nombre: data.huesped.nombre,
        telefono: cleanPhoneNumber(data.huesped.telefono),
        email: data.huesped.email,
        empresa: 'SODC',
    });
    const batch = db.batch();
    const llegada = admin.firestore.Timestamp.fromDate(new Date(`${data.llegada}T00:00:00Z`));
    const salida = admin.firestore.Timestamp.fromDate(new Date(`${data.salida}T00:00:00Z`));
    faltan.forEach((row) => {
        const ref = db.collection('reservas').doc(`SODC_${data.reservaId}_${row.id}`);
        batch.set(ref, {
            reservaIdOriginal: data.reservaId,
            rezervaReservaId: data.reservaId,
            empresaId: data.empresaId,
            propiedadId: row.id,
            puenteSodc: true,
            clienteId,
            clienteNombre: data.huesped.nombre,
            canal: 'SODC',
            estado: 'Confirmada',
            estadoGestion: 'Pendiente Bienvenida',
            fechaReserva: admin.firestore.FieldValue.serverTimestamp(),
            fechaLlegada: llegada,
            fechaSalida: salida,
            totalNoches: data.noches,
            invitados: data.personas,
            alojamiento: row.nombre,
            valorPotencialCLP: row.total,
            valorCLP: row.total,
            valorOriginal: row.total,
            monedaOriginal: 'CLP',
            precioIncluyeIva: true,
            valorManual: false,
            telefono: data.huesped.telefono,
            correo: data.huesped.email,
            abono: row.abono,
            pagado: false,
            boleta: false,
            pendiente: row.total - row.abono,
        });
    });
    await batch.commit();
    return { creada: true, reservaId: data.reservaId };
}

module.exports = { crearDesdeSodc };
