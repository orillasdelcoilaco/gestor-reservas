// backend/services/clienteService.js - CÓDIGO ACTUALIZADO

const csv = require('csv-parser');
const stream = require('stream');
const { cleanPhoneNumber } = require('../utils/helpers');
const { createGoogleContact } = require('./googleContactsService'); // <-- IMPORTAMOS LA FUNCIÓN

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

async function importClientsFromCsv(db, files) {
    console.log(`Procesando ${files.length} archivo(s)...`);

    const existingPhones = new Set();
    const clientsSnapshot = await db.collection('clientes').get();
    clientsSnapshot.forEach(doc => {
        if (doc.data().phone) {
            existingPhones.add(doc.data().phone);
        }
    });
    console.log(`Se encontraron ${existingPhones.size} clientes existentes en la base de datos.`);

    const keywords = ['booking', 'reserva', 'posible cliente', 'airbnb', 'sodc'];
    const batch = db.batch();
    let newClientsAdded = 0;
    let totalRowsRead = 0;

    for (const file of files) {
        const rows = await parseCsvBuffer(file.buffer);
        totalRowsRead += rows.length;
        
        for (const row of rows) {
            const fullName = `${row['Name'] || ''} ${row['First Name'] || ''} ${row['Last Name'] || ''}`.toLowerCase();
            const phoneValue = row['Phone 1 - Value'];
            if (!fullName || !phoneValue) continue;

            const hasKeyword = keywords.some(keyword => fullName.includes(keyword));
            const hasNumber = /\d/.test(fullName);

            if (hasKeyword || hasNumber) {
                const cleanedPhone = cleanPhoneNumber(phoneValue);
                if (cleanedPhone && !existingPhones.has(cleanedPhone)) {
                    const newClientRef = db.collection('clientes').doc();
                    const clientData = {
                        firstname: row['First Name'] || '',
                        lastname: row['Last Name'] || '',
                        phone: cleanedPhone,
                        email: row['E-mail 1 - Value'] || null,
                        googleContactSynced: false // Por defecto no sincronizado en importación CSV
                    };
                    if (!clientData.firstname && !clientData.lastname && row['Name']) {
                        const nameParts = row['Name'].split(' ');
                        clientData.firstname = nameParts[0] || '';
                        clientData.lastname = nameParts.slice(1).join(' ');
                    }
                    batch.set(newClientRef, clientData);
                    existingPhones.add(cleanedPhone);
                    newClientsAdded++;
                }
            }
        }
    }

    if (newClientsAdded > 0) {
        await batch.commit();
        console.log(`Commit a Firestore: Se guardaron ${newClientsAdded} nuevos clientes.`);
    }

    return {
        filesProcessed: files.length,
        totalRowsRead,
        newClientsAdded
    };
}

async function getAllClientsWithStats(db) {
    const reservasSnapshot = await db.collection('reservas').get();
    const reservationStatsMap = new Map();

    reservasSnapshot.forEach(doc => {
        const reserva = doc.data();
        if (reserva.clienteId) {
            if (!reservationStatsMap.has(reserva.clienteId)) {
                reservationStatsMap.set(reserva.clienteId, { totalReservas: 0, primerCanal: reserva.canal });
            }
            const stats = reservationStatsMap.get(reserva.clienteId);
            stats.totalReservas += 1;
        }
    });

    const clientsSnapshot = await db.collection('clientes').get();
    if (clientsSnapshot.empty) {
        return [];
    }

    const clientsWithStats = [];
    clientsSnapshot.forEach(doc => {
        const clientData = doc.data();
        const stats = reservationStatsMap.get(doc.id) || { totalReservas: 0, primerCanal: 'Desconocido' };

        clientsWithStats.push({
            id: doc.id,
            nombre: `${clientData.firstname || ''} ${clientData.lastname || ''}`.trim(),
            telefono: clientData.phone || 'Sin Teléfono',
            email: clientData.email || 'Sin Email',
            totalReservas: stats.totalReservas,
            canal: clientData.canal || stats.primerCanal,
            fuente: clientData.fuente || '',
            origen: clientData.origen || '',
            calificacion: clientData.calificacion || 0,
            notas: clientData.notas || '',
            googleContactSynced: clientData.googleContactSynced || false // <-- AÑADIMOS EL NUEVO CAMPO
        });
    });

    clientsWithStats.sort((a, b) => a.nombre.localeCompare(b.nombre));
    
    return clientsWithStats;
}

async function updateClient(db, clientId, clientData) {
    const clientRef = db.collection('clientes').doc(clientId);

    const dataToUpdate = {};
    if (clientData.origen !== undefined) dataToUpdate.origen = clientData.origen;
    if (clientData.fuente !== undefined) dataToUpdate.fuente = clientData.fuente;
    if (clientData.calificacion !== undefined) dataToUpdate.calificacion = Number(clientData.calificacion);
    if (clientData.notas !== undefined) dataToUpdate.notas = clientData.notas;

    if (Object.keys(dataToUpdate).length === 0) {
        console.log("No hay datos para actualizar.");
        return;
    }

    console.log(`Actualizando cliente ${clientId} con:`, dataToUpdate);
    await clientRef.update(dataToUpdate);
}

/**
 * Reintenta la sincronización de un cliente específico con Google Contacts.
 */
async function syncClientToGoogle(db, clientId) {
    const clientRef = db.collection('clientes').doc(clientId);
    const clientDoc = await clientRef.get();

    if (!clientDoc.exists) {
        throw new Error('El cliente no existe.');
    }

    const clientData = clientDoc.data();
    
    // Para el nombre del contacto, necesitamos saber de qué reserva vino originalmente.
    // Buscamos la reserva más reciente de este cliente para obtener el canal y el ID de reserva.
    const q = db.collection('reservas').where('clienteId', '==', clientId).orderBy('fechaReserva', 'desc').limit(1);
    const snapshot = await q.get();

    if (snapshot.empty) {
        throw new Error('No se encontraron reservas para este cliente, no se puede crear el nombre del contacto.');
    }
    const reservaData = snapshot.docs[0].data();

    const contactPayload = {
        name: `${reservaData.clienteNombre} ${reservaData.canal} ${reservaData.reservaIdOriginal}`,
        phone: clientData.phone,
        email: clientData.email
    };
    
    const syncSuccess = await createGoogleContact(db, contactPayload);

    if (syncSuccess) {
        await clientRef.update({ googleContactSynced: true });
        return { success: true, message: 'Cliente sincronizado con Google Contacts.' };
    } else {
        throw new Error('Falló la sincronización con la API de Google. Revisa los logs del servidor.');
    }
}


module.exports = {
    importClientsFromCsv,
    getAllClientsWithStats,
    updateClient,
    syncClientToGoogle // <-- EXPORTAMOS LA NUEVA FUNCIÓN
};