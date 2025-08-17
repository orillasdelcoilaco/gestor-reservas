const express = require('express');
const router = express.Router();
const { preloadDollarValues } = require('../services/dolarService'); // Importaremos una nueva función

module.exports = (db) => {
  /**
   * POST /api/dolar/precargar
   * Inicia el proceso de precarga de valores históricos del dólar.
   */
  router.post('/dolar/precargar', async (req, res) => {
    console.log('Solicitud recibida para precargar valores del dólar...');
    try {
      // No usamos await aquí para que la respuesta sea inmediata
      // y el proceso largo corra en segundo plano.
      preloadDollarValues(db); 

      res.status(202).json({ 
        message: 'El proceso de precarga ha comenzado en segundo plano. Revisa los logs del servidor para ver el progreso.' 
      });

    } catch (error) {
      console.error('Error al iniciar la precarga:', error);
      res.status(500).json({ error: 'No se pudo iniciar el proceso de precarga.' });
    }
  });

  return router;
};