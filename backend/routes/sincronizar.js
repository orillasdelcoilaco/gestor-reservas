// backend/routes/sincronizar.js - CÓDIGO ACTUALIZADO

const express = require('express');
const router = express.Router();
const driveService = require('../services/driveService');
const config = require('../config');
const csv = require('csv-parser');
const XLSX = require('xlsx');

// --- Las funciones de ayuda no cambian ---
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
// --- Fin de las funciones de ayuda ---


async function performDriveSync(db) {
    console.log('[Sincronización] La función performDriveSync ha comenzado.');
    const summary = {
        sodc: { file: 'No encontrado', records: 0 },
        booking: { file: 'No encontrado', records: 0 },
        airbnb: { file: 'No encontrado', records: 0 }
    };

    try {
        console.log('Iniciando proceso de sincronización...');
        const drive = driveService.getDriveClient();
        console.log('[Sincronización] Cliente de Google Drive inicializado.');
        
        const folderId = config.DRIVE_FOLDER_ID;

        const [sodcFile, bookingFile, airbnbFile] = await Promise.all([
            driveService.findLatestFile(drive, folderId, config.SODC_FILE_PATTERN),
            driveService.findLatestFile(drive, folderId, config.BOOKING_FILE_PATTERN),
            driveService.findLatestFile(drive, folderId, config.AIRBNB_FILE_PATTERN)
        ]);
        
        console.log('[Sincronización] Búsqueda de archivos completada.');

        if (sodcFile) {
            console.log(`Descargando y procesando archivo SODC: ${sodcFile.name}`);
            const fileStream = await driveService.downloadFile(drive, sodcFile.id);
            const sodcData = await parseCsvStream(fileStream);
            await saveDataToFirestore(db, 'reportes_sodc_raw', sodcData);
            summary.sodc = { file: sodcFile.name, records: sodcData.length };
            console.log(`Archivo ${sodcFile.name} procesado. Se guardaron ${sodcData.length} registros.`);
        }

        if (bookingFile) {
            console.log(`Descargando y procesando archivo Booking: ${bookingFile.name}`);
            const fileStream = await driveService.downloadFile(drive, bookingFile.id);
            const bookingData = await parseExcelStream(fileStream);
            await saveDataToFirestore(db, 'reportes_booking_raw', bookingData);
            summary.booking = { file: bookingFile.name, records: bookingData.length };
            console.log(`Archivo ${bookingFile.name} procesado. Se guardaron ${bookingData.length} registros.`);
        }

        if (airbnbFile) {
            console.log(`Descargando y procesando archivo Airbnb: ${airbnbFile.name}`);
            const fileStream = await driveService.downloadFile(drive, airbnbFile.id);
            const airbnbData = await parseCsvStream(fileStream);
            await saveDataToFirestore(db, 'reportes_airbnb_raw', airbnbData);
            summary.airbnb = { file: airbnbFile.name, records: airbnbData.length };
            console.log(`Archivo ${airbnbFile.name} procesado. Se guardaron ${airbnbData.length} registros.`);
        }

        console.log('--- Sincronización completada. ---');
        return summary;
    } catch (error) {
        console.error('Error fatal durante la sincronización:', error);
        throw error;
    }
}

module.exports = (db) => {
    router.post('/sincronizar-drive', async (req, res) => {
        console.log('Solicitud recibida para sincronizar desde Google Drive...');
        try {
            const summary = await performDriveSync(db);
            res.status(200).json({
                message: 'Proceso de sincronización finalizado.',
                summary: summary
            });
        } catch (error) {
            console.error('[DIAGNÓSTICO] Error en la ruta /sincronizar-drive:', error);
            res.status(500).json({ error: 'Falló el proceso de sincronización.', message: error.message });
        }
    });

    return router;
};