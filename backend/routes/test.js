const express = require('express');
const router = express.Router();
const storageTestService = require('../services/storageTestService');

module.exports = (db) => {
    router.get('/test-upload', async (req, res) => {
        try {
            console.log("Ruta de prueba /test-upload alcanzada. Ejecutando testUpload...");
            const url = await storageTestService.testUpload();
            res.status(200).json({
                success: true,
                message: 'La prueba de subida a Firebase Storage fue exitosa.',
                url: url
            });
        } catch (error) {
            console.error("La ruta de prueba /test-upload encontró un error:", error.message);
            res.status(500).json({
                success: false,
                message: 'La prueba de subida a Firebase Storage falló.',
                error: error.message
            });
        }
    });

    return router;
};