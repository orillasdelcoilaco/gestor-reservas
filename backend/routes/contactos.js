const express = require('express');
const router = express.Router();
// Importaremos una nueva función que crearemos en el siguiente paso
const { generateContactsCsv } = require('../services/contactsService'); 

module.exports = (db) => {
  /**
   * POST /api/contactos/generar-csv
   * Inicia el proceso de comparar clientes de Firebase con Google Contacts
   * y genera un archivo CSV en Google Drive con los contactos nuevos.
   */
  router.post('/generar-csv', async (req, res) => {
    console.log('Solicitud recibida para generar CSV de contactos...');
    try {
      // La lógica compleja estará en el 'contactsService'
      const summary = await generateContactsCsv(db); 
      
      res.status(200).json({
        message: 'Proceso de generación de CSV completado.',
        summary: summary
      });

    } catch (error) {
      console.error('Error al generar el CSV de contactos:', error);
      res.status(500).json({ error: 'No se pudo generar el archivo CSV.' });
    }
  });

  return router;
};
