const tinajasService = require('../services/tinajasService');

module.exports = (db) => {
    async function getDiarias(req, res) {
        try {
            const data = await tinajasService.getTinajasDiarias(db);
            res.json(data);
        } catch (error) {
            console.error('Error in getTinajasDiarias:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async function updateStatus(req, res) {
        try {
            const result = await tinajasService.updateTinajaStatus(db, req.body);
            res.json(result);
        } catch (error) {
            console.error('Error in updateTinajaStatus:', error);
            res.status(500).json({ error: error.message });
        }
    }

    return {
        getDiarias,
        updateStatus
    };
};
