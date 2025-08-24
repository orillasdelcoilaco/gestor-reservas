// backend/services/clienteService.js - CÓDIGO FINAL CON LÓGICA CENTRALIZADA

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
 * --- FUNCIÓN MAESTRA DE ACTUALIZACIÓN ---
 */
async function updateClientMaster(db, clientId, newData) {
    const clientRef = db.collection('clientes').doc(clientId);
    const clientDoc = await clientRef.get();
    if (!clientDoc.exists) throw new Error('El cliente no existe.');

    const oldData = clientDoc.data();
    const dataToUpdate = {};

    // Construimos el objeto solo con los datos que realmente cambiaron
    if (newData.firstname && newData.firstname !== oldData.firstname) dataToUpdate.firstname = newData.firstname;
    if (newData.lastname && newData.lastname !== oldData.lastname) dataToUpdate.lastname = newData.lastname;
    if (newData.phone && cleanPhoneNumber(newData.phone) !== oldData.phone) dataToUpdate.phone = cleanPhoneNumber(newData.phone);
    if (newData.origen !== undefined && newData.origen !== oldData.origen) dataToUpdate.origen = newData.origen;
    if (newData.fuente !== undefined && newData.fuente !== oldData.fuente) dataToUpdate.fuente = newData.fuente;
    if (newData.calificacion !== undefined && newData.calificacion !== oldData.calificacion) dataToUpdate.calificacion = Number(newData.calificacion);
    if (newData.notas !== undefined && newData.notas !== oldData.notas) dataToUpdate.notas = newData.notas;
    
    if (Object.keys(dataToUpdate).length === 0) {
        return { success: true, message: "No se realizaron cambios." };
    }

    // 1. Actualizar el documento del cliente en Firestore
    await clientRef.update(dataToUpdate);
    console.log(`Cliente ${clientId} actualizado en Firestore.`);

    const newFullName = `${dataToUpdate.firstname || oldData.firstname} ${dataToUpdate.lastname || oldData.lastname}`.trim();
    const oldFullName = `${oldData.firstname || ''} ${oldData.lastname || ''}`.trim();
    const nameHasChanged = newFullName !== oldFullName;

    // 2. Actualización en Cascada a Reservas
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

    // 3. Actualización Inteligente de Google Contacts
    try {
        const q = db.collection('reservas').where('clienteId', '==', clientId).orderBy('fechaReserva', 'desc').limit(1);
        const snapshot = await q.get();
        if (snapshot.empty) throw new Error('No se encontraron reservas para obtener el ID de desambiguación.');
        
        const reservaData = snapshot.docs[0].data();
        const reservaIdHint = reservaData.reservaIdOriginal;

        const contactResource = await findContactByPhone(db, oldData.phone, reservaIdHint);

        if (contactResource && contactResource.resourceName) {
            const updatePayload = { etag: contactResource.etag };
            const updateMask = [];

            if (nameHasChanged) {
                updatePayload.names = [{ 
                    givenName: dataToUpdate.firstname || oldData.firstname,
                    familyName: dataToUpdate.lastname || oldData.lastname 
                }];
                updateMask.push('names');
            }

            if (dataToUpdate.phone) {
                const googlePhone = contactResource.phoneNumbers && contactResource.phoneNumbers.find(p => p.value);
                if (googlePhone && cleanPhoneNumber(googlePhone.value) === '56999999999') {
                    updatePayload.phoneNumbers = [{ value: dataToUpdate.phone }];
                    updateMask.push('phoneNumbers');
                }
            }
            
            if (updateMask.length > 0) {
                await updateContact(db, contactResource.resourceName, updatePayload, updateMask);
                console.log(`Contacto de Google para ${newFullName} actualizado.`);
            }
        }
    } catch (error) {
        console.error(`No se pudo actualizar el contacto de Google para el cliente ${clientId}. Error: ${error.message}`);
    }

    return { success: true, message: 'Cliente actualizado en todo el sistema.' };
}

// La función 'updateClient' ahora es obsoleta, la dejamos por si alguna parte antigua del código la usa,
// pero la nueva lógica debe usar 'updateClientMaster'.
module.exports = {
    importClientsFromCsv,
    getAllClientsWithStats,
    syncClientToGoogle,
    updateClient, // Mantenemos por retrocompatibilidad
    updateClientMaster
};