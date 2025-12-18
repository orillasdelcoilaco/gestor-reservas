const admin = require('firebase-admin');

// Ensure clean init
if (admin.apps.length === 0) {
    const serviceAccount = require('./serviceAccountKey.json');
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: 'reservas-sodc'
    });
}

const db = admin.firestore();

async function run() {
    try {
        const names = ['Cabaña 8', 'Cabaña 3'];
        console.log("Starting Debug...");

        for (const name of names) {
            console.log(`\n--- ${name} ---`);
            const q = await db.collection('cabanas').where('nombre', '==', name).get();

            if (q.empty) {
                console.log("NOT FOUND in 'cabanas' collection by name.");
                continue;
            }

            const cabana = q.docs[0].data();
            console.log(`Capacity: ${cabana.capacidad}`);
            console.log(`State: ${cabana.estado || 'Activa'}`);

            // Tariffs
            const tSnap = await db.collection('tarifas').where('nombreCabaña', '==', name).get();
            console.log(`Tariffs found: ${tSnap.size}`);
            tSnap.forEach(t => {
                const data = t.data();
                const start = data.fechaInicio.toDate().toISOString().split('T')[0];
                const end = data.fechaTermino.toDate().toISOString().split('T')[0];
                console.log(`  > ${start} to ${end} | Price: ${data.tarifasPorCanal?.SODC?.valor}`);
            });
        }
    } catch (e) {
        console.error("ERROR:", e);
    }
}

run();
