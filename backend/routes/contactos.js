const express = require('express');
const router = express.Router();
const { generateContactsCsv } = require('../services/contactsService'); 

module.exports = (db) => {
  router.post('/generar-csv', async (req, res) => {
    console.log('Solicitud recibida para generar CSV de contactos...');
    try {
      const { csvContent, newContactsCount } = await generateContactsCsv(db);
      
      if (newContactsCount === 0) {
        // Si no hay contactos nuevos, enviamos una respuesta normal
        return res.status(200).json({ message: 'No se encontraron contactos nuevos para exportar.' });
      }

      // Si hay contactos, preparamos el archivo para descarga
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="contactos_para_importar.csv"');
      res.status(200).send(csvContent);

    } catch (error) {
      console.error('Error al generar el CSV de contactos:', error);
      res.status(500).json({ error: 'No se pudo generar el archivo CSV.' });
    }
  });

  return router;
};
