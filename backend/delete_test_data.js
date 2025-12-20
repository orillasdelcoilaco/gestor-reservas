const admin = require('firebase-admin');

// Init Firebase
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

async function cleanData() {
    console.log("Searching for test data...");

    // 1. Delete Workers with 'test' in name
    const workersParams = ['test', 'prueba'];
    for (const term of workersParams) {
        const snapshot = await db.collection('trabajadores').get();
        snapshot.forEach(doc => {
            const data = doc.data();
            const fullName = `${data.nombre} ${data.apellido}`.toLowerCase();
            if (fullName.includes(term)) {
                console.log(`Deleting Worker: ${fullName} (${doc.id})`);
                db.collection('trabajadores').doc(doc.id).delete();
            }
        });
    }

    // 2. Delete Reservations with 'test' in accommodation name or client name
    const resSnapshot = await db.collection('reservas').get();
    resSnapshot.forEach(doc => {
        const data = doc.data();
        const accommodation = (data.alojamiento || '').toLowerCase();
        const client = (data.cliente || '').toLowerCase(); // Assuming there's a client name stored or linked

        if (accommodation.includes('test') || client.includes('test')) {
            console.log(`Deleting Reservation: ${data.alojamiento} - ${doc.id}`);
            db.collection('reservas').doc(doc.id).delete();
        }
    });

    // 3. Delete PlanAseo entries related to 'test'
    const planSnapshot = await db.collection('planAseo').get();
    planSnapshot.forEach(doc => {
        const data = doc.data();
        if ((data.cabanaId || '').toLowerCase().includes('test')) {
            console.log(`Deleting Plan Task: ${data.cabanaId} (${doc.id})`);
            db.collection('planAseo').doc(doc.id).delete();
        }
    });
}

cleanData();
