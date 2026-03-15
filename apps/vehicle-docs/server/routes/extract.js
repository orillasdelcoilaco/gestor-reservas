const express = require('express');
const multer = require('multer');
const aiService = require('../services/aiService');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

module.exports = (db) => {
    const router = express.Router();

    // POST /api/extract
    // Receives a file and returns extracted data
    router.post('/', upload.single('document'), async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No file uploaded.' });
            }

            console.log(`[AI Extract] Processing file: ${req.file.originalname} (${req.file.mimetype})`);

            const buffer = req.file.buffer;
            const mimeType = req.file.mimetype;

            const data = await aiService.extract(buffer, mimeType);

            res.json(data);

        } catch (error) {
            console.error('[AI Extract Error]', error);
            res.status(500).json({ error: 'Failed to process document.' });
        }
    });

    return router;
};
