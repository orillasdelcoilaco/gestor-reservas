// backend/services/importService.js - CÓDIGO ACTUALIZADO

const admin = require('firebase-admin');
const csv = require('csv-parser');
const stream = require('stream');
const { cleanPhoneNumber } = require('../utils/helpers');
const { getValorDolar } = require('./dolarService'); // Necesitamos el servicio del dólar
const { cleanCabanaName, parseDate, parseCurrency } = require('./consolidationService'); // Reutilizamos funciones

/**
 * Parsea un buffer de un archivo CSV a un array de objetos.
 */
function parseCsvBuffer(buffer) {
    return new Promise((resolve, reject) => {
        const results = [];
        const readableStream = new stream.Readable();
        readableStream._read = () => {};
        readableStream.push(buffer);
        readableStream.push(null);

        readableStream
            .pipe(csv())
            .on('data', (data) => results.push(data))
            .on('end', () => resolve(results))
            .on('error', (error) => reject(error));
    });
}

/**
 * Procesa el archivo CSV de clientes históricos.
 */
async function processHistoricalClients(db, fileBuffer) {
    // ... (Esta función se mantiene igual que antes)
    const rows = await parseCsvBuffer(fileBuffer);
    console.log(`[Importador de Clientes] Se encontraron ${rows.length} filas para procesar.`);

    const existingClientsByPhone = new Map();
    const allClientsSnapshot = await db.collection('clientes').get();
    allClientsSnapshot.forEach(doc => {
        const clientData = doc.data();
        if (clientData.phone) {
            existingClientsByPhone.set(clientData.phone, { id: doc.id, data: clientData });
        }
    });
    console.log(`[Importador de Clientes] Se encontraron ${existingClientsByPhone.size} clientes existentes en la base de datos para comparar.`);

    const batch = db.batch();
    let newClients = 0;
    let updatedClients = 0;
    const processedPhones = new Set(); 

    for (const row of rows) {
        const phone = cleanPhoneNumber(row.phone);
        if (!phone || processedPhones.has(phone)) {
            continue;
        }
        processedPhones.add(phone);

        const clientData = {
            firstname: row.firstname || '',
            lastname: row.lastname || '',
            email: row.email || null,
            phone: phone,
            city: row.city || null,
            country: row.country || null,
            fuente: row.fuente || '',
            origen: row.origen || '',
            calificacion: Number(row.calificacion) || 0,
            googleContactSynced: false
        };

        const existingClient = existingClientsByPhone.get(phone);
        
        if (existingClient) {
            const clientRef = db.collection('clientes').doc(existingClient.id);
            const dataToUpdate = {};
            if (!existingClient.data.firstname && clientData.firstname) dataToUpdate.firstname = clientData.firstname;
            if (!existingClient.data.lastname && clientData.lastname) dataToUpdate.lastname = clientData.lastname;
            if (!existingClient.data.email && clientData.email) dataToUpdate.email = clientData.email;
            if (!existingClient.data.city && clientData.city) dataToUpdate.city = clientData.city;
            if (!existingClient.data.country && clientData.country) dataToUpdate.country = clientData.country;

            if (Object.keys(dataToUpdate).length > 0) {
                 batch.update(clientRef, dataToUpdate);
                 updatedClients++;
            }
        } else {
            const newClientRef = db.collection('clientes').doc();
            batch.set(newClientRef, clientData);
            newClients++;
        }
    }

    if (newClients > 0 || updatedClients > 0) {
        await batch.commit();
    }
    
    console.log(`[Importador de Clientes] Proceso finalizado. Clientes nuevos: ${newClients}, Clientes actualizados: ${updatedClients}.`);
    
    return {
        totalRows: rows.length,
        newClients,
        updatedClients
    };
}

/**
 * --- NUEVA FUNCIÓN ---
 * Procesa el archivo CSV de reservas históricas de Booking.
 */
async function processHistoricalBookings(db, fileBuffer) {
    const rows = await parseCsvBuffer(fileBuffer);
    console.log(`[Importador de Reservas] Se encontraron ${rows.length} filas para procesar.`);

    // Cargamos todos los clientes y reservas existentes para evitar duplicados
    const existingClientsByPhone = new Map();
    const allClientsSnapshot = await db.collection('clientes').get();
    allClientsSnapshot.forEach(doc => {
        const clientData = doc.data();
        if (clientData.phone) existingClientsByPhone.set(clientData.phone, { id: doc.id, data: clientData });
    });

    const existingReservations = new Set();
    const allReservasSnapshot = await db.collection('reservas').get();
    allReservasSnapshot.forEach(doc => existingReservations.add(doc.id));

    const batch = db.batch();
    let newReservations = 0;
    let newClientsFromBookings = 0;

    for (const row of rows) {
        const reservaIdOriginal = row['Número de reserva'];
        const cabana = cleanCabanaName(row['Tipo de unidad']);
        if (!reservaIdOriginal || !cabana) continue;

        const idCompuesto = `BOOKING_${reservaIdOriginal}_${cabana.replace(/\s+/g, '')}`;
        if (existingReservations.has(idCompuesto)) {
            continue; // Si la reserva ya existe, la saltamos
        }
        
        let clienteId;
        const phone = cleanPhoneNumber(row['Número de teléfono']);

        if (phone && existingClientsByPhone.has(phone)) {
            clienteId = existingClientsByPhone.get(phone).id;
        } else {
            // Si el cliente no existe, lo creamos con la info básica
            const newClientRef = db.collection('clientes').doc();
            clienteId = newClientRef.id;
            const nombreCompleto = row['Nombre del cliente (o clientes)'] || '';
            const clientData = {
                firstname: nombreCompleto.split(' ')[0] || '',
                lastname: nombreCompleto.split(' ').slice(1).join(' '),
                email: null, // El archivo histórico no parece tener el email del cliente
                phone: phone,
                googleContactSynced: false
            };
            batch.set(newClientRef, clientData);
            if (phone) existingClientsByPhone.set(phone, { id: clienteId, data: clientData });
            newClientsFromBookings++;
        }
        
        const fechaLlegada = parseDate(row['Entrada']);
        const fechaSalida = parseDate(row['Salida']);
        const valorOriginal = parseCurrency(row['Precio'], 'USD');
        const valorDolarDia = await getValorDolar(db, fechaLlegada);
        const valorCLPCalculado = Math.round(valorOriginal * valorDolarDia * 1.19);
        const totalNoches = Math.round((fechaSalida - fechaLlegada) / (1000 * 60 * 60 * 24));

        const dataToSave = {
            reservaIdOriginal,
            clienteId,
            clienteNombre: row['Nombre del cliente (o clientes)'],
            canal: 'Booking',
            estado: row['Estado'] === 'ok' ? 'Confirmada' : 'Cancelada',
            fechaReserva: parseDate(row['Fecha de reserva']),
            fechaLlegada: admin.firestore.Timestamp.fromDate(fechaLlegada),
            fechaSalida: admin.firestore.Timestamp.fromDate(fechaSalida),
            totalNoches: totalNoches > 0 ? totalNoches : 1,
            invitados: parseInt(row['Personas'] || 0),
            alojamiento: cabana,
            monedaOriginal: 'USD',
            valorOriginal: valorOriginal,
            valorCLP: valorCLPCalculado,
            pais: row['Booker country'] || null,
            valorDolarDia: valorDolarDia,
            comision: parseCurrency(row['Importe de la comisión'], 'USD'),
            iva: Math.round(valorOriginal * valorDolarDia * 0.19),
            valorConIva: Math.round(valorOriginal * valorDolarDia * 1.19),
            abono: 0,
            fechaAbono: null,
            fechaPago: null,
            pagado: false,
            pendiente: valorCLPCalculado,
            boleta: false
        };

        const reservaRef = db.collection('reservas').doc(idCompuesto);
        batch.set(reservaRef, dataToSave);
        newReservations++;
    }

    if (newReservations > 0 || newClientsFromBookings > 0) {
        await batch.commit();
    }
    
    return {
        totalRows: rows.length,
        newReservations,
        newClientsFromBookings
    };
}


module.exports = {
    processHistoricalClients,
    processHistoricalBookings // <-- EXPORTAMOS LA NUEVA FUNCIÓN
};