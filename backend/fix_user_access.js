const admin = require('firebase-admin');

// 1. Initialize Firebase Admin
const serviceAccount = process.env.RENDER
    ? require('/etc/secrets/serviceAccountKey.json')
    : require('./serviceAccountKey.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: 'reservas-sodc'
    });
}

const db = admin.firestore();
const auth = admin.auth();

const EMAILS = [
    'pmezavergara@gmail.com',
    'marcelomeza68@gmail.com',
    'hmmezam@hotmail.com'
];

async function fixAccess() {
    console.log('--- Granting Vehicle App Access ---');

    for (const email of EMAILS) {
        try {
            const user = await auth.getUserByEmail(email);
            const uid = user.uid;

            console.log(`Updating access for ${email} (${uid})...`);

            await db.collection('user_access').doc(uid).set({
                allowedApps: ['vehicle_docs'],
                defaultApp: 'vehicle_docs',
                role: 'user', // or admin if needed generally
                updatedAt: new Date()
            }, { merge: true });

            console.log(' -> OK');

        } catch (error) {
            console.error(`Error for ${email}:`, error.message);
        }
    }
}

fixAccess();
