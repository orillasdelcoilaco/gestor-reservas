// backend/services/clienteService.js - CÓDIGO FINAL CON LÓGICA CENTRALIZADA

const csv = require('csv-parser');
const stream = require('stream');
const { cleanPhoneNumber } = require('../utils/helpers');
const { createGoogleContact, findContactByName, updateContact } = require('./googleContactsService');

async function findOrCreateClient(db, clientData) {
    // ... (código sin cambios)
}

function parseCsvBuffer(buffer) {
    // ... (código sin cambios)
}

async function importClientsFromCsv(db, files) {
    // ... (código sin cambios)
}

// --- FUNCIÓN OPTIMIZADA ---
async function getAllClientsWithStats(db) {
    // Paso 1: Obtener todos los clientes y todas las reservas en paralelo.
    const [clientsSnapshot, reservasSnapshot] = await Promise.all([
        db.collection('clientes').get(),
        db.collection('reservas').get()
    ]);

    if (clientsSnapshot.empty) {
        return [];
    }

    // Paso 2: Procesar las reservas una sola vez para crear un mapa de estadísticas.
    const reservationStatsMap = new Map();
    reservasSnapshot.forEach(doc => {
        const reserva = doc.data();
        if (reserva.clienteId) {
            if (!reservationStatsMap.has(reserva.clienteId)) {
                reservationStatsMap.set(reserva.clienteId, {
                    totalReservas: 0,
                    reservas: []
                });
            }
            const stats = reservationStatsMap.get(reserva.clienteId);
            stats.totalReservas += 1;
            stats.reservas.push(reserva);
        }
    });

    // Paso 3: Iterar sobre los clientes y construir la respuesta usando el mapa de estadísticas.
    const clientsWithStats = clientsSnapshot.docs.map(doc => {
        const clientData = doc.data();
        const stats = reservationStatsMap.get(doc.id) || { totalReservas: 0, reservas: [] };
        
        let primerCanal = 'N/A';
        if (stats.totalReservas > 0) {
            const reservasConFecha = stats.reservas.filter(r => r.fechaReserva && typeof r.fechaReserva.toMillis === 'function');
            if (reservasConFecha.length > 0) {
                const primeraReserva = reservasConFecha.sort((a, b) => a.fechaReserva.toMillis() - b.fechaReserva.toMillis())[0];
                primerCanal = primeraReserva.canal || 'Desconocido';
            } else {
                primerCanal = stats.reservas[0].canal || 'Desconocido';
            }
        }

        return {
            id: doc.id,
            nombre: `${clientData.firstname || ''} ${clientData.lastname || ''}`.trim(),
            telefono: clientData.phone || 'Sin Teléfono',
            email: clientData.email || 'Sin Email',
            totalReservas: stats.totalReservas,
            canal: clientData.canal || primerCanal,
            fuente: clientData.fuente || '',
            origen: clientData.origen || '',
            calificacion: clientData.calificacion || 0,
            notas: clientData.notas || '',
            googleContactSynced: clientData.googleContactSynced || false,
            telefonoManual: clientData.telefonoManual || false
        };
    });

    clientsWithStats.sort((a, b) => a.nombre.localeCompare(b.nombre));
    
    return clientsWithStats;
}


async function syncClientToGoogle(db, clientId) {
    // ... (código sin cambios)
}

// --- FUNCIÓN MODIFICADA Y CORREGIDA ---
async function updateClientMaster(db, clientId, newData) {
    const clientRef = db.collection('clientes').doc(clientId);
    const clientDoc = await clientRef.get();
    if (!clientDoc.exists) throw new Error('El cliente no existe.');

    const oldData = clientDoc.data();
    const dataToUpdateInFirestore = {};

    const newFirstname = newData.firstname || oldData.firstname;
    const newLastname = newData.lastname || oldData.lastname;
    const newPhone = cleanPhoneNumber(newData.phone);

    if (newFirstname !== oldData.firstname) dataToUpdateInFirestore.firstname = newFirstname;
    if (newLastname !== oldData.lastname) dataToUpdateInFirestore.lastname = newLastname;
    if (newPhone && newPhone !== oldData.phone) {
        dataToUpdateInFirestore.phone = newPhone;
        dataToUpdateInFirestore.telefonoManual = true;
    }
    // Se añade la comprobación para el email que faltaba
    if (newData.email && newData.email !== oldData.email) dataToUpdateInFirestore.email = newData.email;
    if (newData.origen !== undefined && newData.origen !== oldData.origen) dataToUpdateInFirestore.origen = newData.origen;
    if (newData.fuente !== undefined && newData.fuente !== oldData.fuente) dataToUpdateInFirestore.fuente = newData.fuente;
    if (newData.calificacion !== undefined && Number(newData.calificacion) !== oldData.calificacion) dataToUpdateInFirestore.calificacion = Number(newData.calificacion);
    if (newData.notas !== undefined && newData.notas !== oldData.notas) dataToUpdateInFirestore.notas = newData.notas;
    
    if (Object.keys(dataToUpdateInFirestore).length === 0) {
        return { success: true, message: "No se realizaron cambios." };
    }

    await clientRef.update(dataToUpdateInFirestore);
    console.log(`Cliente ${clientId} actualizado en Firestore.`);

    const newFullName = `${newFirstname} ${newLastname}`.trim();
    const oldFullName = `${oldData.firstname || ''} ${oldData.lastname || ''}`.trim();
    const nameHasChanged = newFullName !== oldFullName;

    if (nameHasChanged) {
        const reservasQuery = db.collection('reservas').where('clienteId', '==', clientId);
        const reservasSnapshot = await reservasQuery.get();
        if (!reservasSnapshot.empty) {
            const batch = db.batch();
            reservasSnapshot.forEach(doc => {
                batch.update(doc.ref, { clienteNombre: newFullName, nombreManual: true });
            });
            await batch.commit();
            console.log(`Actualizadas ${reservasSnapshot.size} reservas para el cliente ${clientId}.`);
        }
    }

    try {
        const q = db.collection('reservas').where('clienteId', '==', clientId).orderBy('fechaReserva', 'desc').limit(1);
        const snapshot = await q.get();
        if (snapshot.empty) throw new Error('No se encontraron reservas para obtener el ID de desambiguación.');
        
        const reservaData = snapshot.docs[0].data();
        const contactIdSuffix = `${reservaData.canal} ${reservaData.reservaIdOriginal}`;
        
        const contactResource = await findContactByName(db, `${oldFullName} ${contactIdSuffix}`);

        if (contactResource && contactResource.resourceName) {
            const updatePayload = { etag: contactResource.etag };
            const updateMask = [];
            
            if (nameHasChanged) {
                updatePayload.names = [{ givenName: `${newFullName} ${contactIdSuffix}` }];
                updateMask.push('names');
            }
            if (newPhone && newPhone !== oldData.phone) {
                updatePayload.phoneNumbers = [{ value: newPhone }];
                updateMask.push('phoneNumbers');
            }
            
            if (updateMask.length > 0) {
                await updateContact(db, contactResource.resourceName, updatePayload, updateMask);
                console.log(`Contacto de Google para ${newFullName} actualizado.`);
            }
        }
    } catch (error) {
        console.error(`No se pudo actualizar el contacto de Google para el cliente ${clientId}. Error: ${error.message}`);
    }

    return { success: true, message: 'Cliente actualizado en todo el sistema.' };
}


module.exports = {
    importClientsFromCsv,
    getAllClientsWithStats,
    syncClientToGoogle,
    updateClientMaster,
    findOrCreateClient
};