const admin = require('firebase-admin');
const { getValorDolar } = require('./dolarService');
const { getPeopleApiClient, findContactByPhone, createGoogleContact } = require('./contactsService');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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

// --- LÓGICA DE CONSOLIDACIÓN FINAL ---
async function processChannel(db, channel) {
    const rawCollectionName = `reportes_${channel.toLowerCase()}_raw`;
    const rawDocsSnapshot = await db.collection(rawCollectionName).get();
    if (rawDocsSnapshot.empty) {
        return `No hay nuevos reportes para procesar de ${channel}.`;
    }

    // 1. Cargar datos existentes en memoria
    const allExistingReservations = new Map();
    const allReservasSnapshot = await db.collection('reservas').get();
    allReservasSnapshot.forEach(doc => allExistingReservations.set(doc.id, doc.data()));

    const existingClientsByPhone = new Map();
    const allClientsSnapshot = await db.collection('clientes').get();
    allClientsSnapshot.forEach(doc => {
        const clientData = doc.data();
        if (clientData.phone) existingClientsByPhone.set(clientData.phone, doc.id);
    });

    const people = getPeopleApiClient();
    const clientsForGoogleProcessing = new Map();
    const batch = db.batch();
    const processedReservas = [];

    // 2. PRIMERA PASADA: Identificar clientes y reservas a procesar
    for (const doc of rawDocsSnapshot.docs) {
        const rawData = doc.data();
        const isBooking = channel === 'Booking';
        
        const reservaData = {
            docId: doc.id,
            reservaIdOriginal: (isBooking ? rawData['Número de reserva'] : rawData['Identidad'])?.toString(),
            nombreCompleto: (isBooking ? rawData['Nombre del cliente (o clientes)'] : `${rawData['Nombre'] || ''} ${rawData['Apellido'] || ''}`.trim()) || "Cliente sin Nombre",
            canal: channel,
            telefono: cleanPhoneNumber(rawData['Teléfono'] || rawData['Número de teléfono']),
            fechaLlegada: parseDate(isBooking ? rawData['Entrada'] : rawData['Día de llegada']),
            fechaSalida: parseDate(isBooking ? rawData['Salida'] : rawData['Día de salida']),
            estado: isBooking ? (rawData['Estado'] === 'ok' ? 'Confirmada' : 'Cancelada') : rawData['Estado'],
            alojamientos: ((isBooking ? rawData['Tipo de unidad'] : rawData['Alojamiento']) || "").toString().split(',').map(c => cleanCabanaName(c.trim())),
            rawData: rawData // Guardamos los datos brutos para usarlos después
        };

        if (!reservaData.reservaIdOriginal || !reservaData.fechaLlegada || !reservaData.fechaSalida || reservaData.alojamientos.length === 0) {
            batch.delete(doc.ref);
            continue;
        }

        // Añadir cliente a la cola de procesamiento de Google Contacts (una sola vez)
        if (reservaData.telefono && !clientsForGoogleProcessing.has(reservaData.telefono)) {
            clientsForGoogleProcessing.set(reservaData.telefono, reservaData);
        }
        
        processedReservas.push(reservaData);
    }

    // 3. Procesar los contactos de Google de forma eficiente
    console.log(`Procesando ${clientsForGoogleProcessing.size} clientes únicos para Google Contacts...`);
    for (const clientInfo of clientsForGoogleProcessing.values()) {
        const existingContact = await findContactByPhone(people, clientInfo.telefono);
        if (!existingContact) {
            await createGoogleContact(people, clientInfo);
            await sleep(500); // Pausa solo si creamos un contacto nuevo
        }
    }

    // 4. SEGUNDA PASADA: Procesar solo las reservas nuevas o actualizadas
    for (const reservaData of processedReservas) {
        let needsProcessing = false;
        for (const cabana of reservaData.alojamientos) {
            const idCompuesto = `${reservaData.canal.toUpperCase()}_${reservaData.reservaIdOriginal}_${cabana.replace(/\s+/g, '')}`;
            const existing = allExistingReservations.get(idCompuesto);
            if (!existing || existing.estado !== reservaData.estado) {
                needsProcessing = true;
                break;
            }
        }

        if (!needsProcessing) {
            console.log(`Reserva ${reservaData.reservaIdOriginal} sin cambios, omitiendo.`);
            batch.delete(db.collection(rawCollectionName).doc(reservaData.docId));
            continue;
        }

        console.log(`Procesando reserva nueva o actualizada: ${reservaData.reservaIdOriginal}`);
        
        let clienteId;
        if (reservaData.telefono && existingClientsByPhone.has(reservaData.telefono)) {
            clienteId = existingClientsByPhone.get(reservaData.telefono);
        } else {
            const newClientRef = db.collection('clientes').doc();
            clienteId = newClientRef.id;
            batch.set(newClientRef, {
                firstname: reservaData.nombreCompleto.split(' ')[0],
                lastname: reservaData.nombreCompleto.split(' ').slice(1).join(' '),
                phone: reservaData.telefono
            });
            if (reservaData.telefono) existingClientsByPhone.set(reservaData.telefono, clienteId);
        }

        for (const cabana of reservaData.alojamientos) {
             const idCompuesto = `${reservaData.canal.toUpperCase()}_${reservaData.reservaIdOriginal}_${cabana.replace(/\s+/g, '')}`;
             const reservaRef = db.collection('reservas').doc(idCompuesto);
             const isBooking = reservaData.canal === 'Booking';
             let valorCLP = parseCurrency(isBooking ? reservaData.rawData['Precio'] : reservaData.rawData['Total'], isBooking ? 'USD' : 'CLP');
             if (isBooking) {
                const valorDolarDia = await getValorDolar(db, reservaData.fechaLlegada);
                const precioPorCabanaUSD = reservaData.alojamientos.length > 0 ? (valorCLP / reservaData.alojamientos.length) : 0;
                valorCLP = Math.round(precioPorCabanaUSD * valorDolarDia * 1.19);
             }
             const totalNoches = Math.round((reservaData.fechaSalida - reservaData.fechaLlegada) / (1000 * 60 * 60 * 24));

             const dataToSave = {
                reservaIdOriginal: reservaData.reservaIdOriginal,
                clienteId: clienteId,
                clienteNombre: reservaData.nombreCompleto,
                canal: reservaData.canal,
                estado: reservaData.estado,
                fechaLlegada: admin.firestore.Timestamp.fromDate(reservaData.fechaLlegada),
                fechaSalida: admin.firestore.Timestamp.fromDate(reservaData.fechaSalida),
                totalNoches: totalNoches > 0 ? totalNoches : 1,
                alojamiento: cabana,
                valorCLP: valorCLP,
             };
             batch.set(reservaRef, dataToSave, { merge: true });
        }
        batch.delete(db.collection(rawCollectionName).doc(reservaData.docId));
    }

    // 5. Ejecutar todas las operaciones
    await batch.commit();
    return `Proceso finalizado. Se procesaron los contactos y las reservas nuevas o actualizadas.`;
}

module.exports = {
  processChannel,
};
