const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');
const fs = require('fs');
const path = require('path');

// --- Lógica para Cargar Credenciales y Tokens ---

const isProduction = process.env.RENDER === 'true';
const CREDENTIALS_PATH = isProduction 
    ? '/etc/secrets/oauth_credentials.json' 
    : path.join(process.cwd(), 'oauth_credentials.json');

/**
 * Crea un cliente OAuth2 autenticado usando el refresh token guardado en Firestore.
 * @param {admin.firestore.Firestore} db La instancia de Firestore.
 * @returns {Promise<OAuth2Client>} Un cliente OAuth2 autenticado y listo para usar.
 */
async function getAuthenticatedClient(db) {
    // 1. Cargar las credenciales base de la aplicación
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
    const { client_secret, client_id, redirect_uris } = credentials.web;
    const oauth2Client = new OAuth2Client(client_id, client_secret, redirect_uris[0]);

    // 2. Obtener el refresh token de Firestore
    const tokenDocRef = db.collection('config').doc('google_auth_tokens');
    const doc = await tokenDocRef.get();

    if (!doc.exists || !doc.data().refreshToken) {
        throw new Error('No se encontró el refresh token en la base de datos. Por favor, completa el proceso de autorización.');
    }
    const refreshToken = doc.data().refreshToken;

    // 3. Configurar el cliente con el refresh token para que pueda autenticarse
    oauth2Client.setCredentials({
        refresh_token: refreshToken
    });

    return oauth2Client;
}

/**
 * Crea un nuevo contacto en la cuenta de Google del usuario.
 * @param {admin.firestore.Firestore} db La instancia de Firestore.
 * @param {Object} contactData Los datos del contacto a crear. Ej: { name: 'Juan Perez Booking', phone: '+56912345678', email: 'juan@perez.com' }
 */
async function createGoogleContact(db, contactData) {
    if (!contactData || !contactData.name || !contactData.phone) {
        console.error('Datos de contacto insuficientes. Se requiere nombre y teléfono.');
        return;
    }

    try {
        // Obtenemos el cliente ya autenticado
        const auth = await getAuthenticatedClient(db);
        const people = google.people({ version: 'v1', auth });

        // Preparamos el recurso del contacto para la API de Google
        const resource = {
            names: [{
                givenName: contactData.name // Usamos el nombre completo formateado
            }],
            phoneNumbers: [{
                value: contactData.phone
            }]
        };

        if (contactData.email) {
            resource.emailAddresses = [{
                value: contactData.email
            }];
        }

        // Llamamos a la API para crear el contacto
        await people.people.createContact({ resource });
        
        console.log(`Contacto '${contactData.name}' creado exitosamente en Google Contacts.`);

    } catch (err) {
        // Si falla, registramos el error pero no detenemos el proceso principal.
        console.error(`Error al crear el contacto '${contactData.name}' en Google:`, err.message);
    }
}

module.exports = {
    createGoogleContact,
};