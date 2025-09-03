// backend/services/clienteService.js - CÓDIGO FINAL CON LÓGICA CENTRALIZADA

const csv = require('csv-parser');
const stream = require('stream');
const { cleanPhoneNumber } = require('../utils/helpers');
const { createGoogleContact, findContactByName, updateContact } = require('./googleContactsService');

async function findOrCreateClient(db, clientData) {
    const { nombre, telefono, email, empresa } = clientData;
    const cleanedPhone = telefono ? cleanPhoneNumber(telefono) : null;

    if (cleanedPhone) {
        const query = db.collection('clientes').where('phone', '==', cleanedPhone).limit(1);
        const snapshot = await query.get();
        if (!snapshot.empty) {
            return snapshot.docs[0].id;
        }
    }

    if (email) {
        const query = db.collection('clientes').where('email', '==', email).limit(1);
        const snapshot = await query.get();
        if (!snapshot.empty) {
            return snapshot.docs[0].id;
        }
    }

    const nameParts = nombre.split(' ');
    const newClientRef = db.collection('clientes').doc();
    const newClientPayload = {
        firstname: nameParts[0] || '',
        lastname: nameParts.slice(1).join(' ') || '',
        phone: cleanedPhone,
        email: email || null,
        fuente: empresa || 'Presupuesto Directo',
        googleContactSynced: false
    };
    
    await newClientRef.set(newClientPayload);
    return newClientRef.id;
}

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

// --- FUNCIÓN MODIFICADA ---
async function getAllClientsWithStats(db) {
    const clientsSnapshot = await db.collection('clientes').get();
    if (clientsSnapshot.empty) {
        return [];
    }

    const clientsWithStats = [];
    for (const doc of clientsSnapshot.docs) {
        const clientData = doc.data();
        let totalReservas = 0;
        let primerCanal = 'N/A';

        const reservasQuery = db.collection('reservas').where('clienteId', '==', doc.id);
        const reservasSnapshot = await reservasQuery.get();

        if (!reservasSnapshot.empty) {
            totalReservas = reservasSnapshot.size;
            
            // --- INICIO DE LA CORRECCIÓN ---
            // Se añade una comprobación para manejar reservas sin fecha
            const reservasConFecha = reservasSnapshot.docs.filter(d => d.data().fechaReserva && d.data().fechaReserva.toMillis);
            if (reservasConFecha.length > 0) {
                const primeraReserva = reservasConFecha.sort((a, b) => a.data().fechaReserva.toMillis() - b.data().fechaReserva.toMillis())[0];
                primerCanal = primeraReserva.data().canal || 'Desconocido';
            } else if (reservasSnapshot.size > 0) {
                // Si ninguna tiene fecha, tomamos el canal de la primera que encuentre
                primerCanal = reservasSnapshot.docs[0].data().canal || 'Desconocido';
            }
            // --- FIN DE LA CORRECCIÓN ---
        }

        clientsWithStats.push({
            id: doc.id,
            nombre: `${clientData.firstname || ''} ${clientData.lastname || ''}`.trim(),
            telefono: clientData.phone || 'Sin Teléfono',
            email: clientData.email || 'Sin Email',
            totalReservas: totalReservas,
            canal: clientData.canal || primerCanal,
            fuente: clientData.fuente || '',
            origen: clientData.origen || '',
            calificacion: clientData.calificacion || 0,
            notas: clientData.notas || '',
            googleContactSynced: clientData.googleContactSynced || false,
            telefonoManual: clientData.telefonoManual || false
        });
    }

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

    const contactName = `${reservaData.clienteNombre} ${reservaData.canal} ${reservaData.reservaIdOriginal}`;
    const contactPayload = {
        name: contactName,
        phone: clientData.phone,
        email: clientData.email
    };

    const existingContact = await findContactByName(db, contactName);
    if (existingContact) {
        console.log(`Contacto "${contactName}" encontrado. Verificando si necesita actualización...`);
        const updatePayload = { etag: existingContact.etag };
        const updateMask = [];

        const currentGoogleName = existingContact.names && existingContact.names[0] ? existingContact.names[0].displayName : '';
        const currentGooglePhone = existingContact.phoneNumbers && existingContact.phoneNumbers[0] ? cleanPhoneNumber(existingContact.phoneNumbers[0].value) : null;
        const genericPhone = '56999999999';

        if (currentGoogleName !== contactName) {
            updatePayload.names = [{ givenName: contactName }];
            updateMask.push('names');
        }

        if (currentGooglePhone === genericPhone && clientData.phone && clientData.phone !== genericPhone) {
            updatePayload.phoneNumbers = [{ value: clientData.phone }];
            updateMask.push('phoneNumbers');
        }

        if (updateMask.length > 0) {
            console.log(`Actualizando contacto: ${updateMask.join(', ')}`);
            await updateContact(db, existingContact.resourceName, updatePayload, updateMask);
            if (!clientData.googleContactSynced) {
                await clientRef.update({ googleContactSynced: true });
            }
            return { success: true, message: `Contacto "${contactName}" actualizado con éxito en Google.` };
        } else {
            console.log(`El contacto "${contactName}" ya está al día.`);
            if (!clientData.googleContactSynced) {
                await clientRef.update({ googleContactSynced: true });
            }
            return { success: true, alreadyExists: true, message: `El contacto "${contactName}" ya está sincronizado y actualizado.` };
        }

    } else {
        console.log(`Contacto "${contactName}" no encontrado. Creando...`);
        const contactPayload = {
            name: contactName,
            phone: clientData.phone || '56999999999',
            email: clientData.email
        };
        const syncSuccess = await createGoogleContact(db, contactPayload);

        if (syncSuccess) {
            await clientRef.update({ googleContactSynced: true });
            return { success: true, message: `Contacto creado con éxito en Google: "${contactName}"` };
        } else {
            throw new Error('Falló la creación del contacto en la API de Google.');
        }
    }
}

async function updateClientMaster(db, clientId, newData) {
    const clientRef = db.collection('clientes').doc(clientId);
    const clientDoc = await clientRef.get();
    if (!clientDoc.exists) throw new Error('El cliente no existe.');

    const oldData = clientDoc.data();
    const dataToUpdateInFirestore = {};

    if (newData.firstname && newData.firstname !== oldData.firstname) dataToUpdateInFirestore.firstname = newData.firstname;
    if (newData.lastname && newData.lastname !== oldData.lastname) dataToUpdateInFirestore.lastname = newData.lastname;
    if (newData.phone && cleanPhoneNumber(newData.phone) !== oldData.phone) {
        dataToUpdateInFirestore.phone = cleanPhoneNumber(newData.phone);
        dataToUpdateInFirestore.telefonoManual = true;
    }
    if (newData.origen !== undefined && newData.origen !== oldData.origen) dataToUpdateInFirestore.origen = newData.origen;
    if (newData.fuente !== undefined && newData.fuente !== oldData.fuente) dataToUpdateInFirestore.fuente = newData.fuente;
    if (newData.calificacion !== undefined && newData.calificacion !== oldData.calificacion) dataToUpdateInFirestore.calificacion = Number(newData.calificacion);
    if (newData.notas !== undefined && newData.notas !== oldData.notas) dataToUpdateInFirestore.notas = newData.notas;
    
    if (Object.keys(dataToUpdateInFirestore).length === 0) {
        return { success: true, message: "No se realizaron cambios." };
    }

    await clientRef.update(dataToUpdateInFirestore);
    console.log(`Cliente ${clientId} actualizado en Firestore.`);

    const newFullName = `${dataToUpdateInFirestore.firstname || oldData.firstname} ${dataToUpdateInFirestore.lastname || oldData.lastname}`.trim();
    const oldFullName = `${oldData.firstname || ''} ${oldData.lastname || ''}`.trim();
    const nameHasChanged = newFullName !== oldFullName;

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

    try {
        const q = db.collection('reservas').where('clienteId', '==', clientId).orderBy('fechaReserva', 'desc').limit(1);
        const snapshot = await q.get();
        if (snapshot.empty) throw new Error('No se encontraron reservas para obtener el ID de desambiguación.');
        
        const reservaData = snapshot.docs[0].data();
        const contactIdSuffix = `${reservaData.canal} ${reservaData.reservaIdOriginal}`;
        const contactResource = await findContactByName(db, contactIdSuffix);

        if (contactResource && contactResource.resourceName) {
            const updatePayload = { etag: contactResource.etag };
            const updateMask = [];
            const currentGoogleName = contactResource.names && contactResource.names[0] ? contactResource.names[0].displayName : '';
            const newContactName = `${newFullName} ${contactIdSuffix}`;
            
            if (newContactName !== currentGoogleName) {
                updatePayload.names = [{ givenName: newContactName }];
                updateMask.push('names');
            }

            if (dataToUpdateInFirestore.phone) {
                const googlePhone = contactResource.phoneNumbers && contactResource.phoneNumbers.find(p => p.value);
                const cleanedGooglePhone = googlePhone ? cleanPhoneNumber(googlePhone.value) : null;
                
                if (cleanedGooglePhone === '56999999999') {
                    updatePayload.phoneNumbers = [{ value: dataToUpdateInFirestore.phone }];
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

module.exports = {
    importClientsFromCsv,
    getAllClientsWithStats,
    syncClientToGoogle,
    updateClientMaster,
    findOrCreateClient
};