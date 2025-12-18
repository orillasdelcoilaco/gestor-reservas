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
    console.log("Checking Cabaña 7...");

    // 1. Capacity
    let c7 = null;
    const q = await db.collection('cabanas').where('nombre', '==', 'Cabaña 7').get();
    if (q.empty) {
        // Try getting by ID if name match fails
        const doc = await db.collection('cabanas').doc('Cabaña 7').get();
        if (doc.exists) c7 = doc.data();
    } else {
        c7 = q.docs[0].data();
    }

    if (!c7) {
        console.log("Cabaña 7 NOT FOUND");
        return;
    }
    console.log(`Capacity: ${c7.capacidad}`);
    console.log(`Status: ${c7.estado || 'Activa'}`);

    // 2. Reservations Feb 7-19
    console.log("Reservations Feb 7-19:");
    const start = new Date('2025-02-07T00:00:00Z');
    const end = new Date('2025-02-19T00:00:00Z');

    const resSnap = await db.collection('reservas')
        .where('alojamiento', '==', 'Cabaña 7')
        .where('fechaLlegada', '>=', admin.firestore.Timestamp.fromDate(new Date('2025-02-01')))
        .get();

    let occupied = false;
    resSnap.forEach(r => {
        const d = r.data();
        const rStart = d.fechaLlegada.toDate();
        const rEnd = d.fechaSalida.toDate();
        if (rStart < end && rEnd > start) {
            console.log(`  > OCCUPIED: ${rStart.toISOString().split('T')[0]} to ${rEnd.toISOString().split('T')[0]} (${d.estado})`);
            occupied = true;
        }
    });
    if (!occupied) console.log("  > No conflicting reservations.");

    // 3. Tariffs
    console.log("Tariffs:");
    const tSnap = await db.collection('tarifas').where('nombreCabaña', '==', 'Cabaña 7').get();
    let hasTariff = false;
    tSnap.forEach(t => {
        const d = t.data();
        const tStart = d.fechaInicio.toDate();
        const tEnd = d.fechaTermino.toDate();
        if (tStart <= end && tEnd >= start) {
            console.log(`  > FOUND: ${tStart.toISOString().split('T')[0]} to ${tEnd.toISOString().split('T')[0]} | $${d.tarifasPorCanal?.SODC?.valor}`);
            hasTariff = true;
        }
    });
    if (!hasTariff) console.log("  > NO TARIFF covering this period.");
}
run();
