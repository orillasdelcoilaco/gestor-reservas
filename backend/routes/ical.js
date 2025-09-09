// backend/routes/ical.js

const express = require('express');
const router = express.Router();
const { generateICalForCabana } = require('../services/icalService');

module.exports = (db) => {
    /**
     * GET /ical/:cabanaNombre.ics
     * Genera y devuelve un feed iCal para una cabaña específica.
     * El nombre de la cabaña en la URL debe tener los espacios reemplazados por guiones.
     */
    router.get('/ical/:cabanaNombre.ics', async (req, res) => {
        try {
            // Reemplazar guiones por espacios para buscar en la base de datos
            const nombreCabana = req.params.cabanaNombre.replace(/-/g, ' ');
            
            const icalData = await generateICalForCabana(db, nombreCabana);
            
            res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${req.params.cabanaNombre}.ics"`);
            res.send(icalData);
            
        } catch (error) {
            console.error(`Error al generar el iCal para ${req.params.cabanaNombre}:`, error);
            res.status(500).send('Error al generar el calendario.');
        }
    });

    return router;
};