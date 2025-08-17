const express = require('express');
const router = express.Router();
const { processChannel } = require('../services/consolidationService');
const { updateTodaysDolarValue } = require('../services/dolarService'); // <-- 1. IMPORTAR

module.exports = (db) => {
  /**
   * POST /api/consolidar
   * Actualiza el valor del dólar del día y luego consolida los datos de los canales.
   */
  router.post('/consolidar', async (req, res) => { // <-- 2. HACER ASYNC
    console.log('Iniciando proceso de consolidación de datos...');
    try {
      // --- 3. NUEVO PASO ---
      // Asegura que el valor del dólar de hoy esté actualizado antes de continuar.
      await updateTodaysDolarValue(db);
      console.log('Verificación del valor del dólar completada.');
      // --- FIN NUEVO PASO ---

      // Ejecutamos el procesamiento para ambos canales en paralelo
      const [sodcSummary, bookingSummary] = await Promise.all([
        processChannel(db, 'SODC'),
        processChannel(db, 'Booking')
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
