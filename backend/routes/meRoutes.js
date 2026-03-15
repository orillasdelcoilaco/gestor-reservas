const express = require('express');
const router = express.Router();

module.exports = (db) => {

    /**
     * GET /api/me
     * Devuelve la información del usuario autenticado y sus permisos de aplicación.
     * Requiere middleware checkFirebaseToken previo.
     */
    router.get('/', async (req, res) => {
        try {
            const { uid, email } = req.user; // Inyectado por checkFirebaseToken

            // 1. Buscar permisos en user_access
            const accessDoc = await db.collection('user_access').doc(uid).get();

            let allowedApps = [];
            let defaultApp = null;

            if (accessDoc.exists) {
                const data = accessDoc.data();
                allowedApps = data.allowedApps || [];
                defaultApp = data.defaultApp || null;
            } else {
                // Fallback para admin legacy si no corrió el seed (aunque debería haber corrido)
                if (email.endsWith('@orillasdelcoilaco.cl')) {
                    allowedApps = ['gestor_reservas'];
                    defaultApp = 'gestor_reservas';
                }
            }

            // 2. Responder
            res.json({
                uid,
                email,
                allowedApps,
                defaultApp
            });

        } catch (error) {
            console.error('[API/ME] Error getting user info:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });

    return router;
};
