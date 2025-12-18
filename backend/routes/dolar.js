const express = require('express');
const router = express.Router();
const multer = require('multer');
const { processDolarCsv, getValorDolar } = require('../services/dolarService');

// Configuración de Multer para guardar el archivo temporalmente en memoria
const upload = multer({ storage: multer.memoryStorage() });

module.exports = (db) => {
  router.get('/dolar/valor', async (req, res) => {
    const { fecha } = req.query;
    if (!fecha) {
      return res.status(400).json({ error: 'Se requiere una fecha.' });
    }
    try {
      const valor = await getValorDolar(db, new Date(fecha + 'T00:00:00Z'));
      res.status(200).json({ valor });
    } catch (error) {
      console.error('Error al obtener valor del dólar:', error);
      res.status(500).json({ error: 'No se pudo obtener el valor del dólar.' });
    }
  });

  /**
   * POST /api/dolar/upload-csv
   * Recibe un archivo CSV y el año correspondiente, y procesa los valores del dólar.
   */
  router.post('/dolar/upload-csv', upload.single('dolarFile'), async (req, res) => {
    console.log('Solicitud recibida para cargar CSV de valores del dólar.');

    const year = req.body.year; // <-- OBTENEMOS EL AÑO
    
    if (!req.file) {
      return res.status(400).json({ error: 'No se ha subido ningún archivo.' });
    }
    if (!year || isNaN(parseInt(year))) {
      return res.status(400).json({ error: 'El año es requerido y debe ser un número.' });
    }

    try {
      // Pasamos el año a la función de procesamiento
      const summary = await processDolarCsv(db, req.file.buffer, parseInt(year)); 
      res.status(200).json({
        message: 'Archivo CSV procesado exitosamente.',
        summary: summary,
      });
    } catch (error) {
      console.error('Error al procesar el archivo CSV:', error);
      res.status(500).json({ error: 'Falló el procesamiento del archivo CSV.' });
    }
  });

  return router;
};
