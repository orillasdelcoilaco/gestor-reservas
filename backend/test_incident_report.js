// backend/test_incident_report.js
// const axios = require('axios'); // Requires installing axios or using node-fetch if available. 
// Assuming node-fetch or native fetch in Node 18+
// Gestor de reservas seems to use 'request' or 'axios' possibly? 
// Let's use native fetch (available in newer node) or http.

const payload = {
    cabanaId: 'Cabaña 10',
    espacio: 'Baño en Suite',
    descripcion: 'Prueba de incidencia automática fase 2',
    prioridad: 'URGENTE',
    reportadoPor: { nombre: 'Tester Bot', id: 'bot-01' }
};

// Need Auth Token? "checkFirebaseToken" middleware is active on /api.
// To test locally without full auth flow, we might need a bypass or valid token.
// User said: "reproduce_step3_error.js" used local bypass? 
// Or we can manually insert to DB to test the SERVICE, avoiding auth for this unit test.

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: 'reservas-sodc'
    });
}
const db = admin.firestore();
const incidentsController = require('./controllers/incidentsController');

// Mock Req/Res
const req = {
    body: payload
};
const res = {
    status: (code) => ({
        json: (data) => console.log(`[STATUS ${code}]`, data)
    }),
    json: (data) => console.log('[JSON]', data)
};

console.log('--- Testing Incident Controller Directly ---');
incidentsController.createIncident(req, res, db)
    .then(() => console.log('--- End Test ---'))
    .catch(err => console.error(err));
