
const admin = require('firebase-admin');
require('dotenv').config();

// Initialize Firebase Admin (reusing logic from index.js or just standard init)
const serviceAccount = process.env.RENDER
    ? require('/etc/secrets/serviceAccountKey.json')
    : require('../serviceAccountKey.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: 'reservas-sodc'
    });
}

const db = admin.firestore();
const auth = admin.auth();

const USERS_TO_SEED = [
    {
        email: 'admin@orillasdelcoilaco.cl',
        allowedApps: ['gestor_reservas'],
        defaultApp: 'gestor_reservas',
        required: true // Must exist
    },
    {
        email: 'pmezavergara@gmail.com',
        allowedApps: ['vehicle_docs'],
        defaultApp: 'vehicle_docs',
        required: false
    },
    {
        email: 'marcelomeza68@gmail.com',
        allowedApps: ['vehicle_docs'],
        defaultApp: 'vehicle_docs',
        required: false
    },
    {
        email: 'hmmezam@hotmail.com',
        allowedApps: ['vehicle_docs'],
        defaultApp: 'vehicle_docs',
        required: false
    }
];

async function seedUserAccess() {
    console.log('--- Starting User Access Seeding ---');

    for (const userConfig of USERS_TO_SEED) {
        try {
            console.log(`Processing ${userConfig.email}...`);

            // 1. Resolve UID from Email
            let userRecord;
            try {
                userRecord = await auth.getUserByEmail(userConfig.email);
            } catch (error) {
                if (error.code === 'auth/user-not-found') {
                    console.warn(`User ${userConfig.email} not found in Auth. Skipping.`);
                    continue;
                }
                throw error;
            }

            const uid = userRecord.uid;
            const ref = db.collection('user_access').doc(uid);
            const snapshot = await ref.get();

            if (snapshot.exists) {
                console.log(`[SKIP] Access config already exists for ${userConfig.email} (${uid})`);

                // Optional: Update email if it changed (unlikely for existing auth users but good for consistency)
                await ref.update({ email: userConfig.email });
            } else {
                console.log(`[CREATE] Creating access config for ${userConfig.email} (${uid})`);
                await ref.set({
                    uid: uid,
                    email: userConfig.email,
                    allowedApps: userConfig.allowedApps,
                    defaultApp: userConfig.defaultApp,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });
            }

        } catch (err) {
            console.error(`Error processing ${userConfig.email}:`, err.message);
            if (userConfig.required) process.exit(1);
        }
    }

    console.log('--- Seeding Completed ---');
    process.exit(0);
}

seedUserAccess();
