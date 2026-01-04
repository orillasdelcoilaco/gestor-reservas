const admin = require('firebase-admin');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../backend/.env') });

// Init Firebase
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();

async function listWorkers() {
    console.log('--- Workers List ---');
    const snap = await db.collection('trabajadores').get();
    snap.forEach(doc => {
        const d = doc.data();
        console.log(`ID: ${doc.id} | Name: ${d.nombre} ${d.apellido} | Tel: ${d.telefono} | Telegram: ${d.telegramChatId || 'N/A'}`);
    });
    console.log('--------------------');
}

listWorkers().catch(console.error);
