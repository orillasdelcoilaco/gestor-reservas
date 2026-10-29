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

function canalValido(value) {
    const canal = String(value || '').trim().slice(0, 40);
    return canal || 'SODC';
}

function monedaValida(value) {
    return String(value || '').trim().toUpperCase() === 'USD' ? 'USD' : 'CLP';
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
    if (nombre.length < 2 || nombre.length > 120 || email.length > 120) throw datoInvalido();
    if (email && !/^[^\s@]+@[^\s@]+$/.test(email)) throw datoInvalido();
    if (!/^\+?[0-9]{8,15}$/.test(telefono)) throw datoInvalido();
    if (!Array.isArray(body.alojamientos) || body.alojamientos.length < 1 || body.alojamientos.length > 8) {
        throw datoInvalido();
    }
    const canal = canalValido(body.canal);
    const monedaOriginal = monedaValida(body.monedaOriginal);
    const valorDolarDiaRaw = Number(body.valorDolarDia);
    const valorDolarDia = Number.isFinite(valorDolarDiaRaw) && valorDolarDiaRaw > 0 ? valorDolarDiaRaw : null;
    let sumaTotal = 0;
    let sumaAbono = 0;
    const vistos = new Set();
    const alojamientos = body.alojamientos.map((row) => {
        const id = String(row?.id || '');
        const nombreCabana = cleanCabanaName(String(row?.nombre || '')).slice(0, 80);
        if (!/^[a-z0-9-]{1,64}$/.test(id) || !nombreCabana || vistos.has(id)) throw datoInvalido();
        if (!entero(row.total, 0, body.total) || !entero(row.abono, 0, row.total)) throw datoInvalido();
        const valorOriginalRaw = Number(row.valorOriginal);
        const valorOriginal = Number.isFinite(valorOriginalRaw) && valorOriginalRaw > 0
            ? valorOriginalRaw
            : (monedaOriginal === 'USD' ? null : row.total);
        vistos.add(id);
        sumaTotal += row.total;
        sumaAbono += row.abono;
        return {
            id,
            nombre: nombreCabana,
            total: row.total,
            abono: row.abono,
            valorOriginal,
        };
    });
    if (sumaTotal !== body.total || sumaAbono !== body.abono) throw datoInvalido();
    return {
        reservaId,
        empresaId,
        llegada: body.llegada,
        salida: body.salida,
        noches: body.noches,
        personas: body.personas,
        canal,
        monedaOriginal,
        valorDolarDia,
        alojamientos,
        huesped: { nombre, email, telefono },
    };
}

function prefijoDoc(canal) {
    return String(canal || 'SODC').trim().toUpperCase().replace(/\s+/g, '') || 'SODC';
}

async function crearDesdeSodc(db, body) {
    const data = validarAlta(body);
    const existentes = await db.collection('reservas').where('reservaIdOriginal', '==', data.reservaId).get();
    const ya = new Set(existentes.docs.map((doc) => doc.data().propiedadId).filter(Boolean));
    const faltan = data.alojamientos.filter((row) => !ya.has(row.id));
    if (!faltan.length) {
        // Misma reserva ya espejada: corregir canal/moneda si llegaron mal (p. ej. Booking → SODC).
        const batchFix = db.batch();
        let cambios = 0;
        existentes.docs.forEach((doc) => {
            const prev = doc.data() || {};
            if (prev.puenteSodc !== true) return;
            const patch = {};
            if (prev.canal !== data.canal) patch.canal = data.canal;
            if (prev.monedaOriginal !== data.monedaOriginal) patch.monedaOriginal = data.monedaOriginal;
            if (data.valorDolarDia && prev.valorDolarDia !== data.valorDolarDia) {
                patch.valorDolarDia = data.valorDolarDia;
            }
            const row = data.alojamientos.find((item) => item.id === prev.propiedadId);
            if (row && data.monedaOriginal === 'USD' && row.valorOriginal != null) {
                if (prev.valorOriginal !== row.valorOriginal) patch.valorOriginal = row.valorOriginal;
                if (prev.valorFinalUSD !== row.valorOriginal) patch.valorFinalUSD = row.valorOriginal;
                if (prev.valorPotencialUSD !== row.valorOriginal) patch.valorPotencialUSD = row.valorOriginal;
            }
            if (!Object.keys(patch).length) return;
            batchFix.update(doc.ref, patch);
            cambios += 1;
        });
        if (cambios) await batchFix.commit();
        return { creada: false, reservaId: data.reservaId, canalActualizado: cambios > 0 };
    }

    const clienteId = await findOrCreateClient(db, {
        nombre: data.huesped.nombre,
        telefono: cleanPhoneNumber(data.huesped.telefono),
        email: data.huesped.email,
        empresa: data.canal,
    });
    const batch = db.batch();
    const llegada = admin.firestore.Timestamp.fromDate(new Date(`${data.llegada}T00:00:00Z`));
    const salida = admin.firestore.Timestamp.fromDate(new Date(`${data.salida}T00:00:00Z`));
    const esUsd = data.monedaOriginal === 'USD';
    faltan.forEach((row) => {
        const valorOriginal = esUsd
            ? (row.valorOriginal != null ? row.valorOriginal : null)
            : row.total;
        const ref = db.collection('reservas').doc(`${prefijoDoc(data.canal)}_${data.reservaId}_${row.id}`);
        batch.set(ref, {
            reservaIdOriginal: data.reservaId,
            rezervaReservaId: data.reservaId,
            empresaId: data.empresaId,
            propiedadId: row.id,
            puenteSodc: true,
            clienteId,
            clienteNombre: data.huesped.nombre,
            canal: data.canal,
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
            valorOriginal: valorOriginal != null ? valorOriginal : row.total,
            monedaOriginal: data.monedaOriginal,
            valorDolarDia: esUsd ? data.valorDolarDia : null,
            valorPotencialUSD: esUsd ? valorOriginal : null,
            valorFinalUSD: esUsd ? valorOriginal : null,
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

module.exports = { crearDesdeSodc, validarAlta };
