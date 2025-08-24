// backend/services/clienteService.js - CÓDIGO ACTUALIZADO CON LÓGICA CENTRAL

const csv = require('csv-parser');
const stream = require('stream');
const { cleanPhoneNumber } = require('../utils/helpers');
const { createGoogleContact, findContactByPhone, updateContact } = require('./googleContactsService');

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
                        googleContactSynced: false
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
            googleContactSynced: clientData.googleContactSynced || false
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

async function syncClientToGoogle(db, clientId) {
    const clientRef = db.collection('clientes').doc(clientId);
    const clientDoc = await clientRef.get();

    if (!clientDoc.exists) {
        throw new Error('El cliente no existe.');
    }

    const clientData = clientDoc.data();
    
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

/**
 * --- NUEVA FUNCIÓN MAESTRA ---
 * Actualiza los datos de un cliente de forma consistente en todo el sistema.
 * @param {object} db - Instancia de Firestore.
 * @param {string} clientId - El ID del cliente a actualizar.
 * @param {object} newData - Objeto con los nuevos datos (ej: { firstname, lastname, phone }).
 */
async function updateClientMaster(db, clientId, newData) {
    const clientRef = db.collection('clientes').doc(clientId);
    const clientDoc = await clientRef.get();

    if (!clientDoc.exists) {
        throw new Error('El cliente no existe.');
    }

    const oldData = clientDoc.data();
    const dataToUpdateInFirestore = {};

    // Comparamos y preparamos los datos que realmente cambiaron
    if (newData.firstname && newData.firstname !== oldData.firstname) dataToUpdateInFirestore.firstname = newData.firstname;
    if (newData.lastname && newData.lastname !== oldData.lastname) dataToUpdateInFirestore.lastname = newData.lastname;
    if (newData.phone && cleanPhoneNumber(newData.phone) !== oldData.phone) dataToUpdateInFirestore.phone = cleanPhoneNumber(newData.phone);
    if (newData.origen && newData.origen !== oldData.origen) dataToUpdateInFirestore.origen = newData.origen;
    if (newData.fuente && newData.fuente !== oldData.fuente) dataToUpdateInFirestore.fuente = newData.fuente;
    if (newData.calificacion !== undefined && newData.calificacion !== oldData.calificacion) dataToUpdateInFirestore.calificacion = newData.calificacion;
    if (newData.notas !== undefined && newData.notas !== oldData.notas) dataToUpdateInFirestore.notas = newData.notas;
    
    // Si no hay nada que actualizar, terminamos
    if (Object.keys(dataToUpdateInFirestore).length === 0) {
        console.log("No se detectaron cambios en los datos del cliente.");
        return { success: true, message: "No se realizaron cambios." };
    }
    
    // 1. ACTUALIZAR DOCUMENTO PRINCIPAL DEL CLIENTE
    await clientRef.update(dataToUpdateInFirestore);
    console.log(`Cliente ${clientId} actualizado en Firestore con:`, dataToUpdateInFirestore);

    const newFullName = `${dataToUpdateInFirestore.firstname || oldData.firstname} ${dataToUpdateInFirestore.lastname || oldData.lastname}`.trim();
    const nameHasChanged = newFullName !== `${oldData.firstname} ${oldData.lastname}`.trim();

    // 2. ACTUALIZACIÓN EN CASCADA A RESERVAS
    if (nameHasChanged) {
        const reservasQuery = db.collection('reservas').where('clienteId', '==', clientId);
        const reservasSnapshot = await reservasQuery.get();
        if (!reservasSnapshot.empty) {
            const batch = db.batch();
            reservasSnapshot.forEach(doc => {
                batch.update(doc.ref, { clienteNombre: newFullName, nombreManual: true });
            });
            await batch.commit();
            console.log(`Actualizadas ${reservasSnapshot.size} reservas para el cliente ${clientId}.`);
        }
    }

    // 3. ACTUALIZACIÓN INTELIGENTE DE GOOGLE CONTACTS
    try {
        const contactResource = await findContactByPhone(db, oldData.phone);
        if (contactResource && contactResource.resourceName) {
            const updatePayload = {};
            let needsGoogleUpdate = false;
            
            // Si el nombre cambió, lo preparamos para actualizar
            if (nameHasChanged) {
                const currentEtag = (contactResource.names && contactResource.names[0].etag) || '*';
                updatePayload.names = [{ etag: currentEtag, givenName: dataToUpdateInFirestore.firstname || oldData.firstname, familyName: dataToUpdateInFirestore.lastname || oldData.lastname }];
                needsGoogleUpdate = true;
            }

            // Si el teléfono cambió Y el antiguo era el genérico, lo preparamos para actualizar
            if (dataToUpdateInFirestore.phone) {
                const googlePhone = contactResource.phoneNumbers && contactResource.phoneNumbers.find(p => p.value);
                if (googlePhone && cleanPhoneNumber(googlePhone.value) === '56999999999') {
                     updatePayload.phoneNumbers = [{ etag: googlePhone.etag, value: dataToUpdateInFirestore.phone }];
                     needsGoogleUpdate = true;
                }
            }
            
            if (needsGoogleUpdate) {
                const updateMask = Object.keys(updatePayload);
                await updateContact(db, contactResource.resourceName, updatePayload, updateMask);
                console.log(`Contacto de Google para ${newFullName} actualizado.`);
            }
        }
    } catch (error) {
        console.error(`No se pudo actualizar el contacto de Google para el cliente ${clientId}. Error: ${error.message}`);
    }

    return { success: true, message: 'Cliente actualizado en todo el sistema.' };
}

module.exports = {
    importClientsFromCsv,
    getAllClientsWithStats,
    updateClient,
    syncClientToGoogle,
    updateClientMaster // <-- Exportamos la nueva función maestra
};