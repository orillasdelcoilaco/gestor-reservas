const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();

async function run() {
    try {
        const id = '6502413786'; // From previous log
        console.log(`Inspecting reservation group: ${id}`);
        // The service finds by 'reservaIdOriginal'.
        const snapshot = await db.collection('reservas').where('reservaIdOriginal', '==', id).get();

        if (snapshot.empty) {
            console.log("No docs found.");
        } else {
            snapshot.forEach(doc => {
                const d = doc.data();
                console.log('Doc ID:', doc.id);
                console.log('canal:', d.canal, typeof d.canal);
                console.log('monedaOriginal:', d.monedaOriginal, typeof d.monedaOriginal);
                console.log('valorOriginal:', d.valorOriginal);
                console.log('valorFinalUSD:', d.valorFinalUSD);
                console.log('valorDolarDia:', d.valorDolarDia);
            });
        }

    } catch (error) {
        console.error("Error:", error);
    }
}

run();
