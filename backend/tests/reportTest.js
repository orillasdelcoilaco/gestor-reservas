// backend/tests/reportTest.js
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const reportService = require('../services/reportService');
const serviceAccount = require('../serviceAccountKey.json');

// --- INIT ---
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: 'reservas-sodc'
    });
}
const db = admin.firestore();

async function runReportTest() {
    console.log('>>> INICIANDO TEST DE GENERACIÓN DE REPORTE PDF <<<\n');

    try {
        const filters = {
            startDate: '2025-01-01', // Example dates
            endDate: '2025-12-31',
            // cabanaId: 'Cabaña 10' // Optional
        };

        const outputPath = path.join(__dirname, 'test_report.pdf');

        // Mock Response Stream
        const writeStream = fs.createWriteStream(outputPath);

        // Mock Data to bypass Firestore Indexes
        const mockEvents = [
            { type: 'TAREA', subType: 'FINALIZADO', metadata: { peso: 2.5 }, cabanaId: 'Cabaña 1' },
            { type: 'TAREA', subType: 'FINALIZADO', metadata: { peso: 1.5 }, cabanaId: 'Cabaña 2' },
            { type: 'INCIDENCIA', cabanaId: 'Cabaña 10', espacio: 'Cocina' }
        ];

        console.log('Generando PDF con datos mock...');
        await reportService.generateDailyReport(db, filters, writeStream, mockEvents);

        // Wait for stream to finish
        writeStream.on('finish', () => {
            console.log(`\nPDF generado exitosamente en: ${outputPath}`);

            // Validate file size
            const stats = fs.statSync(outputPath);
            console.log(`Tamaño del archivo: ${stats.size} bytes`);

            if (stats.size > 1000) {
                console.log('[PASSED] El PDF tiene un tamaño razonable.');
            } else {
                console.error('[FAILED] El archivo PDF parece estar vacío o corrupto.');
                process.exit(1);
            }
            process.exit(0);
        });

        writeStream.on('error', (err) => {
            console.error('[FAILED] Error escribiendo archivo:', err);
            process.exit(1);
        });

    } catch (error) {
        console.error('Error en test:', error);
        process.exit(1);
    }
}

runReportTest();
