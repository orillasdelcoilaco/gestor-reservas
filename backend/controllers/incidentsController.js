// backend/controllers/incidentsController.js
const incidentsService = require('../services/incidentsService');
const notificationService = require('../services/notificationService');

async function createIncident(req, res, db) {
    try {
        const data = req.body;
        // 1. Guardar Incidencia
        const newIncident = await incidentsService.createIncident(db, data);

        // 2. Enviar Notificación (Async, no bloqueamos respuesta pero la iniciamos)
        const msg = `Nueva incidencia en ${newIncident.cabanaId} - ${newIncident.espacio}: ${newIncident.descripcion}`;
        notificationService.sendAlert(db, msg, newIncident).catch(err => console.error("Error async notification:", err));

        res.status(201).json({ success: true, data: newIncident, message: 'Incidencia reportada y notificada.' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

async function getPending(req, res, db) {
    try {
        const list = await incidentsService.getPendingIncidents(db);
        res.json(list);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

module.exports = {
    createIncident,
    getPending
};
