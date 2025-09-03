// backend/services/googleContactsService.js - CÓDIGO FINAL Y CORREGIDO

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

// --- FUNCIÓN MODIFICADA ---
// Ahora devuelve el objeto completo del contacto o null.
async function findContactByName(db, nameQuery) {
    if (!nameQuery) return null;
    try {
        const auth = await getAuthenticatedClient(db);
        const people = google.people({ version: 'v1', auth });

        const res = await people.people.searchContacts({
            query: nameQuery,
            readMask: 'names,phoneNumbers,emailAddresses,metadata',
            pageSize: 5
        });

        if (res.data.results && res.data.results.length > 0) {
            const exactMatch = res.data.results.find(result =>
                result.person.names && result.person.names.some(n => n.displayName.includes(nameQuery))
            );
            return exactMatch ? exactMatch.person : null;
        }
        return null;
    } catch (err) {
        console.error(`Error buscando el contacto por nombre '${nameQuery}':`, err.message);
        throw err;
    }
}

async function createGoogleContact(db, contactData) {
    // Esta función ahora asume que ya se verificó que el contacto no existe.
    if (!contactData || !contactData.name || !contactData.phone) {
        console.warn('Datos insuficientes para crear contacto en Google.');
        return false;
    }
    try {
        const auth = await getAuthenticatedClient(db);
        const people = google.people({ version: 'v1', auth });

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
        console.error(`Error al crear el contacto '${contactData.name}' en Google:`, err.message);
        return false;
    }
}

async function updateContact(db, resourceName, payload, updateMask) {
    try {
        const auth = await getAuthenticatedClient(db);
        const people = google.people({ version: 'v1', auth });

        await people.people.updateContact({
            resourceName: resourceName,
            updatePersonFields: updateMask.join(','),
            requestBody: {
                ...payload,
                etag: payload.etag
            }
        });
        console.log(`Contacto ${resourceName} actualizado exitosamente.`);
        return true;
    } catch (err) {
        console.error(`Error al actualizar el contacto ${resourceName}:`, err.message);
        throw err;
    }
}

module.exports = {
    createGoogleContact,
    getContactPhoneByName,
    findContactByName,
    updateContact
};