const admin = require('firebase-admin');
const path = require('path');
require('dotenv').config();

console.log('Checking env vars...');
console.log('TELEGRAM_TOKEN present:', !!process.env.TELEGRAM_TOKEN);
console.log('FIREBASE_SERVICE_ACCOUNT present:', !!process.env.FIREBASE_SERVICE_ACCOUNT);

// Init Firebase
// Match index.js logic
const serviceAccount = require('./serviceAccountKey.json');
console.log('Loaded serviceAccountKey.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: 'reservas-sodc'
    });
}
const db = admin.firestore();
const { sendDirectMessage } = require('./services/notificationService');

async function testTelegram() {
    console.log('--- Workers ---');
    try {
        const snap = await db.collection('trabajadores').get();
        let targetWorker = null;

        snap.forEach(doc => {
            const d = doc.data();
            console.log(`ID: ${doc.id}, Name: ${d.nombre}, Telegram: ${d.telegramChatId}`);
            if (d.telegramChatId) targetWorker = d;
        });

        if (targetWorker) {
            console.log(`\nAttempting to send message to ${targetWorker.nombre} (${targetWorker.telegramChatId})...`);
            try {
                const result = await sendDirectMessage(db, targetWorker.telegramChatId, '🔔 *Test Message* from Backend Debug Script');
                console.log('Send Result:', JSON.stringify(result, null, 2));
            } catch (err) {
                console.error('Send Error:', err);
            }
        } else {
            console.log('\nNo worker with Telegram ID found. Please add one in the UI.');
        }
    } catch (dbErr) {
        console.error('Firestore Error:', dbErr);
    }
}

testTelegram().then(() => console.log('Done.')).catch(console.error);
