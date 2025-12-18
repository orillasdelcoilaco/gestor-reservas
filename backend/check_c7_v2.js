const admin = require('firebase-admin');

if (admin.apps.length === 0) {
    const serviceAccount = require('./serviceAccountKey.json');
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: 'reservas-sodc'
    });
}
const db = admin.firestore();

async function run() {
    console.log("Checking Cabaña 7 (Simplified)...");

    // 1. Capacity
    let c7 = null;
    const q = await db.collection('cabanas').where('nombre', '==', 'Cabaña 7').get();
    if (q.empty) {
        console.log("Cabaña 7 NOT FOUND by name.");
        return;
    }
    c7 = q.docs[0].data();
    console.log(`Capacity: ${c7.capacidad}`);
    console.log(`Status: ${c7.estado || 'Activa'}`);

    // 2. Reservations
    console.log("Reservations Intersection Feb 7-19:");
    const start = new Date('2025-02-07T00:00:00Z');
    const end = new Date('2025-02-19T00:00:00Z');

    const resSnap = await db.collection('reservas')
        .where('alojamiento', '==', 'Cabaña 7')
        .get();

    let occupied = false;
    resSnap.forEach(r => {
        const d = r.data();
        const rStart = d.fechaLlegada.toDate();
        const rEnd = d.fechaSalida.toDate();

        if (rStart < end && rEnd > start && d.estado !== 'Cancelada') {
            console.log(`  > OCCUPIED: ${rStart.toISOString().slice(0, 10)} to ${rEnd.toISOString().slice(0, 10)} (${d.estado})`);
            occupied = true;
        }
    });
    if (!occupied) console.log("  > NO RESERVATIONS found.");

    // 3. Tariffs
    console.log("Tariffs Intersection Feb 7-19:");
    const tSnap = await db.collection('tarifas').where('nombreCabaña', '==', 'Cabaña 7').get();
    let count = 0;
    tSnap.forEach(t => {
        const d = t.data();
        const tStart = d.fechaInicio.toDate();
        const tEnd = d.fechaTermino.toDate();

        // Log all tariffs to debug the sorting/filtering
        // console.log(`    Checking tariff: ${tStart.toISOString().slice(0,10)} to ${tEnd.toISOString().slice(0,10)}`);

        if (tStart <= end && tEnd >= start) {
            console.log(`  > FOUND: ${tStart.toISOString().slice(0, 10)} to ${tEnd.toISOString().slice(0, 10)} | $${d.tarifasPorCanal?.SODC?.valor}`);
            count++;
        }
    });

    if (count === 0) console.log("  > NO TARIFFS FOUND covering Feb 7-19.");
}
run();
