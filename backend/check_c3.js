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
    console.log("Checking Cabaña 3...");
    const q = await db.collection('cabanas').where('nombre', '==', 'Cabaña 3').get();
    if (q.empty) {
        console.log("Cabaña 3 NOT FOUND");
    } else {
        const c = q.docs[0].data();
        console.log(`Cabaña 3 Capacity: ${c.capacidad}`);
    }
}
run();
