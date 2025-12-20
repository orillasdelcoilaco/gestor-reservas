// backend/controllers/settingsController.js
const settingsService = require('../services/settingsService');
const notificationService = require('../services/notificationService');

async function getCompanySettings(req, res, db) {
    try {
        const settings = await settingsService.getSettings(db);
        res.json(settings);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

async function updateCompanySettings(req, res, db) {
    try {
        const data = req.body;
        // Validación básica
        if (!data.nombreEmpresa) {
            return res.status(400).json({ error: 'El nombre de la empresa es obligatorio' });
        }

        const result = await settingsService.updateSettings(db, data);

        // Notificar cambio (prueba de integración)
        await notificationService.sendAlert(db, `Se ha actualizado la configuración maestra del sistema.`, 'INFO');

        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

module.exports = {
    getCompanySettings,
    updateCompanySettings
};
