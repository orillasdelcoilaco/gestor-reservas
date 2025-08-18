const admin = require('firebase-admin');
const { getValorDolar } = require('./dolarService');

// --- Funciones de ayuda (sin cambios) ---
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
function parseCurrency(value, currency = 'USD') {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return 0;
  if (currency === 'CLP') {
    const digitsOnly = value.replace(/\D/g, '');
    return parseInt(digitsOnly, 10) || 0;
  }
  const numberString = value.replace(/[^0-9.,]/g, '');
  const cleanedForFloat = numberString.replace(/,/g, '');
  return parseFloat(cleanedForFloat) || 0;
}
function cleanPhoneNumber(phone) {
    if (!phone) return null;
    let cleaned = phone.toString().replace(/\s+/g, '').replace(/[-+]/g, '');
    if (cleaned.length === 9 && cleaned.startsWith('9')) {
        return `56${cleaned}`;
    }
    return cleaned;
}
function cleanCabanaName(cabanaName) {
    if (!cabanaName) return '';
    let cleanedName = cabanaName.replace(/(\d+)(\s+1)$/, '$1').trim();
    return cleanedName;
}

// --- LÓGICA DE CONSOLIDACIÓN MEJORADA ---
async function processChannel(db, channel) {
    const rawCollectionName = `reportes_${channel.toLowerCase()}_raw`;
    const rawDocsSnapshot = await db.collection(rawCollectionName).get();
    if (rawDocsSnapshot.empty) {
        return `No hay nuevos reportes para procesar de ${channel}.`;
    }

    // 1. Cargar datos existentes en memoria para búsquedas rápidas
    const existingReservations = new Map();
    const allReservasSnapshot = await db.collection('reservas').get();
    allReservasSnapshot.forEach(doc => {
        existingReservations.set(doc.id, doc.data());
    });

    const existingClientsByPhone = new Map();
    const allClientsSnapshot = await db.collection('clientes').get();
    allClientsSnapshot.forEach(doc => {
        const clientData = doc.data();
        if (clientData.phone) {
            existingClientsByPhone.set(clientData.phone, doc.id);
        }
    });
    console.log(`Cargados ${existingReservations.size} reservas y ${existingClientsByPhone.size} clientes para verificación.`);

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
            valorOriginal: parseCurrency(isBooking ? rawData['Precio'] : rawData['Total'], isBooking ? 'USD' : 'CLP'),
            monedaOriginal: isBooking ? 'USD' : 'CLP',
            alojamientos: alojamientosRaw.toString().split(',').map(c => cleanCabanaName(c.trim()))
        };

        if (!reservaData.fechaLlegada || !reservaData.fechaSalida) continue;
        
        for (const cabana of reservaData.alojamientos) {
            if (!cabana) continue;

            const idCompuesto = `${channel.toUpperCase()}_${reservaData.reservaIdOriginal}_${cabana.replace(/\s+/g, '')}`;
            const reservaRef = db.collection('reservas').doc(idCompuesto);
            let clienteId;

            const existingReservation = existingReservations.get(idCompuesto);

            if (existingReservation && existingReservation.clienteId) {
                // PRIORIDAD 1: La reserva ya existe, reutilizamos su ID de cliente.
                clienteId = existingReservation.clienteId;
                console.log(`Reserva ${idCompuesto} ya existe. Reutilizando clienteId: ${clienteId}`);
            } else if (reservaData.telefono && existingClientsByPhone.has(reservaData.telefono)) {
                // PRIORIDAD 2: La reserva es nueva, pero encontramos un cliente con el mismo teléfono.
                clienteId = existingClientsByPhone.get(reservaData.telefono);
                console.log(`Reserva nueva, cliente encontrado por teléfono ${reservaData.telefono}. Usando clienteId: ${clienteId}`);
            } else {
                // PRIORIDAD 3: La reserva y el cliente son nuevos. Creamos un nuevo cliente.
                const newClientRef = db.collection('clientes').doc();
                clienteId = newClientRef.id;
                
                batch.set(newClientRef, {
                    firstname: reservaData.nombreCompleto.split(' ')[0],
                    lastname: reservaData.nombreCompleto.split(' ').slice(1).join(' '),
                    email: reservaData.email,
                    phone: reservaData.telefono
                });
                // Lo añadimos al mapa para encontrarlo en futuras iteraciones de este mismo proceso
                if(reservaData.telefono) existingClientsByPhone.set(reservaData.telefono, clienteId);
                console.log(`Cliente nuevo. Creando con ID: ${clienteId} y teléfono ${reservaData.telefono}`);
            }

            let valorCLP = reservaData.valorOriginal;
            if (isBooking) {
                const valorDolarDia = await getValorDolar(db, reservaData.fechaLlegada);
                const precioPorCabanaUSD = reservaData.alojamientos.length > 0 ? (reservaData.valorOriginal / reservaData.alojamientos.length) : 0;
                valorCLP = Math.round(precioPorCabanaUSD * valorDolarDia * 1.19);
            }

            const totalNoches = Math.round((reservaData.fechaSalida - reservaData.fechaLlegada) / (1000 * 60 * 60 * 24));

            const dataToSave = {
                reservaIdOriginal: reservaData.reservaIdOriginal,
                clienteId: clienteId, // <-- ID de cliente único
                clienteNombre: reservaData.nombreCompleto,
                // ... (resto de los campos)
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
            };

            if (existingReservation) {
                if (existingReservation.valorManual) {
                    dataToSave.valorCLP = existingReservation.valorCLP;
                    dataToSave.valorOriginalCLP = existingReservation.valorOriginalCLP;
                    dataToSave.valorManual = true;
                }
                if (existingReservation.nombreManual) {
                    dataToSave.clienteNombre = existingReservation.clienteNombre;
                    dataToSave.nombreManual = true;
                }
            }
            batch.set(reservaRef, dataToSave, { merge: true });
        }
        batch.delete(doc.ref);
    }

    await batch.commit();
    return `Se procesaron y consolidaron ${rawDocsSnapshot.size} registros de ${channel}.`;
}

module.exports = {
  processChannel,
};
