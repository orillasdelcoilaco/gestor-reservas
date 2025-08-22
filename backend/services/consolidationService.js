// backend/services/consolidationService.js - CÓDIGO CORREGIDO

const admin = require('firebase-admin');
const { getValorDolar } = require('./dolarService');
const { createGoogleContact } = require('./googleContactsService');

// --- NUEVA FUNCIÓN cleanCabanaName ---
function cleanCabanaName(cabanaName) {
    if (!cabanaName || typeof cabanaName !== 'string') return '';
    // Esta nueva versión elimina un número extra al final, como en "Cabaña 10 1" -> "Cabaña 10"
    return cabanaName.replace(/\s+\d+$/, '').trim();
}

function parseDate(dateValue) {
    if (!dateValue) return null;
    if (dateValue instanceof Date && !isNaN(dateValue)) return dateValue;
    if (typeof dateValue === 'number') {
        return new Date(Date.UTC(1899, 11, 30, 0, 0, 0, 0) + dateValue * 86400000);
    }
    if (typeof dateValue !== 'string') return null;
    let date;
    if (/^\d{4}-\d{2}-\d{2}/.test(dateValue)) {
        date = new Date(dateValue.substring(0, 10) + 'T00:00:00Z');
    } else if (/^\d{2}\/\d{2}\/\d{4}/.test(dateValue)) {
        const [day, month, year] = dateValue.split('/');
        date = new Date(`${year}-${month}-${day}T00:00:00Z`);
    } else {
        date = new Date(dateValue);
    }
    if (!isNaN(date)) return date;
    return null;
}

function parseCurrency(value, currency = 'USD') { /* ...código sin cambios... */ }
function cleanPhoneNumber(phone) { /* ...código sin cambios... */ }

async function processChannel(db, channel) {
    const rawCollectionName = `reportes_${channel.toLowerCase()}_raw`;
    const rawDocsSnapshot = await db.collection(rawCollectionName).get();
    
    if (rawDocsSnapshot.empty) {
        return { reportesEncontrados: 0, clientesNuevos: 0, reservasCreadas: 0, reservasActualizadas: 0, mensaje: `No hay nuevos reportes de ${channel} para procesar.` };
    }

    let clientesNuevos = 0, reservasCreadas = 0, reservasActualizadas = 0;

    const allExistingReservations = new Map();
    const allReservasSnapshot = await db.collection('reservas').get();
    allReservasSnapshot.forEach(doc => allExistingReservations.set(doc.id, doc.data()));

    const existingClientsByPhone = new Map();
    const allClientsSnapshot = await db.collection('clientes').get();
    allClientsSnapshot.forEach(doc => {
        const clientData = doc.data();
        if (clientData.phone) existingClientsByPhone.set(clientData.phone, doc.id);
    });

    const batch = db.batch();

    for (const doc of rawDocsSnapshot.docs) {
        const rawData = doc.data();
        const isBooking = channel === 'Booking';

        const alojamientosRaw = (isBooking ? rawData['Tipo de unidad'] : rawData['Alojamiento']);
        
        // --- LÍNEA CORREGIDA ---
        const alojamientosLimpios = (alojamientosRaw || "").toString().split(',').map(c => cleanCabanaName(c));

        const nombreCompletoRaw = (isBooking ? rawData['Nombre del cliente (o clientes)'] : `${rawData['Nombre'] || ''} ${rawData['Apellido'] || ''}`.trim()) || "Cliente sin Nombre";
        
        const reservaData = {
            reservaIdOriginal: (isBooking ? rawData['Número de reserva'] : rawData['Identidad'])?.toString(),
            nombreCompleto: nombreCompletoRaw,
            email: rawData['Email'] || rawData['Correo'] || null,
            telefono: cleanPhoneNumber(rawData['Teléfono'] || rawData['Número de teléfono']) || '56999999999',
            fechaLlegada: parseDate(isBooking ? rawData['Entrada'] : rawData['Día de llegada']),
            fechaSalida: parseDate(isBooking ? rawData['Salida'] : rawData['Día de salida']),
            estado: isBooking ? (rawData['Estado'] === 'ok' ? 'Confirmada' : 'Cancelada') : rawData['Estado'],
            alojamientos: alojamientosLimpios // Usamos la variable corregida
        };

        if (!reservaData.fechaLlegada || !reservaData.fechaSalida) continue;
        
        for (const cabana of reservaData.alojamientos) {
             if (!cabana) continue;
            
            // ... (el resto del bucle y la función no tiene cambios) ...
        }
        batch.delete(doc.ref);
    }

    await batch.commit();
    
    return {
        reportesEncontrados: rawDocsSnapshot.size,
        clientesNuevos,
        reservasCreadas,
        reservasActualizadas,
        mensaje: `Se procesaron ${rawDocsSnapshot.size} reportes.`
    };
}

module.exports = { processChannel };