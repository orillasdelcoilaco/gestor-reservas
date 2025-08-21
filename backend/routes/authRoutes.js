const express = 'express';
const { OAuth2Client } = 'google-auth-library';
const fs = 'fs';
const path = 'path';

const router = express.Router();

// --- Configuración del Cliente OAuth2 ---
const CREDENTIALS_PATH = path.join(process.cwd(), 'etc', 'secrets', 'oauth_credentials.json');

let oauth2Client;

// Cargar las credenciales al iniciar
try {
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
    const { client_secret, client_id, redirect_uris } = credentials.web;
    oauth2Client = new OAuth2Client(client_id, client_secret, redirect_uris[0]);
} catch (err) {
    console.error('Error al cargar el archivo de credenciales de OAuth:', err);
    // Si no se pueden cargar las credenciales, las rutas no funcionarán.
}

// --- Rutas de Autenticación ---
module.exports = (db) => {
    if (!oauth2Client) {
        // Si el cliente no se inicializó, devolvemos un router que informa del error.
        router.use('/auth/google', (req, res) => {
            res.status(500).send('Error de configuración del servidor: No se pudieron cargar las credenciales de OAuth.');
        });
        return router;
    }

    /**
     * Inicia el flujo de consentimiento de OAuth2.
     * Redirige al usuario a la pantalla de consentimiento de Google.
     */
    router.get('/auth/google', (req, res) => {
        const authUrl = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: ['https://www.googleapis.com/auth/contacts'],
            prompt: 'consent' // Pide consentimiento cada vez para asegurar que obtenemos el refresh_token
        });
        res.redirect(authUrl);
    });

    /**
     * Es la URL de callback a la que Google redirige después del consentimiento.
     * Obtiene el refresh_token y lo guarda de forma segura.
     */
    router.get('/auth/google/callback', async (req, res) => {
        const code = req.query.code;
        if (!code) {
            return res.status(400).send('No se recibió el código de autorización.');
        }

        try {
            const { tokens } = await oauth2Client.getToken(code);
            const refreshToken = tokens.refresh_token;

            if (!refreshToken) {
                return res.status(400).send('No se recibió el refresh token. Asegúrate de dar tu consentimiento.');
            }

            // Guardar el refresh_token de forma segura en Firestore
            // Usaremos un documento fijo para almacenar la configuración.
            const tokenDocRef = db.collection('config').doc('google_auth_tokens');
            await tokenDocRef.set({
                refreshToken: refreshToken,
                user: 'orillasdelcoilaco@gmail.com' // Identifica a qué usuario pertenece el token
            });

            res.send('¡Autorización completada con éxito! Ya puedes cerrar esta ventana.');

        } catch (err) {
            console.error('Error al obtener el token:', err);
            res.status(500).send('Error al procesar la autorización de Google.');
        }
    });

    return router;
};