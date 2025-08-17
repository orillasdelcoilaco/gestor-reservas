const admin = require('firebase-admin');
const { getValorDolar } = require('./dolarService');

// --- Funciones de Ayuda para Limpieza y Formato ---

/**
 * Convierte varios formatos de fecha de los reportes a un objeto Date de JavaScript.
 * @param {string|Date|Object} dateValue - El valor de fecha del reporte.
 * @returns {Date|null} Un objeto Date válido o null si no se puede convertir.
 */
function parseDate(dateValue) {
    if (!dateValue) return null;
    if (dateValue instanceof Date) return dateValue;
    // Maneja el formato de número de serie de Excel
    if (typeof dateValue === 'number') {
        // Excel's epoch starts on 1899-12-30. JS epoch is 1970-01-01.
        // The formula accounts for this difference and Excel's leap year bug.
        return new Date(Date.UTC(1899, 11, 30, 0, 0, 0, 0) + dateValue * 86400000);
    }
    // Maneja formatos de texto comunes
    if (typeof dateValue === 'string') {
        // Intenta varios formatos comunes, priorizando YYYY-MM-DD
        const date = new Date(dateValue.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1'));
        if (!isNaN(date)) return date;
    }
    return null;
}


/**
 * Limpia y convierte un valor monetario a un número.
 * @param {string|number} value - El valor a limpiar (ej: "$550,000", "739.92 USD").
 * @returns {number} El valor numérico.
 */
function parseCurrency(value) {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        // Elimina todo excepto números, comas, puntos y el signo negativo
        return parseFloat(value.replace(/[^0-9.,-]/g, '').replace(',', '.')) || 0;
    }
    return 0;
}

/**
 * Procesa las reservas de un canal (SODC o Booking).
 * @param {admin.firestore.Firestore} db - La instancia de Firestore.
 * @param {string} channel - El nombre del canal ("SODC" o "Booking").
 * @returns {Promise<string>} Un resumen del procesamiento.
 */
async function processChannel(db, channel) {
    const rawCollectionName = `reportes_${channel.toLowerCase()}_raw`;
    const rawDocsSnapshot = await db.collection(rawCollectionName).get();
    
    if (rawDocsSnapshot.empty) {
        return `No hay nuevos reportes para procesar de ${channel}.`;
    }

    console.log(`Procesando ${rawDocsSnapshot.size} registros de ${channel}...`);
    const batch = db.batch();

    for (const doc of rawDocsSnapshot.docs) {
        const rawData = doc.data();
        
        // --- 1. Mapeo y Limpieza de Datos ---
        const isBooking = channel === 'Booking';
        const reservaData = {
            reservaIdOriginal: (isBooking ? rawData['Número de reserva'] : rawData['Identidad'])?.toString() || `SIN_ID_${Date.now()}`,
            nombreCompleto: isBooking ? rawData['Nombre del cliente (o clientes)'] : `${rawData['Nombre'] || ''} ${rawData['Apellido'] || ''}`.trim(),
            email: rawData['Email'] || rawData['Correo'] || null,
            telefono: rawData['Teléfono'] || rawData['Número de teléfono'] || null,
            fechaLlegada: parseDate(isBooking ? rawData['Entrada'] : rawData['Día de llegada']),
            fechaSalida: parseDate(isBooking ? rawData['Salida'] : rawData['Día de salida']),
            fechaReserva: parseDate(isBooking ? rawData['Fecha de reserva'] : rawData['Fecha']),
            estado: isBooking ? (rawData['Estado'] === 'ok' ? 'Confirmada' : 'Cancelada') : rawData['Estado'],
            invitados: parseInt(rawData['Personas'] || rawData['Adultos/Invitados'] || 0),
            valorOriginal: parseCurrency(isBooking ? rawData['Precio'] : rawData['Total']),
            monedaOriginal: isBooking ? 'USD' : 'CLP',
            alojamientos: (isBooking ? rawData['Tipo de unidad'] : rawData['Alojamiento'])?.toString().split(',').map(c => c.trim()) || []
        };

        if (!reservaData.fechaLlegada || !reservaData.fechaSalida) {
            console.warn(`Reserva omitida por fechas inválidas: ${reservaData.reservaIdOriginal}`);
            continue;
        }

        // --- 2. Buscar o Crear Cliente ---
        let clienteId = reservaData.email ? reservaData.email.toLowerCase() : reservaData.telefono;
        if (!clienteId) {
            console.warn(`Reserva omitida por falta de email/teléfono: ${reservaData.reservaIdOriginal}`);
            continue;
        }
        const clienteRef = db.collection('clientes').doc(clienteId);
        batch.set(clienteRef, {
            firstname: reservaData.nombreCompleto.split(' ')[0],
            lastname: reservaData.nombreCompleto.split(' ').slice(1).join(' '),
            email: reservaData.email,
            phone: reservaData.telefono
        }, { merge: true });

        // --- 3. Procesar cada cabaña de la reserva ---
        for (const cabana of reservaData.alojamientos) {
            if (!cabana) continue;

            const idCompuesto = `${channel.toUpperCase()}_${reservaData.reservaIdOriginal}_${cabana.replace(/\s+/g, '')}`;
            const reservaRef = db.collection('reservas').doc(idCompuesto);

            let valorCLP = reservaData.valorOriginal;
            let valorDolarDia = null;

            if (isBooking) {
                valorDolarDia = await getValorDolar(db, reservaData.fechaLlegada);
                const precioPorCabanaUSD = reservaData.alojamientos.length > 0 ? (reservaData.valorOriginal / reservaData.alojamientos.length) : 0;
                valorCLP = Math.round(precioPorCabanaUSD * valorDolarDia * 1.19); // Agregamos IVA
            }

            const totalNoches = Math.round((reservaData.fechaSalida - reservaData.fechaLlegada) / (1000 * 60 * 60 * 24));

            batch.set(reservaRef, {
                reservaIdOriginal: reservaData.reservaIdOriginal,
                canal: channel,
                estado: reservaData.estado,
                fechaReserva: reservaData.fechaReserva ? admin.firestore.Timestamp.fromDate(reservaData.fechaReserva) : null,
                fechaLlegada: admin.firestore.Timestamp.fromDate(reservaData.fechaLlegada),
                fechaSalida: admin.firestore.Timestamp.fromDate(reservaData.fechaSalida),
                totalNoches: totalNoches > 0 ? totalNoches : 1,
                invitados: reservaData.invitados,
                alojamiento: cabana,
                monedaOriginal: reservaData.monedaOriginal,
                valorOriginal: reservaData.alojamientos.length > 0 ? (reservaData.valorOriginal / reservaData.alojamientos.length) : 0,
                valorCLP: valorCLP,
                valorDolarDia: valorDolarDia,
                clienteId: clienteId
            }, { merge: true });
        }
        // Borramos el documento crudo ya procesado
        batch.delete(doc.ref);
    }

    await batch.commit();
    return `Se procesaron y consolidaron ${rawDocsSnapshot.size} registros de ${channel}.`;
}

// Asegúrate de que la exportación esté al final y sea correcta
module.exports = {
  processChannel,
};
