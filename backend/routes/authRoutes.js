const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// --- Configuración del Cliente OAuth2 ---
const isProduction = process.env.RENDER === 'true';
const CREDENTIALS_PATH = isProduction
    ? '/etc/secrets/oauth_credentials.json'
    : path.join(process.cwd(), 'oauth_credentials.json');

let oauth2Client;

try {
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
    const { client_secret, client_id } = credentials.web; // No leemos más redirect_uris

    // --- CORRECCIÓN APLICADA AQUÍ ---
    // Definimos explícitamente la URI de redirección correcta.
    const correctRedirectUri = 'https://gestor-reservas.onrender.com/auth/google/callback';

    oauth2Client = new OAuth2Client(client_id, client_secret, correctRedirectUri);
    console.log('Credenciales de OAuth cargadas y URI de redirección configurada correctamente.');

} catch (err) {
    console.error('Error al cargar el archivo de credenciales de OAuth:', err);
}

// --- Rutas de Autenticación ---
module.exports = (db) => {

    // --- RUTA: MAGIC LOGIN (Token Exchange) - AVAILABLE ALWAYS ---
    router.post('/magic-login', async (req, res) => {
        const { accessToken } = req.body;
        if (!accessToken) return res.status(400).json({ error: 'Token requerido' });

        try {
            // 1. Buscar trabajador con ese token
            const workersRef = db.collection('trabajadores');
            const snapshot = await workersRef.where('accessToken', '==', accessToken).limit(1).get();

            if (snapshot.empty) {
                return res.status(401).json({ error: 'Token inválido o expirado' });
            }

            const workerDoc = snapshot.docs[0];
            const workerData = workerDoc.data();
            const workerId = workerDoc.id;

            // 2. Generar Custom Token de Firebase
            const admin = require('firebase-admin');

            console.log(`[MagicLogin] Creating token for ${workerId} (${workerData.nombre})`);

            // Generate Custom Token using the worker ID
            const token = await admin.auth().createCustomToken(workerId);

            res.json({
                success: true,
                token: token,
                worker: {
                    id: workerId,
                    nombre: workerData.nombre,
                    rol: workerData.rol || 'worker'
                }
            });

        } catch (error) {
            console.error('Magic Login Error:', error);
            res.status(500).json({ error: error.message });
        }
    });

    if (!oauth2Client) {
        // Register Google routes as error handlers if config missing
        router.use('/google', (req, res) => {
            res.status(500).send('Error de configuración del servidor: No se pudieron cargar las credenciales de OAuth.');
        });
        return router;
    }

    // --- Google Auth Routes (Only if OAuth Client exists) ---

    // Esta ruta se convierte en /auth/google
    router.get('/google', (req, res) => {
        const authUrl = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: ['https://www.googleapis.com/auth/contacts'],
            prompt: 'consent'
        });
        res.redirect(authUrl);
    });

    // Esta ruta se convierte en /auth/google/callback
    router.get('/google/callback', async (req, res) => {
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