const express = require('express');
const router = express.Router();
const multer = require('multer');
const { importClientsFromCsv } = require('../services/contactsService'); // Importaremos la función que crearemos después

// Configura multer para manejar la subida del archivo en memoria
const upload = multer({ storage: multer.memoryStorage() });

module.exports = (db) => {
  /**
   * POST /api/clientes/importar-csv
   * Recibe un archivo CSV, lo procesa y crea nuevos clientes en Firebase.
   */
  router.post('/clientes/importar-csv', upload.single('clientsFile'), async (req, res) => {
    console.log('Solicitud recibida para importar clientes desde CSV.');

    if (!req.file) {
      return res.status(400).json({ error: 'No se ha subido ningún archivo.' });
    }

    try {
      // La lógica principal estará en la función importClientsFromCsv que añadiremos al servicio
      const summary = await importClientsFromCsv(db, req.file.buffer);
      res.status(200).json({
        message: `Se leyeron ${summary.rowsRead} filas. Se encontraron ${summary.validClients} clientes válidos. Se importaron ${summary.newClientsAdded} clientes nuevos.`,
        summary: summary,
      });
    } catch (error) {
      console.error('Error al procesar el archivo CSV de clientes:', error);
      res.status(500).json({ error: 'Falló el procesamiento del archivo CSV.' });
    }
  });

  return router;
};