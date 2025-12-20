const admin = require('firebase-admin');
const path = require('path');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkStatuses() {
    console.log('Fetching unique statuses...');
    const snapshot = await db.collection('reservas').get();
    const statuses = new Set();
    const statusCounts = {};

    snapshot.forEach(doc => {
        const data = doc.data();
        const status = data.estado;
        statuses.add(status);
        statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    console.log('Unique Statuses:', Array.from(statuses));
    console.log('Counts:', statusCounts);
}

checkStatuses();
