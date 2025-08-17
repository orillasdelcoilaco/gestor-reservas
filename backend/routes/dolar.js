const express = require('express');
const router = express.Router();
const multer = require('multer');
const { processDolarCsv } = require('../services/dolarService');

// Configuración de Multer para guardar el archivo temporalmente en memoria
const upload = multer({ storage: multer.memoryStorage() });

module.exports = (db) => {
  /**
   * POST /api/dolar/upload-csv
   * Recibe un archivo CSV con los valores del dólar y lo procesa.
   */
  router.post('/dolar/upload-csv', upload.single('dolarFile'), async (req, res) => {
    console.log('Solicitud recibida para cargar CSV de valores del dólar.');

    if (!req.file) {
      return res.status(400).json({ error: 'No se ha subido ningún archivo.' });
    }

    try {
      const summary = await processDolarCsv(db, req.file.buffer);
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