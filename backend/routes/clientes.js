const express = require('express');
const router = express.Router();
const multer = require('multer');
const { importClientsFromCsv } = require('../services/clienteService'); // Importaremos la función que crearemos después

// Configura multer para manejar múltiples archivos en memoria (hasta 10 a la vez)
const upload = multer({ storage: multer.memoryStorage() }).array('clientsFiles', 10);

module.exports = (db) => {
  /**
   * POST /api/clientes/importar-csv
   * Recibe archivos CSV, los procesa y crea nuevos clientes en Firebase.
   */
  router.post('/clientes/importar-csv', upload, async (req, res) => {
    console.log('Solicitud recibida para importar clientes desde CSV.');

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No se han subido archivos.' });
    }

    try {
      // La lógica principal estará en la función importClientsFromCsv
      const summary = await importClientsFromCsv(db, req.files);
      res.status(200).json({
        message: `Proceso completado. Se leyeron ${summary.totalRowsRead} contactos en ${summary.filesProcessed} archivo(s). Se importaron ${summary.newClientsAdded} clientes nuevos.`,
        summary: summary,
      });
    } catch (error) {
      console.error('Error al procesar el archivo CSV de clientes:', error);
      res.status(500).json({ error: 'Falló el procesamiento del archivo CSV.' });
    }
  });

  return router;
};