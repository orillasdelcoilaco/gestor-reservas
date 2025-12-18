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
        const id = '6581954511';
        console.log(`Inspecting reservation: ${id}`);
        const snapshot = await db.collection('reservas').where('reservaIdOriginal', '==', id).get();

        if (snapshot.empty) {
            console.log("No docs found.");
        } else {
            snapshot.forEach(doc => {
                const d = doc.data();
                console.log('--- Document ---');
                console.log('Doc ID:', doc.id);
                console.log('canal:', `'${d.canal}'`); // Quotes to reveal whitespace
                console.log('monedaOriginal:', `'${d.monedaOriginal}'`);
                console.log('valorOriginal:', d.valorOriginal);
                console.log('valorFinalUSD:', d.valorFinalUSD);
                console.log('valorDolarDia:', d.valorDolarDia);
                // Check logic conditions directly
                console.log('Is Booking?', d.canal === 'Booking');
                console.log('Is USD?', d.monedaOriginal === 'USD');
            });
        }

    } catch (error) {
        console.error("Error:", error);
    }
}

run();
