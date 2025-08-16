const express = require('express');
const router = express.Router();
const { processChannel } = require('../services/consolidationService');

module.exports = (db) => {
  /**
   * POST /api/consolidar
   * Activa el proceso de consolidación para todos los canales.
   * Lee los datos de las colecciones _raw, los procesa y los guarda en las colecciones finales.
   */
  router.post('/consolidar', async (req, res) => {
    console.log('Iniciando proceso de consolidación de datos...');
    try {
      // Ejecutamos el procesamiento para ambos canales en paralelo
      const [sodcSummary, bookingSummary] = await Promise.all([
        processChannel(db, 'SODC'),
        processChannel(db, 'Booking')
        // A futuro, aquí podríamos añadir processChannel(db, 'Airbnb')
      ]);

      res.status(200).json({
        message: 'Proceso de consolidación finalizado.',
        summary: {
          sodc: sodcSummary,
          booking: bookingSummary,
        }
      });

    } catch (error) {
      console.error('Error fatal durante la consolidación:', error);
      res.status(500).json({ error: 'Falló el proceso de consolidación.' });
    }
  });

  return router;
};
