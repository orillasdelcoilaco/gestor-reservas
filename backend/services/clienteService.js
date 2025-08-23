// backend/services/clienteService.js - CÓDIGO COMPLETO Y CORREGIDO

const csv = require('csv-parser');
const stream = require('stream');
const { cleanPhoneNumber } = require('../utils/helpers');

/**
 * Parsea un buffer de archivo CSV y devuelve las filas como un array de objetos.
 * (Función original restaurada)
 * @param {Buffer} buffer El buffer del archivo CSV.
 * @returns {Promise<Array<Object>>} Una promesa que se resuelve con los datos del CSV.
 */
function parseCsvBuffer(buffer) {
    return new Promise((resolve, reject) => {
        const results = [];
        const readableStream = new stream.Readable();
        readableStream._read = () => {}; // No-op
        readableStream.push(buffer);
        readableStream.push(null);

        readableStream
            .pipe(csv())
            .on('data', (data) => results.push(data))
            .on('end', () => resolve(results))
            .on('error', (error) => reject(error));
    });
}

/**
 * Procesa una lista de archivos CSV, extrae clientes válidos y los guarda en Firebase.
 * (Función original restaurada)
 * @param {admin.firestore.Firestore} db La instancia de Firestore.
 * @param {Array<Object>} files Un array de archivos subidos por multer.
 * @returns {Promise<Object>} Un resumen del proceso de importación.
 */
async function importClientsFromCsv(db, files) {
    console.log(`Procesando ${files.length} archivo(s)...`);

    const existingPhones = new Set();
    const clientsSnapshot = await db.collection('clientes').get();
    clientsSnapshot.forEach(doc => {
        if (doc.data().phone) {
            existingPhones.add(doc.data().phone);
        }
    });
    console.log(`Se encontraron ${existingPhones.size} clientes existentes en la base de datos.`);

    const keywords = ['booking', 'reserva', 'posible cliente', 'airbnb', 'sodc'];
    const batch = db.batch();
    let newClientsAdded = 0;
    let totalRowsRead = 0;

    for (const file of files) {
        const rows = await parseCsvBuffer(file.buffer);
        totalRowsRead += rows.length;
        
        for (const row of rows) {
            const fullName = `${row['Name'] || ''} ${row['First Name'] || ''} ${row['Last Name'] || ''}`.toLowerCase();
            const phoneValue = row['Phone 1 - Value'];
            if (!fullName || !phoneValue) continue;

            const hasKeyword = keywords.some(keyword => fullName.includes(keyword));
            const hasNumber = /\d/.test(fullName);

            if (hasKeyword || hasNumber) {
                const cleanedPhone = cleanPhoneNumber(phoneValue);
                if (cleanedPhone && !existingPhones.has(cleanedPhone)) {
                    const newClientRef = db.collection('clientes').doc();
                    const clientData = {
                        firstname: row['First Name'] || '',
                        lastname: row['Last Name'] || '',
                        phone: cleanedPhone,
                        email: row['E-mail 1 - Value'] || null
                    };
                    if (!clientData.firstname && !clientData.lastname && row['Name']) {
                        const nameParts = row['Name'].split(' ');
                        clientData.firstname = nameParts[0] || '';
                        clientData.lastname = nameParts.slice(1).join(' ');
                    }
                    batch.set(newClientRef, clientData);
                    existingPhones.add(cleanedPhone);
                    newClientsAdded++;
                }
            }
        }
    }

    if (newClientsAdded > 0) {
        await batch.commit();
        console.log(`Commit a Firestore: Se guardaron ${newClientsAdded} nuevos clientes.`);
    }

    return {
        filesProcessed: files.length,
        totalRowsRead,
        newClientsAdded
    };
}


/**
 * ¡NUEVA FUNCIÓN!
 * Obtiene todos los clientes y calcula estadísticas adicionales para cada uno.
 * @param {admin.firestore.Firestore} db La instancia de Firestore.
 * @returns {Promise<Array<Object>>} Una lista de clientes con sus estadísticas.
 */
async function getAllClientsWithStats(db) {
    const reservasSnapshot = await db.collection('reservas').get();
    const reservationStatsMap = new Map();

    reservasSnapshot.forEach(doc => {
        const reserva = doc.data();
        if (reserva.clienteId) {
            if (!reservationStatsMap.has(reserva.clienteId)) {
                // Guardamos el canal de la primera reserva que encontremos para este cliente
                reservationStatsMap.set(reserva.clienteId, { totalReservas: 0, primerCanal: reserva.canal });
            }
            const stats = reservationStatsMap.get(reserva.clienteId);
            stats.totalReservas += 1;
        }
    });

    const clientsSnapshot = await db.collection('clientes').get();
    if (clientsSnapshot.empty) {
        return [];
    }

    const clientsWithStats = [];
    clientsSnapshot.forEach(doc => {
        const clientData = doc.data();
        const stats = reservationStatsMap.get(doc.id) || { totalReservas: 0, primerCanal: 'Desconocido' };

        clientsWithStats.push({
            id: doc.id,
            nombre: `${clientData.firstname || ''} ${clientData.lastname || ''}`.trim(),
            telefono: clientData.phone || 'Sin Teléfono',
            email: clientData.email || 'Sin Email',
            totalReservas: stats.totalReservas,
            canal: clientData.canal || stats.primerCanal,
            fuente: clientData.fuente || '',
            origen: clientData.origen || '',
            calificacion: clientData.calificacion || 0,
            notas: clientData.notas || ''
        });
    });

    clientsWithStats.sort((a, b) => a.nombre.localeCompare(b.nombre));
    
    return clientsWithStats;
}

// Exportamos todas las funciones necesarias
module.exports = {
    importClientsFromCsv,
    getAllClientsWithStats
};