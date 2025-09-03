// backend/services/clienteService.js - CÓDIGO FINAL CON LÓGICA CENTRALIZADA

const csv = require('csv-parser');
const stream = require('stream');
const { cleanPhoneNumber } = require('../utils/helpers');
const { createGoogleContact, findContactByName, updateContact } = require('./googleContactsService');

async function findOrCreateClient(db, clientData) {
    const { nombre, telefono, email, empresa } = clientData;
    const cleanedPhone = telefono ? cleanPhoneNumber(telefono) : null;

    if (cleanedPhone) {
        const query = db.collection('clientes').where('phone', '==', cleanedPhone).limit(1);
        const snapshot = await query.get();
        if (!snapshot.empty) {
            return snapshot.docs[0].id;
        }
    }

    if (email) {
        const query = db.collection('clientes').where('email', '==', email).limit(1);
        const snapshot = await query.get();
        if (!snapshot.empty) {
            return snapshot.docs[0].id;
        }
    }

    const nameParts = nombre.split(' ');
    const newClientRef = db.collection('clientes').doc();
    const newClientPayload = {
        firstname: nameParts[0] || '',
        lastname: nameParts.slice(1).join(' ') || '',
        phone: cleanedPhone,
        email: email || null,
        fuente: empresa || 'Presupuesto Directo',
        googleContactSynced: false
    };
    
    await newClientRef.set(newClientPayload);
    return newClientRef.id;
}

function parseCsvBuffer(buffer) {
    return new Promise((resolve, reject) => {
        const results = [];
        const readableStream = new stream.Readable();
        readableStream._read = () => {};
        readableStream.push(buffer);
        readableStream.push(null);

        readableStream
            .pipe(csv())
            .on('data', (data) => results.push(data))
            .on('end', () => resolve(results))
            .on('error', (error) => reject(error));
    });
}

async function importClientsFromCsv(db, files) {
    // ... (código sin cambios)
}

// --- FUNCIÓN MODIFICADA ---
async function getAllClientsWithStats(db) {
    const clientsSnapshot = await db.collection('clientes').get();
    if (clientsSnapshot.empty) {
        return [];
    }

    const clientsWithStats = [];
    for (const doc of clientsSnapshot.docs) {
        const clientData = doc.data();
        let totalReservas = 0;
        let primerCanal = 'N/A';

        const reservasQuery = db.collection('reservas').where('clienteId', '==', doc.id);
        const reservasSnapshot = await reservasQuery.get();

        if (!reservasSnapshot.empty) {
            totalReservas = reservasSnapshot.size;
            
            // --- INICIO DE LA CORRECCIÓN ROBUSTA ---
            const sortedReservas = [...reservasSnapshot.docs].sort((a, b) => {
                const dateA = a.data().fechaReserva;
                const dateB = b.data().fechaReserva;

                // Si una fecha no existe o no es un objeto Timestamp válido, se considera "infinita" para que vaya al final.
                const timeA = (dateA && typeof dateA.toMillis === 'function') ? dateA.toMillis() : Infinity;
                const timeB = (dateB && typeof dateB.toMillis === 'function') ? dateB.toMillis() : Infinity;
                
                return timeA - timeB;
            });
            
            // Tomamos la primera reserva del array ya ordenado de forma segura.
            if (sortedReservas.length > 0) {
                primerCanal = sortedReservas[0].data().canal || 'Desconocido';
            }
            // --- FIN DE LA CORRECCIÓN ROBUSTA ---
        }

        clientsWithStats.push({
            id: doc.id,
            nombre: `${clientData.firstname || ''} ${clientData.lastname || ''}`.trim(),
            telefono: clientData.phone || 'Sin Teléfono',
            email: clientData.email || 'Sin Email',
            totalReservas: totalReservas,
            canal: clientData.canal || primerCanal,
            fuente: clientData.fuente || '',
            origen: clientData.origen || '',
            calificacion: clientData.calificacion || 0,
            notas: clientData.notas || '',
            googleContactSynced: clientData.googleContactSynced || false,
            telefonoManual: clientData.telefonoManual || false
        });
    }

    clientsWithStats.sort((a, b) => a.nombre.localeCompare(b.nombre));
    
    return clientsWithStats;
}

async function syncClientToGoogle(db, clientId) {
    // ... (código sin cambios)
}

async function updateClientMaster(db, clientId, newData) {
    // ... (código sin cambios)
}

module.exports = {
    importClientsFromCsv,
    getAllClientsWithStats,
    syncClientToGoogle,
    updateClientMaster,
    findOrCreateClient
};