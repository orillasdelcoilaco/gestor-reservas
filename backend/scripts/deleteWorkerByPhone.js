const admin = require('firebase-admin');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');

const serviceAccount = require('../serviceAccountKey.json');

initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = getFirestore();

async function listAndFind() {
    console.log('Listing all workers to find target...');
    const all = await db.collection('trabajadores').get();
    all.docs.forEach(doc => {
        const d = doc.data();
        console.log(`[${doc.id}] ${d.nombre} ${d.apellido} | Phone: "${d.telefono}" | Activo: ${d.activo}`);

        // Fuzzy check
        const phoneClean = (d.telefono || '').replace(/\s+/g, '').replace('+', '');
        const targetClean = '56955324228';

        if (phoneClean.includes(targetClean)) {
            console.log(`MATCH FOUND! Deleting ID: ${doc.id}`);
            db.collection('trabajadores').doc(doc.id).update({ activo: false })
                .then(() => console.log('Deleted successfully.'))
                .catch(e => console.error('Delete failed:', e));
        }
    });
}

listAndFind().catch(console.error);
