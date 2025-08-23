// backend/services/googleContactsService.js - CÓDIGO ACTUALIZADO

const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');
const fs = require('fs');
const path = require('path');

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
        // Si la búsqueda falla (ej. por cuota), lo consideramos como un error.
        console.error(`Error buscando el contacto '${name}' en Google:`, err.message);
        throw err; // Lanzamos el error para que sea capturado por la función principal.
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

/**
 * Intenta crear un contacto en Google.
 * @param {object} db - Instancia de Firestore.
 * @param {object} contactData - Datos del contacto { name, phone, email }.
 * @returns {Promise<boolean>} Devuelve `true` si el contacto se creó o ya existía. Devuelve `false` si hubo un error (ej. cuota excedida).
 */
async function createGoogleContact(db, contactData) {
    if (!contactData || !contactData.name || !contactData.phone) {
        console.error('Datos de contacto insuficientes para crear contacto en Google.');
        return false; // Falla si no hay datos.
    }

    try {
        const auth = await getAuthenticatedClient(db);
        const people = google.people({ version: 'v1', auth });

        const contactExists = await findGoogleContactByName(people, contactData.name);
        if (contactExists) {
            console.log(`El contacto '${contactData.name}' ya existe en Google Contacts. Marcado como sincronizado.`);
            return true; // Éxito porque ya existe.
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
        return true; // Éxito porque se creó.

    } catch (err) {
        // Si cualquier parte del proceso falla (búsqueda o creación), lo capturamos aquí.
        console.error(`Error al procesar el contacto '${contactData.name}' en Google:`, err.message);
        return false; // Falla debido a un error de API (ej. cuota).
    }
}

module.exports = {
    createGoogleContact,
    getContactPhoneByName
};