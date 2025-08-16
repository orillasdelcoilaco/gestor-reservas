const express = require('express');
const router = express.Router();
const driveService = require('../services/driveService');
const config = require('../config');
const csv = require('csv-parser');
const ExcelJS = require('exceljs');
const stream = require('stream');

/**
 * Parsea un stream de datos CSV.
 * @param {stream.Readable} fileStream - El stream del archivo CSV.
 * @returns {Promise<Array<Object>>} Una promesa que se resuelve con un array de objetos (filas).
 */
function parseCsvStream(fileStream) {
  return new Promise((resolve, reject) => {
    const results = [];
    fileStream
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', (error) => reject(error));
  });
}

/**
 * Parsea un stream de datos XLSX.
 * @param {stream.Readable} fileStream - El stream del archivo XLSX.
 * @returns {Promise<Array<Object>>} Una promesa que se resuelve con un array de objetos (filas).
 */
async function parseXlsxStream(fileStream) {
    const workbook = new ExcelJS.Workbook();
    // ExcelJS necesita leer el stream completo para procesar el archivo
    await workbook.xlsx.read(fileStream);
    const worksheet = workbook.worksheets[0]; // Tomamos la primera hoja
    const results = [];
    const header = worksheet.getRow(1).values;

    worksheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) { // Omitir la fila de encabezado
            let rowData = {};
            row.values.forEach((value, index) => {
                // Usamos el encabezado para crear objetos { 'Nombre Columna': valor }
                if (header[index]) {
                    rowData[header[index]] = value;
                }
            });
            results.push(rowData);
        }
    });
    return results;
}


module.exports = (db) => {
  /**
   * POST /api/sincronizar-drive
   * Orquesta el proceso de encontrar, descargar y procesar los reportes.
   */
  router.post('/sincronizar-drive', async (req, res) => {
    console.log('Iniciando proceso de sincronización desde Google Drive...');
    try {
      const drive = driveService.getDriveClient();
      const folderId = config.DRIVE_FOLDER_ID;

      const [sodcFile, bookingFile] = await Promise.all([
        driveService.findLatestFile(drive, folderId, config.SODC_FILE_PATTERN),
        driveService.findLatestFile(drive, folderId, config.BOOKING_FILE_PATTERN)
      ]);

      let summary = {
        sodc: 'No se encontró archivo nuevo.',
        booking: 'No se encontró archivo nuevo.',
      };

      // Procesar archivo SODC (CSV)
      if (sodcFile) {
        console.log(`Descargando y procesando archivo SODC: ${sodcFile.name}`);
        const fileStream = await driveService.downloadFile(drive, sodcFile.id);
        const sodcData = await parseCsvStream(fileStream);
        console.log(`Se leyeron ${sodcData.length} filas del reporte SODC.`);
        // A futuro, aquí guardaremos sodcData en la colección 'reportes_sodc_raw'
        summary.sodc = `Archivo ${sodcFile.name} procesado. Se encontraron ${sodcData.length} registros.`;
      }

      // Procesar archivo Booking (XLSX)
      if (bookingFile) {
        console.log(`Descargando y procesando archivo Booking: ${bookingFile.name}`);
        const fileStream = await driveService.downloadFile(drive, bookingFile.id);
        const bookingData = await parseXlsxStream(fileStream);
        console.log(`Se leyeron ${bookingData.length} filas del reporte Booking.`);
        // A futuro, aquí guardaremos bookingData en la colección 'reportes_booking_raw'
        summary.booking = `Archivo ${bookingFile.name} procesado. Se encontraron ${bookingData.length} registros.`;
      }

      res.status(200).json({
        message: 'Sincronización y lectura de archivos completada.',
        summary: summary,
      });

    } catch (error) {
      console.error('Error fatal durante la sincronización:', error);
      res.status(500).json({ error: 'Falló el proceso de sincronización con Google Drive.' });
    }
  });

  return router;
};
