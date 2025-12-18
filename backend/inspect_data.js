const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: 'reservas-sodc'
});

const db = admin.firestore();

async function run() {
    console.log("Inspecting Tariffs...");
    const tarifasSnap = await db.collection('tarifas').get();
    tarifasSnap.forEach(doc => {
        const t = doc.data();
        const start = t.fechaInicio.toDate();
        const end = t.fechaTermino.toDate();
        // Check overlap with Feb 2025
        if (end >= new Date('2025-02-01') && start <= new Date('2025-02-28')) {
            console.log(`Tariff: ${t.nombreCabaña} | ${start.toISOString().split('T')[0]} to ${end.toISOString().split('T')[0]}`);
        }
    });

    console.log("\nInspecting Reservations...");
    const resSnap = await db.collection('reservas')
        .where('fechaLlegada', '>=', admin.firestore.Timestamp.fromDate(new Date('2025-01-01')))
        .get();

    resSnap.forEach(doc => {
        const r = doc.data();
        const start = r.fechaLlegada.toDate();
        const end = r.fechaSalida.toDate();
        if (end >= new Date('2025-02-01') && start <= new Date('2025-02-28')) {
            console.log(`Res: ${r.alojamiento} | ${start.toISOString().split('T')[0]} to ${end.toISOString().split('T')[0]} | ${r.estado}`);
        }
    });
}

run();
