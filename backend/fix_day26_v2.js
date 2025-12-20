const admin = require('firebase-admin');

// Adjust path to your service account key
const serviceAccount = require('./serviceAccountKey.json');

// Initialize Firebase
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function fixDay26() {
    console.log('🔧 Fixing day 26...');

    // Create Date objects for the start and end of the day in UTC
    // Note: The app seems to use UTC internally or handles dates as strings in some places, 
    // but here we use the exact range for 2025-12-26 based on previous logs
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
