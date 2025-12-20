const admin = require('firebase-admin');
const { generatingPropuestaRango, generarPropuestaRango } = require('./services/planificadorService');
const path = require('path');

// Init Firebase
const serviceAccount = require('./serviceAccountKey.json');
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();

async function run() {
    try {
        console.log('Testing generation for: 2025-12-26 to 2026-02-01');
        const start = '2025-12-26';
        const end = '2026-02-01';

        // Run the service
        const result = await generarPropuestaRango(db, start, end);

        console.log('Generation finished. Result keys:', Object.keys(result));
        console.log('Total days:', result.dias.length);

        // Test serialization
        console.log('Attempting JSON.stringify...');
        const json = JSON.stringify(result);
        console.log('Serialization SUCCESS.');
        console.log('JSON Length:', json.length);

        process.exit(0);
    } catch (error) {
        console.error('ERROR during verification:', error);
        process.exit(1);
    }
}

run();
