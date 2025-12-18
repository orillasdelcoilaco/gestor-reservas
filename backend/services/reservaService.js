// backend/services/reservaService.js

const admin = require('firebase-admin');
const { findOrCreateClient } = require('./clienteService');
const { getValorDolar } = require('./dolarService');

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

    const clienteId = await findOrCreateClient(db, cliente);

    const reservaIdOriginal = `APP-${Date.now()}`;
    const batch = db.batch();

    for (const reserva of propuesta.reservas) {
        const fechaLlegada = new Date(reserva.fechaLlegada + 'T00:00:00Z');
        const fechaSalida = new Date(reserva.fechaSalida + 'T00:00:00Z');
        const totalNoches = Math.round((fechaSalida - fechaLlegada) / (1000 * 60 * 60 * 24));

        const isBooking = canal === 'Booking';
        let valorDolarDia = null;
        if (isBooking) {
            valorDolarDia = await getValorDolar(db, fechaLlegada);
        }

        const valorPotencialUSD = isBooking ? (reserva.valorPotencialUSD || reserva.valorPotencial || 0) : null;
        const valorFinalUSD = isBooking ? (reserva.valorFinalUSD || reserva.valorFinal || 0) : null;
        const valorPotencialCLP = isBooking ? Math.round((valorPotencialUSD || 0) * valorDolarDia * 1.19) : reserva.valorPotencial;
        const valorFinalCLP = isBooking ? Math.round((valorFinalUSD || 0) * valorDolarDia * 1.19) : reserva.valorFinal;

        const idCompuesto = `${canal.toUpperCase()}_${reservaIdOriginal}_${reserva.alojamiento.replace(/\s+/g, '')}`;
        const reservaRef = db.collection('reservas').doc(idCompuesto);

        const dataToSave = {
            reservaIdOriginal,
            clienteId,
            clienteNombre: cliente.nombre,
            canal: canal,
            estado: 'Pendiente Aprobación',
            fechaReserva: admin.firestore.FieldValue.serverTimestamp(),
            fechaLlegada: admin.firestore.Timestamp.fromDate(fechaLlegada),
            fechaSalida: admin.firestore.Timestamp.fromDate(fechaSalida),
            totalNoches: totalNoches > 0 ? totalNoches : 1,
            invitados: propuesta.personas,
            alojamiento: reserva.alojamiento,
            valorPotencialCLP: valorPotencialCLP,
            valorPotencialUSD: isBooking ? valorPotencialUSD : null,
            valorCLP: valorFinalCLP,
            valorFinalUSD: isBooking ? valorFinalUSD : null,
            valorDolarDia: valorDolarDia,
            monedaOriginal: isBooking ? 'USD' : 'CLP',
            descuento: propuesta.descuento || null,
            telefono: cliente.telefono,
            correo: cliente.email,
            valorManual: true,
            estadoGestion: 'Pendiente Bienvenida',
            abono: 0,
            pagado: false,
            boleta: false,
            pendiente: valorFinalCLP
        };

        batch.set(reservaRef, dataToSave);
    }

    await batch.commit();
    return reservaIdOriginal;
}

module.exports = {
    createManualReservation
};
