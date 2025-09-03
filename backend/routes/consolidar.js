const express = require('express');
const router = express.Router();
const { processChannel } = require('../services/consolidationService');
const { updateTodaysDolarValue } = require('../services/dolarService');

module.exports = (db) => {
    /**
     * POST /api/consolidar
     * Actualiza el valor del dólar del día y luego consolida los datos de los canales.
     */
    router.post('/consolidar', async (req, res) => {
        console.log('Iniciando proceso de consolidación de datos...');
        try {
            await updateTodaysDolarValue(db);
            console.log('Verificación del valor del dólar completada.');
            
            // --- INICIO DE LA MODIFICACIÓN ---
            // Se añade Airbnb al procesamiento en paralelo
            const [sodcSummary, bookingSummary, airbnbSummary] = await Promise.all([
                processChannel(db, 'SODC'),
                processChannel(db, 'Booking'),
                processChannel(db, 'Airbnb') // Se añade el nuevo canal
            ]);
            
            res.status(200).json({
                message: 'Proceso de consolidación finalizado.',
                summary: {
                    sodc: sodcSummary,
                    booking: bookingSummary,
                    airbnb: airbnbSummary, // Se añade el resumen de Airbnb
                }
            });
            // --- FIN DE LA MODIFICACIÓN ---
        } catch (error) {
            console.error('Error fatal durante la consolidación:', error);
            res.status(500).json({ error: 'Falló el proceso de consolidación.' });
        }
    });
    return router;
};