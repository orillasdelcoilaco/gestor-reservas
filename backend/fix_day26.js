const admin = require('firebase-admin');

// Initialize if not already
if (!admin.apps.length) {
    const serviceAccount = require('./coilacoapp-firebase-adminsdk-vwrgh-4e4dd2d5c1.json');
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function fixDay26() {
    console.log('🔧 Fixing day 26...');

    const startDate = new Date('2025-12-26T00:00:00Z');
    const endDate = new Date('2025-12-26T23:59:59Z');
    const start = admin.firestore.Timestamp.fromDate(startDate);
    const end = admin.firestore.Timestamp.fromDate(endDate);

    const snapshot = await db.collection('planAseo')
        .where('fecha', '>=', start)
        .where('fecha', '<=', end)
        .get();

    console.log(`Found ${snapshot.size} tasks for 2025-12-26`);

    if (snapshot.empty) {
        console.log('✅ No tasks to delete');
        process.exit(0);
    }

    const batch = db.batch();
    snapshot.forEach(doc => {
        const data = doc.data();
        console.log(`  Deleting: ${doc.id} - ${data.cabanaId} - ${data.tipoAseo} - origen:${data.origen || 'unknown'}`);
        batch.delete(doc.ref);
    });

    await batch.commit();
    console.log(`✅ Deleted ${snapshot.size} tasks from 2025-12-26`);
    console.log('Now regenerate the plan to see day 26 with full tasks!');
    process.exit(0);
}

fixDay26().catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
});
