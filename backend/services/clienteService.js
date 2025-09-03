// backend/services/clienteService.js - CÓDIGO FINAL CON LÓGICA CENTRALIZADA

const csv = require('csv-parser');
const stream = require('stream');
const { cleanPhoneNumber } = require('../utils/helpers');
const { createGoogleContact, findContactByName, updateContact } = require('./googleContactsService');

// ... (El resto de las funciones como findOrCreateClient, importClientsFromCsv, etc., no cambian) ...

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

async function importClientsFromCsv(db, files) {
    // ... (código sin cambios)
}

async function getAllClientsWithStats(db) {
    // ... (código sin cambios)
}

// --- FUNCIÓN COMPLETAMENTE REESCRITA ---
async function syncClientToGoogle(db, clientId) {
    const clientRef = db.collection('clientes').doc(clientId);
    const clientDoc = await clientRef.get();
    if (!clientDoc.exists) {
        throw new Error('El cliente no existe.');
    }
    const clientData = clientDoc.data();
    
    // Obtener la reserva más reciente para construir el nombre del contacto
    const q = db.collection('reservas').where('clienteId', '==', clientId).orderBy('fechaReserva', 'desc').limit(1);
    const snapshot = await q.get();
    if (snapshot.empty) {
        throw new Error('No se encontraron reservas para este cliente, no se puede crear el nombre del contacto.');
    }
    const reservaData = snapshot.docs[0].data();
    const contactName = `${reservaData.clienteNombre} ${reservaData.canal} ${reservaData.reservaIdOriginal}`;

    // Buscar si el contacto ya existe en Google
    const existingContact = await findContactByName(db, contactName);

    if (existingContact) {
        // --- LÓGICA DE ACTUALIZACIÓN ---
        console.log(`Contacto "${contactName}" encontrado. Verificando si necesita actualización...`);
        const updatePayload = { etag: existingContact.etag };
        const updateMask = [];

        const currentGoogleName = existingContact.names && existingContact.names[0] ? existingContact.names[0].displayName : '';
        const currentGooglePhone = existingContact.phoneNumbers && existingContact.phoneNumbers[0] ? cleanPhoneNumber(existingContact.phoneNumbers[0].value) : null;
        const genericPhone = '56999999999';

        // 1. Comprobar si el nombre necesita actualizarse
        if (currentGoogleName !== contactName) {
            updatePayload.names = [{ givenName: contactName }];
            updateMask.push('names');
        }

        // 2. Comprobar si el teléfono necesita actualizarse (si el de Google es genérico y el nuestro no)
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
        // --- LÓGICA DE CREACIÓN (SI NO EXISTE) ---
        console.log(`Contacto "${contactName}" no encontrado. Creando...`);
        const contactPayload = {
            name: contactName,
            phone: clientData.phone || genericPhone,
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
    // ... (código sin cambios)
}

module.exports = {
    importClientsFromCsv,
    getAllClientsWithStats,
    syncClientToGoogle,
    updateClientMaster,
    findOrCreateClient
};