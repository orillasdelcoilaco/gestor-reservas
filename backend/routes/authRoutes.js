const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// --- Configuración del Cliente OAuth2 ---
// Lógica para determinar la ruta correcta de las credenciales
const isProduction = process.env.RENDER === 'true';
const CREDENTIALS_PATH = isProduction 
    ? '/etc/secrets/oauth_credentials.json' // Ruta en producción (Render)
    : path.join(process.cwd(), 'oauth_credentials.json'); // Ruta en desarrollo (asume que el archivo está en la carpeta 'backend')

let oauth2Client;

// Cargar las credenciales al iniciar
try {
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
    const { client_secret, client_id, redirect_uris } = credentials.web;
    oauth2Client = new OAuth2Client(client_id, client_secret, redirect_uris[0]);
    console.log('Credenciales de OAuth cargadas exitosamente.');
} catch (err) {
    console.error('Error al cargar el archivo de credenciales de OAuth:', err);
}

// --- Rutas de Autenticación ---
module.exports = (db) => {
    if (!oauth2Client) {
        router.use('/api/auth/google', (req, res) => {
            res.status(500).send('Error de configuración del servidor: No se pudieron cargar las credenciales de OAuth.');
        });
        return router;
    }

    router.get('/auth/google', (req, res) => {
        const authUrl = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: ['https://www.googleapis.com/auth/contacts'],
            prompt: 'consent'
        });
        res.redirect(authUrl);
    });

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

            const tokenDocRef = db.collection('config').doc('google_auth_tokens');
            await tokenDocRef.set({
                refreshToken: refreshToken,
                user: 'orillasdelcoilaco@gmail.com'
            });

            res.send('¡Autorización completada con éxito! Ya puedes cerrar esta ventana.');

        } catch (err) {
            console.error('Error al obtener el token:', err);
            res.status(500).send('Error al procesar la autorización de Google.');
        }
    });

    return router;
};