// backend/services/reservaService.js

const admin = require('firebase-admin');
const { findOrCreateClient } = require('./clienteService');

/**
 * Crea una o más reservas en Firestore a partir de una solicitud manual.
 * @param {admin.firestore.Firestore} db - Instancia de Firestore.
 * @param {object} data - Los datos de la reserva del frontend.
 * @returns {Promise<string>} El ID original de la reserva creada.
 */
async function createManualReservation(db, data) {
    const { cliente, canal, propuesta } = data;

    if (!cliente || !canal || !propuesta) {
        throw new Error('Faltan datos del cliente, canal o la propuesta de reserva.');
    }

    // 1. Obtener o crear el cliente
    const clienteId = await findOrCreateClient(db, cliente);

    // 2. Generar un ID de reserva único para el grupo
    const reservaIdOriginal = `APP-${Date.now()}`;
    const batch = db.batch();

    // 3. Iterar sobre la propuesta (puede ser normal o segmentada)
    for (const reserva of propuesta.reservas) {
        const fechaLlegada = new Date(reserva.fechaLlegada + 'T00:00:00Z');
        const fechaSalida = new Date(reserva.fechaSalida + 'T00:00:00Z');
        const totalNoches = Math.round((fechaSalida - fechaLlegada) / (1000 * 60 * 60 * 24));

        // 4. Construir el ID compuesto para cada documento individual
        const idCompuesto = `${canal.toUpperCase()}_${reservaIdOriginal}_${reserva.alojamiento.replace(/\s+/g, '')}`;
        const reservaRef = db.collection('reservas').doc(idCompuesto);

        const dataToSave = {
            reservaIdOriginal,
            clienteId,
            clienteNombre: cliente.nombre,
            canal: canal,
            estado: 'Pendiente Aprobación', // Estado inicial para propuestas
            fechaReserva: admin.firestore.FieldValue.serverTimestamp(),
            fechaLlegada: admin.firestore.Timestamp.fromDate(fechaLlegada),
            fechaSalida: admin.firestore.Timestamp.fromDate(fechaSalida),
            totalNoches: totalNoches > 0 ? totalNoches : 1,
            invitados: propuesta.personas,
            alojamiento: reserva.alojamiento,
            valorPotencialCLP: reserva.valorPotencial,
            valorCLP: reserva.valorFinal,
            descuento: propuesta.descuento || null,
            telefono: cliente.telefono,
            correo: cliente.email,
            valorManual: true, // Indica que el precio fue fijado manualmente o con descuento
            estadoGestion: 'Pendiente Bienvenida',
            abono: 0,
            pagado: false,
            boleta: false,
            pendiente: reserva.valorFinal
        };

        batch.set(reservaRef, dataToSave);
    }

    await batch.commit();
    return reservaIdOriginal;
}

module.exports = {
    createManualReservation
};