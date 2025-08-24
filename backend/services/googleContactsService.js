// backend/services/googleContactsService.js - CÓDIGO ACTUALIZADO Y COMPLETO

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

async function getContactPhoneByName(db, name) {
    try {
        const auth = await getAuthenticatedClient(db);
        const people = google.people({ version: 'v1', auth });
        
        const res = await people.people.searchContacts({
            query: name,
            readMask: 'names,phoneNumbers',
            pageSize: 5
        });

        if (res.data.results && res.data.results.length > 0) {
            const exactMatch = res.data.results.find(result =>
                result.person.names && result.person.names.some(n => n.displayName === name)
            );

            if (exactMatch && exactMatch.person.phoneNumbers && exactMatch.person.phoneNumbers.length > 0) {
                const phoneValue = exactMatch.person.phoneNumbers[0].value;
                return phoneValue ? phoneValue.replace(/\D/g, '') : null;
            }
        }
        return null;
    } catch (err) {
        console.error(`Error al obtener el teléfono de '${name}':`, err.message);
        return null;
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
 * --- NUEVA FUNCIÓN ---
 * Busca un contacto en Google por su número de teléfono.
 * @param {object} db - Instancia de Firestore.
 * @param {string} phone - Número de teléfono a buscar.
 * @returns {Promise<object|null>} El recurso completo del contacto si se encuentra, o null.
 */
async function findContactByPhone(db, phone) {
    if (!phone) return null;
    const cleanedPhone = cleanPhoneNumber(phone);

    try {
        const auth = await getAuthenticatedClient(db);
        const people = google.people({ version: 'v1', auth });

        const res = await people.people.searchContacts({
            query: cleanedPhone,
            readMask: 'names,phoneNumbers,emailAddresses', // Pedimos todos los datos que podríamos necesitar
            pageSize: 10
        });

        if (res.data.results && res.data.results.length > 0) {
            // Buscamos una coincidencia exacta del número de teléfono
            for (const result of res.data.results) {
                if (result.person.phoneNumbers) {
                    const hasMatchingPhone = result.person.phoneNumbers.some(p => cleanPhoneNumber(p.value) === cleanedPhone);
                    if (hasMatchingPhone) {
                        return result.person; // Devolvemos el objeto completo de la persona
                    }
                }
            }
        }
        return null; // No se encontró coincidencia
    } catch (err) {
        console.error(`Error buscando contacto por teléfono '${cleanedPhone}':`, err.message);
        throw err;
    }
}

/**
 * --- NUEVA FUNCIÓN ---
 * Actualiza un contacto existente en Google Contacts.
 * @param {object} db - Instancia de Firestore.
 * @param {string} resourceName - El ID del recurso del contacto (ej. 'people/c12345').
 * @param {object} payload - Objeto con los campos a actualizar (ej. { names: [...], phoneNumbers: [...] }).
 * @param {string[]} updateMask - Array con los nombres de los campos que se están actualizando (ej. ['names', 'phoneNumbers']).
 */
async function updateContact(db, resourceName, payload, updateMask) {
    try {
        const auth = await getAuthenticatedClient(db);
        const people = google.people({ version: 'v1', auth });

        await people.people.updateContact({
            resourceName: resourceName,
            updatePersonFields: updateMask.join(','),
            requestBody: {
                ...payload,
                etag: '*' // Usamos etag '*' para forzar la actualización
            }
        });

        return true;
    } catch (err) {
        console.error(`Error al actualizar el contacto ${resourceName}:`, err.message);
        throw err;
    }
}


module.exports = {
    createGoogleContact,
    getContactPhoneByName,
    findContactByPhone, // <-- Exportamos la nueva función
    updateContact       // <-- Exportamos la nueva función
};