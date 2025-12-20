const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();

async function check() {
    console.log("Checking reservations for 2025-12-18 to 2025-12-24...");
    const start = new Date('2025-12-18T00:00:00Z');
    const end = new Date('2025-12-24T23:59:59Z');

    // Check ALL reservations to be safe about query issues
    const snap = await db.collection('reservas').get();
    let count = 0;

    snap.forEach(doc => {
        const d = doc.data();
        // Handle Firestore Timestamp or Date
        const arr = d.fechaLlegada.toDate ? d.fechaLlegada.toDate() : new Date(d.fechaLlegada);
        const dep = d.fechaSalida.toDate ? d.fechaSalida.toDate() : new Date(d.fechaSalida);

        // Check overlap
        if (arr <= end && dep >= start) {
            console.log(`Found: ${d.alojamiento} | In: ${arr.toISOString()} | Out: ${dep.toISOString()}`);
            count++;
        }
    });
    if (count === 0) console.log("No reservations found in range.");
    else console.log(`Total overlapping: ${count}`);
}
check();
