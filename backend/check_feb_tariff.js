const admin = require('firebase-admin');
if (admin.apps.length === 0) {
    const serviceAccount = require('./serviceAccountKey.json');
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: 'reservas-sodc'
    });
}
const db = admin.firestore();

async function checkFeb() {
    console.log("Checking Tariffs for FEB 2025 (2025-02-01 to 2025-02-28)...");
    const names = ['Cabaña 8', 'Cabaña 3'];
    const startFeb = new Date('2025-02-01T00:00:00Z');
    const endFeb = new Date('2025-02-28T23:59:59Z');

    for (const name of names) {
        console.log(`\n--- ${name} ---`);
        const snapshot = await db.collection('tarifas').where('nombreCabaña', '==', name).get();
        let found = false;
        snapshot.forEach(doc => {
            const t = doc.data();
            const tStart = t.fechaInicio.toDate();
            const tEnd = t.fechaTermino.toDate();

            // Check overlap
            if (tStart <= endFeb && tEnd >= startFeb) {
                console.log(`FOUND: ${tStart.toISOString().split('T')[0]} to ${tEnd.toISOString().split('T')[0]} | $${t.tarifasPorCanal?.SODC?.valor}`);
                found = true;
            }
        });
        if (!found) console.log("NO TARIFF FOUND for Feb 2025.");
    }
}
checkFeb();
