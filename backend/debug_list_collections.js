const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();

async function check() {
    console.log("Listing collections...");
    const collections = await db.listCollections();
    for (const col of collections) {
        console.log(`- ${col.id}`);
        const snap = await col.limit(1).get();
        if (!snap.empty) {
            console.log(`  Sample doc keys: ${Object.keys(snap.docs[0].data()).join(', ')}`);
            if (col.id === 'componentes' || col.id === 'propiedades') {
                console.log(`  Sample data:`, JSON.stringify(snap.docs[0].data(), null, 2));
            }
        }
    }
}
check();
