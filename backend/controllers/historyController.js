// backend/controllers/historyController.js
const historyService = require('../services/historyService');

async function getHistory(req, res, db) {
    try {
        const filters = {
            startDate: req.query.startDate,
            endDate: req.query.endDate,
            cabanaId: req.query.cabanaId,
            espacio: req.query.espacio
        };

        const events = await historyService.getHistory(db, filters);
        res.json(events);
    } catch (error) {
        console.error('Error fetching history:', error);
        res.status(500).json({ error: 'Error obteniendo historial' });
    }
}

module.exports = {
    getHistory
};
