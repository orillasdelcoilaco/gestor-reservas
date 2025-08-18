const express = require('express');
const router = express.Router();
const driveService = require('../services/driveService');
const config = require('../config');
const csv = require('csv-parser');
const XLSX = require('xlsx');
const stream = require('stream');

function parseCsvStream(fileStream) {
  return new Promise((resolve, reject) => {
    const results = [];
    fileStream.pipe(csv()).on('data', (data) => results.push(data)).on('end', () => resolve(results)).on('error', (error) => reject(error));
  });
}
function streamToBuffer(streamValue) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        streamValue.on('data', (chunk) => chunks.push(chunk));
        streamValue.on('end', () => resolve(Buffer.concat(chunks)));
        streamValue.on('error', (err) => reject(err));
    });
}
async function parseExcelStream(fileStream) {
    const buffer = await streamToBuffer(fileStream);
    const workbook = XLSX.read(buffer);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    return XLSX.utils.sheet_to_json(worksheet);
}
async function saveDataToFirestore(db, collectionName, data) {
    const collectionRef = db.collection(collectionName);
    console.log(`Borrando datos antiguos de la colección: ${collectionName}...`);
    let snapshot;
    do {
        snapshot = await collectionRef.limit(500).get();
        if (snapshot.size > 0) {
            const batchDelete = db.batch();
            snapshot.docs.forEach(doc => batchDelete.delete(doc.ref));
            await batchDelete.commit();
        }
    } while (snapshot.size > 0);
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

async function performDriveSync(db) {
    try {
        console.log('Iniciando proceso de sincronización en segundo plano...');
        const drive = driveService.getDriveClient();
        const folderId = config.DRIVE_FOLDER_ID;

        const [sodcFile, bookingFile] = await Promise.all([
            driveService.findLatestFile(drive, folderId, config.SODC_FILE_PATTERN),
            driveService.findLatestFile(drive, folderId, config.BOOKING_FILE_PATTERN)
        ]);

        if (sodcFile) {
            console.log(`Descargando y procesando archivo SODC: ${sodcFile.name}`);
            const fileStream = await driveService.downloadFile(drive, sodcFile.id);
            const sodcData = await parseCsvStream(fileStream);
            await saveDataToFirestore(db, 'reportes_sodc_raw', sodcData);
            console.log(`Archivo ${sodcFile.name} procesado. Se guardaron ${sodcData.length} registros.`);
        } else {
            console.log('No se encontró archivo nuevo de SODC.');
        }

        if (bookingFile) {
            console.log(`Descargando y procesando archivo Booking: ${bookingFile.name}`);
            const fileStream = await driveService.downloadFile(drive, bookingFile.id);
            const bookingData = await parseExcelStream(fileStream);
            await saveDataToFirestore(db, 'reportes_booking_raw', bookingData);
            console.log(`Archivo ${bookingFile.name} procesado. Se guardaron ${bookingData.length} registros.`);
        } else {
            console.log('No se encontró archivo nuevo de Booking.');
        }
        console.log('--- Sincronización en segundo plano completada. ---');
    } catch (error) {
        console.error('Error fatal durante la sincronización en segundo plano:', error);
    }
}

module.exports = (db) => {
  router.post('/sincronizar-drive', (req, res) => {
    console.log('Solicitud recibida para sincronizar desde Google Drive...');

    res.status(202).json({ 
      message: 'El proceso de sincronización ha comenzado en segundo plano. Revisa los logs del servidor para ver el progreso.' 
    });

    performDriveSync(db);
  });

  return router;
};