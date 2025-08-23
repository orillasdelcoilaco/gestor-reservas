// backend/services/googleContactsService.js - CÓDIGO ACTUALIZADO

const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');
const fs = require('fs');
const path = require('path');

const isProduction = process.env.RENDER === 'true';
const CREDENTIALS_PATH = isProduction
    ? '/etc/secrets/oauth_credentials.json'
    : path.join(process.cwd(), 'oauth_credentials.json');

/**
 * Crea un cliente OAuth2 autenticado usando el refresh token guardado en Firestore.
 */
async function getAuthenticatedClient(db) {
    // ... (Esta función no cambia)
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

/**
 * Busca un contacto por su nombre exacto para ver si existe.
 */
async function findGoogleContactByName(people, name) {
    // ... (Esta función no cambia)
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
        return false;
    }
}

/**
 * ¡NUEVA FUNCIÓN!
 * Busca un contacto por su nombre y devuelve su número de teléfono.
 * @param {object} db - Instancia de la base de datos de Firestore.
 * @param {string} name - El nombre exacto del contacto a buscar.
 * @returns {Promise<string|null>} El número de teléfono limpio o null si no se encuentra.
 */
async function getContactPhoneByName(db, name) {
    try {
        const auth = await getAuthenticatedClient(db);
        const people = google.people({ version: 'v1', auth });
        
        const res = await people.people.searchContacts({
            query: name,
            readMask: 'names,phoneNumbers', // Ahora también pedimos los números de teléfono
            pageSize: 5
        });

        if (res.data.results && res.data.results.length > 0) {
            const exactMatch = res.data.results.find(result =>
                result.person.names && result.person.names.some(n => n.displayName === name)
            );

            if (exactMatch && exactMatch.person.phoneNumbers && exactMatch.person.phoneNumbers.length > 0) {
                const phoneValue = exactMatch.person.phoneNumbers[0].value;
                // Devolvemos el número limpio (solo dígitos)
                return phoneValue ? phoneValue.replace(/\D/g, '') : null;
            }
        }
        return null; // No se encontró el contacto o no tiene teléfono
    } catch (err) {
        console.error(`Error al obtener el teléfono de '${name}':`, err.message);
        return null;
    }
}


/**
 * Verifica si el contacto existe antes de crearlo. (Función sin cambios)
 */
async function createGoogleContact(db, contactData) {
    // ... (Esta función no cambia)
    if (!contactData || !contactData.name || !contactData.phone) {
        console.error('Datos de contacto insuficientes para crear contacto en Google. Se requiere nombre y teléfono.');
        return;
    }

    try {
        const auth = await getAuthenticatedClient(db);
        const people = google.people({ version: 'v1', auth });

        const contactExists = await findGoogleContactByName(people, contactData.name);
        if (contactExists) {
            console.log(`El contacto '${contactData.name}' ya existe en Google Contacts. No se creará un duplicado.`);
            return;
        }

        const resource = { /* ... */ };
        await people.people.createContact({ resource });
        console.log(`Contacto '${contactData.name}' creado exitosamente en Google Contacts.`);

    } catch (err) {
        console.error(`Error al procesar el contacto '${contactData.name}' en Google:`, err.message);
    }
}

// Exportamos la nueva función junto con la existente
module.exports = {
    createGoogleContact,
    getContactPhoneByName
};