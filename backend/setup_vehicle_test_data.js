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

const USERS_TO_CREATE = [
    { email: 'pmezavergara@gmail.com', name: 'Patricio Meza' },
    { email: 'marcelomeza68@gmail.com', name: 'Marcelo Meza' },
    { email: 'hmmezam@hotmail.com', name: 'HM Meza' }
];

const DEFAULT_PASSWORD = 'perfil4422';
const HOUSEHOLD_NAME = 'Familia Meza (Test)';

async function setup() {
    console.log('--- Setting up Vehicle Module Test Data (Multi-User) ---');
    try {
        const userUids = [];

        // 1. Create Users
        for (const user of USERS_TO_CREATE) {
            try {
                let uid;
                try {
                    const userRecord = await auth.getUserByEmail(user.email);
                    console.log(`User ${user.email} already exists (UID: ${userRecord.uid})`);
                    uid = userRecord.uid;
                } catch (error) {
                    if (error.code === 'auth/user-not-found') {
                        console.log(`Creating user ${user.email}...`);
                        const userRecord = await auth.createUser({
                            email: user.email,
                            emailVerified: true,
                            password: DEFAULT_PASSWORD,
                            displayName: user.name,
                            disabled: false
                        });
                        console.log(`User created successfully (UID: ${userRecord.uid})`);
                        uid = userRecord.uid;
                    } else {
                        throw error;
                    }
                }
                userUids.push({ uid, email: user.email, role: 'admin' }); // Making everyone admin for test simplicity
            } catch (err) {
                console.error(`Failed to process user ${user.email}:`, err.message);
            }
        }

        if (userUids.length === 0) {
            console.error("No users were processed successfully.");
            return;
        }

        // 2. data preparation for members
        // The schema expected by backend/frontend might be array of objects or just UIDs. 
        // Based on previous reads, it seemed checks were done on `members` array.
        // Let's store objects { uid, role, joinedAt } which is a common pattern.
        const membersData = userUids.map(u => ({
            uid: u.uid,
            role: 'admin',
            joinedAt: new Date()
        }));

        // Owner is the first user
        const ownerUid = userUids[0].uid;

        // 3. Create or Update Household
        const householdsRef = db.collection('households');
        // Check if owner has a household named specifically this
        const snapshot = await householdsRef.where('ownerUid', '==', ownerUid).get();

        let householdId;
        let existingDoc = null;

        snapshot.forEach(doc => {
            if (doc.data().name === HOUSEHOLD_NAME) {
                existingDoc = doc;
            }
        });

        if (existingDoc) {
            console.log(`Updating existing household: "${HOUSEHOLD_NAME}" (ID: ${existingDoc.id})...`);
            // Update members
            await householdsRef.doc(existingDoc.id).update({
                members: membersData
            });
            householdId = existingDoc.id;
            console.log("Members updated.");
        } else {
            console.log(`Creating new household: "${HOUSEHOLD_NAME}"...`);
            const newHouse = await householdsRef.add({
                name: HOUSEHOLD_NAME,
                ownerUid: ownerUid,
                members: membersData,
                createdAt: new Date()
            });
            console.log(`Household created (ID: ${newHouse.id})`);
            householdId = newHouse.id;
        }

        console.log('\n--- SETUP COMPLETE ---');
        console.log(`Household:  ${HOUSEHOLD_NAME}`);
        console.log('Users added:');
        USERS_TO_CREATE.forEach(u => console.log(` - ${u.email} (Pass: ${DEFAULT_PASSWORD})`));
        console.log('\nYou can now login with ANY of these users at /vehiculos/app');

    } catch (error) {
        console.error('Setup failed:', error);
    }
}

setup();
