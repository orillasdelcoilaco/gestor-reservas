// backend/tests/historyTest.js
const admin = require('firebase-admin');
const historyService = require('../services/historyService');
const serviceAccount = require('../serviceAccountKey.json');

// --- 0. INIT ---
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: 'reservas-sodc'
    });
}
const db = admin.firestore();

async function runHistoryTest() {
    console.log('>>> INICIANDO TEST DE HISTORIAL (SERVICES JOIN) <<<\n');

    try {
        // --- 1. Crear Datos de Prueba ---
        console.log('--- Creando datos de prueba (Tarea finalizada + Incidencia) ---');

        // Incidencia reciente (hace 1 hora)
        const incRef = await db.collection('incidencias').add({
            cabanaId: 'HistoryTestCab',
            espacio: 'Baño Test',
            descripcion: 'Incidencia Histórica Test',
            prioridad: 'NORMAL',
            estado: 'RESUELTA',
            fechaReporte: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 3600000)),
            reportadoPor: { nombre: 'Tester' }
        });

        // Tarea reciente (hace 2 horas)
        const taskRef = await db.collection('planAseo').add({
            cabanaId: 'HistoryTestCab',
            tipoAseo: 'Salida',
            estado: 'FINALIZADO',
            fecha: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 7200000)),
            completedAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 7200000)),
            asignadoA: 'Tester Worker'
        });

        console.log('Datos creados. Consultando servicio...');

        // --- 2. Consultar Historial ---
        const filters = {
            cabanaId: 'HistoryTestCab'
        };
        const events = await historyService.getHistory(db, filters);

        console.log(`\nEventos encontrados: ${events.length}`);
        events.forEach(ev => {
            console.log(`[${ev.type}] ${new Date(ev.date.toDate()).toLocaleTimeString()} - ${ev.details}`);
        });

        if (events.length >= 2) {
            console.log('\n[PASSED] Se recuperaron eventos mezclados de Incidencias y Tareas.');
        } else {
            console.error('\n[FAILED] No se recuperaron todos los eventos esperados.');
        }

        // --- Cleanup ---
        await incRef.delete();
        await taskRef.delete();
        console.log('Datos de prueba eliminados.');

    } catch (error) {
        console.error('Error en test:', error);
    }
}

runHistoryTest();
