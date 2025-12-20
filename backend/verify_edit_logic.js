const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();

async function runTest() {
    console.log('🧪 Starting Edit Logic Verification...');

    // 1. Setup Test Data (Use a far future date to avoid messing up current view)
    const testDate = new Date('2030-01-01T12:00:00Z');
    const start = admin.firestore.Timestamp.fromDate(new Date('2030-01-01T00:00:00Z'));
    const end = admin.firestore.Timestamp.fromDate(new Date('2030-01-01T23:59:59Z'));

    const docRef1 = db.collection('planAseo').doc('TEST_TASK_STRING');
    const docRef2 = db.collection('planAseo').doc('TEST_TASK_NUMBER');
    const docRef3 = db.collection('planAseo').doc('TEST_TASK_OTHER');

    console.log('📝 Creating dummy tasks...');
    await docRef1.set({
        cabanaId: 'Cabaña 8', // String format
        tipoAseo: 'TEST_STR',
        fecha: start,
        origen: 'manual'
    });

    await docRef2.set({
        cabanaId: 8, // Number format (just in case)
        tipoAseo: 'TEST_NUM',
        fecha: start,
        origen: 'manual'
    });

    await docRef3.set({
        cabanaId: 'Cabaña 2', // Different cabin
        tipoAseo: 'TEST_OTHER',
        fecha: start,
        origen: 'manual'
    });

    // 2. Simulate Edit logic for 'Cabaña 8' (String)
    console.log('\n🔍 TEST 1: Query for "Cabaña 8" (String)');
    let snapshot = await db.collection('planAseo')
        .where('fecha', '>=', start)
        .where('fecha', '<=', end)
        .where('cabanaId', '==', 'Cabaña 8')
        .get();

    console.log(`Found ${snapshot.size} tasks.`);
    snapshot.forEach(doc => console.log(`   [MATCH] ${doc.id} -> Cab:${doc.data().cabanaId} (Type: ${typeof doc.data().cabanaId})`));

    // 3. Simulate Edit logic for 8 (Number)
    console.log('\n🔍 TEST 2: Query for 8 (Number)');
    snapshot = await db.collection('planAseo')
        .where('fecha', '>=', start)
        .where('fecha', '<=', end)
        .where('cabanaId', '==', 8)
        .get();

    console.log(`Found ${snapshot.size} tasks.`);
    snapshot.forEach(doc => console.log(`   [MATCH] ${doc.id} -> Cab:${doc.data().cabanaId} (Type: ${typeof doc.data().cabanaId})`));

    // 4. Cleanup
    console.log('\n🧹 Cleaning up...');
    await docRef1.delete();
    await docRef2.delete();
    await docRef3.delete();
    console.log('✅ verification complete');
    process.exit(0);
}

runTest().catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
});
