const admin = require('firebase-admin');
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

async function checkUser(email) {
    console.log(`Checking data for: ${email}`);
    try {
        // 1. Get UID
        const userRecord = await admin.auth().getUserByEmail(email);
        console.log(`Found UID: ${userRecord.uid}`);

        // 2. Check Households
        const householdsRef = db.collection('households');
        const snapshot = await householdsRef.get();

        const userHouseholds = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            const members = data.members || [];
            // Check if member exists (handle both string UIDs and object members if schema varies)
            const isMember = members.some(m => (typeof m === 'string' ? m === userRecord.uid : m.uid === userRecord.uid));

            if (isMember || data.ownerUid === userRecord.uid) {
                userHouseholds.push({ id: doc.id, ...data });
            }
        });

        if (userHouseholds.length > 0) {
            console.log(`User belongs to ${userHouseholds.length} household(s):`);
            userHouseholds.forEach(h => console.log(` - ${h.name} (ID: ${h.id})`));
        } else {
            console.log("WARNING: User does NOT belong to any household. They will see an empty vehicle list.");
        }

    } catch (error) {
        console.error("Error:", error.message);
    }
}

checkUser('pmezavergara@gmail.com');
