const admin = require('firebase-admin');
const path = require('path');
const serviceAccount = require('./serviceAccountKey.json');
const { generarPropuestaRango } = require('./services/planificadorService');

// Init Firebase
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();

async function runTest() {
    console.log("=== STARTING TEST ===");
    try {
        const startDate = '2025-12-26';
        const endDate = '2025-12-26';

        console.log(`Generating plan for ${startDate} to ${endDate}...`);

        const result = await generarPropuestaRango(db, startDate, endDate);

        console.log("\n=== RESULT ===");
        console.log("Dias Result Length:", result.dias.length);

        if (result.dias.length > 0) {
            const dia = result.dias[0];
            console.log("Fecha:", dia.fecha);
            console.log("Tareas Count:", dia.propuesta.length);
            console.log("Tareas Details:", dia.propuesta.map(t => `${t.cabanaId}: ${t.tipoAseo} (${t.weight})`).join(', '));
            console.log("Alertas:", JSON.stringify(dia.alertas, null, 2));
        } else {
            console.log("NO DAYS GENERATED!");
        }

    } catch (error) {
        console.error("TEST FAILED:", error);
    }
    console.log("=== END TEST ===");
    process.exit(0);
}

runTest();
