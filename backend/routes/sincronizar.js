const express = require('express');
const router = express.Router();
const driveService = require('../services/driveService');
const config = require('../config');

module.exports = (db) => {
  /**
   * POST /api/sincronizar-drive
   * Orquesta el proceso de encontrar, descargar y (eventualmente) procesar
   * los reportes más recientes desde Google Drive.
   */
  router.post('/sincronizar-drive', async (req, res) => {
    console.log('Iniciando proceso de sincronización desde Google Drive...');
    try {
      const drive = driveService.getDriveClient();
      const folderId = config.DRIVE_FOLDER_ID;

      // Buscar los archivos más recientes en paralelo
      const [sodcFile, bookingFile] = await Promise.all([
        driveService.findLatestFile(drive, folderId, config.SODC_FILE_PATTERN),
        driveService.findLatestFile(drive, folderId, config.BOOKING_FILE_PATTERN)
      ]);

      let sodcData = null;
      let bookingData = null;
      let summary = {
        sodc: 'No se encontró archivo nuevo.',
        booking: 'No se encontró archivo nuevo.',
      };

      // Descargar y procesar archivo SODC (CSV)
      if (sodcFile) {
        console.log(`Descargando archivo SODC: ${sodcFile.name}`);
        const fileStream = await driveService.downloadFile(drive, sodcFile.id);
        // Aquí añadiremos la lógica para parsear el CSV
        summary.sodc = `Archivo ${sodcFile.name} encontrado y descargado.`;
      }

      // Descargar y procesar archivo Booking (XLSX)
      if (bookingFile) {
        console.log(`Descargando archivo Booking: ${bookingFile.name}`);
        const fileStream = await driveService.downloadFile(drive, bookingFile.id);
        // Aquí añadiremos la lógica para parsear el XLSX
        summary.booking = `Archivo ${bookingFile.name} encontrado y descargado.`;
      }

      // Por ahora, solo devolvemos un resumen de los archivos encontrados.
      res.status(200).json({
        message: 'Sincronización completada.',
        summary: summary,
      });

    } catch (error) {
      console.error('Error fatal durante la sincronización:', error);
      res.status(500).json({ error: 'Falló el proceso de sincronización con Google Drive.' });
    }
  });

  return router;
};
