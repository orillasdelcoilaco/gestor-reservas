const admin = require('firebase-admin');
const serviceAccount = require('./coilacoapp-firebase-adminsdk-vwrgh-4e4dd2d5c1.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function clearDay26() {
    const fecha = new Date('2025-12-26T00:00:00Z');
    const start = admin.firestore.Timestamp.fromDate(fecha);
    const end = admin.firestore.Timestamp.fromDate(new Date('2025-12-26T23:59:59Z'));

    const snapshot = await db.collection('planAseo')
        .where('fecha', '>=', start)
        .where('fecha', '<=', end)
        .get();

    console.log(`Found ${snapshot.size} tasks for 2025-12-26`);

    const batch = db.batch();
    snapshot.forEach(doc => {
        console.log(`  Deleting: ${doc.id} - ${doc.data().cabanaId} - ${doc.data().tipoAseo}`);
        batch.delete(doc.ref);
    });

    await batch.commit();
    console.log('✅ Deleted all tasks for 2025-12-26');
    process.exit(0);
}

clearDay26().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
