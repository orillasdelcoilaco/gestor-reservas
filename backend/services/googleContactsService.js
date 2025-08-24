// backend/services/googleContactsService.js - CÓDIGO ACTUALIZADO Y MEJORADO

const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');
const fs = require('fs');
const path = require('path');
const { cleanPhoneNumber } = require('../utils/helpers');

const isProduction = process.env.RENDER === 'true';
const CREDENTIALS_PATH = isProduction
    ? '/etc/secrets/oauth_credentials.json'
    : path.join(process.cwd(), 'oauth_credentials.json');

async function getAuthenticatedClient(db) {
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
    const { client_secret, client_id, redirect_uris } = credentials.web;
    const oauth2Client = new OAuth2Client(client_id, client_secret, redirect_uris[0]);

    const tokenDocRef = db.collection('config').doc('google_auth_tokens');
    const doc = await tokenDocRef.get();

    if (!doc.exists || !doc.data().refreshToken) {
        throw new Error('No se encontró el refresh token. Por favor, autoriza la aplicación primero.');
    }
    const refreshToken = doc.data().refreshToken;

    oauth2Client.setCredentials({
        refresh_token: refreshToken
    });

    return oauth2Client;
}

async function findGoogleContactByName(people, name) {
    try {
        const res = await people.people.searchContacts({
            query: name,
            readMask: 'names',
            pageSize: 1,
        });

        if (res.data.results && res.data.results.length > 0) {
            for (const result of res.data.results) {
                if (result.person.names && result.person.names.some(n => n.displayName === name)) {
                    return true;
                }
            }
        }
        return false;
    } catch (err) {
        console.error(`Error buscando el contacto '${name}' en Google:`, err.message);
        throw err;
    }
}

async function createGoogleContact(db, contactData) {
    if (!contactData || !contactData.name || !contactData.phone) {
        console.error('Datos de contacto insuficientes para crear contacto en Google.');
        return false;
    }

    try {
        const auth = await getAuthenticatedClient(db);
        const people = google.people({ version: 'v1', auth });

        const contactExists = await findGoogleContactByName(people, contactData.name);
        if (contactExists) {
            console.log(`El contacto '${contactData.name}' ya existe en Google Contacts. Marcado como sincronizado.`);
            return true;
        }

        const resource = {
            names: [{ givenName: contactData.name }],
            phoneNumbers: [{ value: contactData.phone }]
        };

        if (contactData.email) {
            resource.emailAddresses = [{ value: contactData.email }];
        }

        await people.people.createContact({ resource });
        console.log(`Contacto '${contactData.name}' creado exitosamente en Google Contacts.`);
        return true;

    } catch (err) {
        console.error(`Error al procesar el contacto '${contactData.name}' en Google:`, err.message);
        return false;
    }
}

/**
 * --- FUNCIÓN MEJORADA ---
 * Busca un contacto en Google por su número de teléfono. Puede usar un ID de reserva para desambiguar.
 * @param {object} db - Instancia de Firestore.
 * @param {string} phone - Número de teléfono a buscar.
 * @param {string} [reservaIdHint] - ID de reserva opcional para encontrar el contacto correcto si hay duplicados.
 * @returns {Promise<object|null>} El recurso completo del contacto si se encuentra, o null.
 */
async function findContactByPhone(db, phone, reservaIdHint = null) {
    if (!phone) return null;
    const cleanedPhone = cleanPhoneNumber(phone);

    try {
        const auth = await getAuthenticatedClient(db);
        const people = google.people({ version: 'v1', auth });

        const res = await people.people.searchContacts({
            query: cleanedPhone,
            readMask: 'names,phoneNumbers,emailAddresses',
            pageSize: 20
        });

        if (!res.data.results || res.data.results.length === 0) {
            return null;
        }
        
        const candidates = [];
        for (const result of res.data.results) {
            if (result.person.phoneNumbers) {
                const hasMatchingPhone = result.person.phoneNumbers.some(p => cleanPhoneNumber(p.value) === cleanedPhone);
                if (hasMatchingPhone) {
                    candidates.push(result.person);
                }
            }
        }

        if (candidates.length === 0) return null;
        if (candidates.length === 1) return candidates[0];

        // Si hay varios candidatos, usamos el hint para encontrar el correcto
        if (reservaIdHint) {
            const specificContact = candidates.find(c => 
                c.names && c.names.some(n => n.displayName && n.displayName.includes(reservaIdHint))
            );
            return specificContact || null;
        }

        // Si no hay hint, no podemos decidir, así que no devolvemos nada para evitar errores.
        return null; 

    } catch (err) {
        console.error(`Error buscando contacto por teléfono '${cleanedPhone}':`, err.message);
        throw err;
    }
}

/**
 * Actualiza un contacto existente en Google Contacts.
 */
async function updateContact(db, resourceName, payload, updateMask) {
    try {
        const auth = await getAuthenticatedClient(db);
        const people = google.people({ version: 'v1', auth });

        // Para la API de Google, los nombres se actualizan por separado
        const requestBody = {
            etag: '*', // Forzar la actualización
        };
        if (payload.names) requestBody.names = payload.names;
        if (payload.phoneNumbers) requestBody.phoneNumbers = payload.phoneNumbers;


        await people.people.updateContact({
            resourceName: resourceName,
            updatePersonFields: updateMask.join(','),
            requestBody: requestBody
        });

        return true;
    } catch (err) {
        console.error(`Error al actualizar el contacto ${resourceName}:`, err.message);
        throw err;
    }
}


module.exports = {
    createGoogleContact,
    findContactByPhone,
    updateContact,
    getContactPhoneByName // Esta función se mantiene por si es usada en otra parte.
};