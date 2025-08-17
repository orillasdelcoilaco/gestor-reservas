const admin = require('firebase-admin');
const { getValorDolar } = require('./dolarService');

// --- Funciones de Ayuda para Limpieza y Formato ---

function parseDate(dateValue) {
    if (!dateValue) return null;
    if (dateValue instanceof Date && !isNaN(dateValue)) return dateValue;
    if (typeof dateValue === 'number') {
        return new Date(Date.UTC(1899, 11, 30, 0, 0, 0, 0) + dateValue * 86400000);
    }
    if (typeof dateValue === 'string') {
        const date = new Date(dateValue.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1'));
        if (!isNaN(date)) return date;
    }
    return null;
}

function parseCurrency(value) {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        return parseFloat(value.replace(/[^0-9.,-]/g, '').replace(',', '.')) || 0;
    }
    return 0;
}

/**
 * Limpia y normaliza un número de teléfono.
 * @param {string} phone - El número de teléfono.
 * @returns {string|null} El número normalizado (ej: "56975180855") o null.
 */
function cleanPhoneNumber(phone) {
    if (!phone) return null;
    let cleaned = phone.toString().replace(/\s+/g, '').replace(/[-+]/g, '');
    // **CORRECCIÓN: Si es un número chileno de 9 dígitos que empieza con 9, le añade el 56**
    if (cleaned.length === 9 && cleaned.startsWith('9')) {
        return `56${cleaned}`;
    }
    return cleaned;
}

function cleanCabanaName(cabanaName) {
    if (!cabanaName) return '';
    return cabanaName.replace(/(\s+1)$/, '').trim();
}

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
        
        const isBooking = channel === 'Booking';
        const alojamientosRaw = (isBooking ? rawData['Tipo de unidad'] : rawData['Alojamiento']) || "";
        const nombreCompletoRaw = (isBooking ? rawData['Nombre del cliente (o clientes)'] : `${rawData['Nombre'] || ''} ${rawData['Apellido'] || ''}`.trim()) || "Cliente sin Nombre";

        const reservaData = {
            reservaIdOriginal: (isBooking ? rawData['Número de reserva'] : rawData['Identidad'])?.toString() || `SIN_ID_${Date.now()}`,
            nombreCompleto: nombreCompletoRaw,
            email: rawData['Email'] || rawData['Correo'] || null,
            telefono: cleanPhoneNumber(rawData['Teléfono'] || rawData['Número de teléfono']),
            fechaLlegada: parseDate(isBooking ? rawData['Entrada'] : rawData['Día de llegada']),
            fechaSalida: parseDate(isBooking ? rawData['Salida'] : rawData['Día de salida']),
            fechaReserva: parseDate(isBooking ? rawData['Fecha de reserva'] : rawData['Fecha']),
            estado: isBooking ? (rawData['Estado'] === 'ok' ? 'Confirmada' : 'Cancelada') : rawData['Estado'],
            invitados: parseInt(rawData['Personas'] || rawData['Adultos/Invitados'] || 0),
            valorOriginal: parseCurrency(isBooking ? rawData['Precio'] : rawData['Total']),
            monedaOriginal: isBooking ? 'USD' : 'CLP',
            alojamientos: alojamientosRaw.toString().split(',').map(c => cleanCabanaName(c.trim()))
        };

        if (!reservaData.fechaLlegada || !reservaData.fechaSalida) {
            console.warn(`Reserva omitida por fechas inválidas: ${reservaData.reservaIdOriginal}`);
            continue;
        }

        let clienteId = reservaData.telefono; // El teléfono es la clave principal
        if (!clienteId) {
            console.warn(`Reserva omitida por falta de teléfono: ${reservaData.reservaIdOriginal}`);
            continue;
        }
        const clienteRef = db.collection('clientes').doc(clienteId);
        batch.set(clienteRef, {
            firstname: reservaData.nombreCompleto.split(' ')[0],
            lastname: reservaData.nombreCompleto.split(' ').slice(1).join(' '),
            email: reservaData.email,
            phone: reservaData.telefono
        }, { merge: true });

        for (const cabana of reservaData.alojamientos) {
            if (!cabana) continue;

            const idCompuesto = `${channel.toUpperCase()}_${reservaData.reservaIdOriginal}_${cabana.replace(/\s+/g, '')}`;
            const reservaRef = db.collection('reservas').doc(idCompuesto);

            let valorCLP = reservaData.valorOriginal;
            let valorDolarDia = null;

            if (isBooking) {
                valorDolarDia = await getValorDolar(db, reservaData.fechaLlegada);
                const precioPorCabanaUSD = reservaData.alojamientos.length > 0 ? (reservaData.valorOriginal / reservaData.alojamientos.length) : 0;
                valorCLP = Math.round(precioPorCabanaUSD * valorDolarDia * 1.19);
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
                clienteId: clienteId,
                clienteNombre: reservaData.nombreCompleto // <-- GUARDAMOS EL NOMBRE AQUÍ
            }, { merge: true });
        }
        batch.delete(doc.ref);
    }

    await batch.commit();
    return `Se procesaron y consolidaron ${rawDocsSnapshot.size} registros de ${channel}.`;
}

module.exports = {
  processChannel,
};
