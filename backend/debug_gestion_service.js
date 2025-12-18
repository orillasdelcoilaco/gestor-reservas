const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');
const { getReservasPendientes } = require('./services/gestionService');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();

async function run() {
    try {
        console.log("Fetching pending reservations...");
        const reservas = await getReservasPendientes(db);

        const target = reservas.find(r => r.reservaIdOriginal == '6502413786');

        if (target) {
            console.log(JSON.stringify(target, null, 2));
        } else {
            console.log('Target reservation not found in pending list.');
        }

    } catch (error) {
        console.error("Error:", error);
    }
}

run();
