const express = require('express');
const router = express.Router();
const driveService = require('../services/driveService');
const config = require('../config');
const csv = require('csv-parser');
const XLSX = require('xlsx'); // <-- USAMOS LA NUEVA LIBRERÍA XLSX (SheetJS)
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
 * Convierte un stream de datos a un buffer de memoria.
 * @param {stream.Readable} stream - El stream de entrada.
 * @returns {Promise<Buffer>} Una promesa que se resuelve con el buffer del stream.
 */
function streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', (err) => reject(err));
    });
}

/**
 * Parsea un stream de datos de un archivo Excel (.xls o .xlsx).
 * @param {stream.Readable} fileStream - El stream del archivo Excel.
 * @returns {Promise<Array<Object>>} Una promesa que se resuelve con un array de objetos (filas).
 */
async function parseExcelStream(fileStream) {
    // La librería 'xlsx' necesita leer el archivo completo desde un buffer
    const buffer = await streamToBuffer(fileStream);
    const workbook = XLSX.read(buffer);
    const sheetName = workbook.SheetNames[0]; // Tomamos la primera hoja
    const worksheet = workbook.Sheets[sheetName];
    // Convertimos la hoja a formato JSON
    const jsonData = XLSX.utils.sheet_to_json(worksheet);
    return jsonData;
}

/**
 * Guarda un array de datos en una colección de Firestore, borrando los datos antiguos primero.
 * @param {admin.firestore.Firestore} db - La instancia de Firestore.
 * @param {string} collectionName - El nombre de la colección.
 * @param {Array<Object>} data - Los datos a guardar.
 */
async function saveDataToFirestore(db, collectionName, data) {
    const collectionRef = db.collection(collectionName);
    console.log(`Borrando datos antiguos de la colección: ${collectionName}...`);
    
    const snapshot = await collectionRef.limit(500).get();
    if (snapshot.size > 0) {
        const batchDelete = db.batch();
        snapshot.docs.forEach(doc => batchDelete.delete(doc.ref));
        await batchDelete.commit();
    }

    console.log(`Guardando ${data.length} nuevos registros en ${collectionName}...`);
    for (let i = 0; i < data.length; i += 500) {
        const batchUpload = db.batch();
        const chunk = data.slice(i, i + 500);
        chunk.forEach(row => {
            const docRef = collectionRef.doc();
            batchUpload.set(docRef, row);
        });
        await batchUpload.commit();
    }
}


module.exports = (db) => {
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

      if (sodcFile) {
        console.log(`Descargando y procesando archivo SODC: ${sodcFile.name}`);
        const fileStream = await driveService.downloadFile(drive, sodcFile.id);
        const sodcData = await parseCsvStream(fileStream);
        await saveDataToFirestore(db, 'reportes_sodc_raw', sodcData);
        summary.sodc = `Archivo ${sodcFile.name} procesado. Se guardaron ${sodcData.length} registros.`;
      }

      if (bookingFile) {
        console.log(`Descargando y procesando archivo Booking: ${bookingFile.name}`);
        const fileStream = await driveService.downloadFile(drive, bookingFile.id);
        // Usamos la nueva función para parsear Excel
        const bookingData = await parseExcelStream(fileStream);
        await saveDataToFirestore(db, 'reportes_booking_raw', bookingData);
        summary.booking = `Archivo ${bookingFile.name} procesado. Se guardaron ${bookingData.length} registros.`;
      }

      res.status(200).json({
        message: 'Sincronización y guardado en base de datos completado.',
        summary: summary,
      });

    } catch (error) {
      console.error('Error fatal durante la sincronización:', error);
      res.status(500).json({ error: 'Falló el proceso de sincronización con Google Drive.' });
    }
  });

  return router;
};
