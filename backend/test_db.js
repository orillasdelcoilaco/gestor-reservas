const admin = require('firebase-admin');
try {
    const serviceAccount = require('./serviceAccountKey.json');
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: 'reservas-sodc'
    });
    const db = admin.firestore();
    console.log("Attempting to read 'cabanas'...");
    db.collection('cabanas').get()
        .then(snapshot => {
            console.log("Success! Cabanas count:", snapshot.size);
            process.exit(0);
        })
        .catch(error => {
            console.error("DB Error:", error.message);
            process.exit(1);
        });
} catch (e) {
    console.error("Setup Error:", e.message);
}
