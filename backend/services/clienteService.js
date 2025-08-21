const csv = require('csv-parser');
const stream = require('stream');
const { cleanPhoneNumber } = require('../utils/helpers');

/**
 * Parsea un buffer de archivo CSV y devuelve las filas como un array de objetos.
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
 * @param {admin.firestore.Firestore} db La instancia de Firestore.
 * @param {Array<Object>} files Un array de archivos subidos por multer.
 * @returns {Promise<Object>} Un resumen del proceso de importación.
 */
async function importClientsFromCsv(db, files) {
    console.log(`Procesando ${files.length} archivo(s)...`);

    // 1. Obtener teléfonos existentes de Firebase para evitar duplicados
    const existingPhones = new Set();
    const clientsSnapshot = await db.collection('clientes').get();
    clientsSnapshot.forEach(doc => {
        if (doc.data().phone) {
            existingPhones.add(doc.data().phone);
        }
    });
    console.log(`Se encontraron ${existingPhones.size} clientes existentes en la base de datos.`);

    // 2. Definir palabras clave y preparar el lote de escritura
    const keywords = ['booking', 'reserva', 'posible cliente', 'airbnb', 'sodc'];
    const batch = db.batch();
    let newClientsAdded = 0;
    let totalRowsRead = 0;

    // 3. Procesar cada archivo subido
    for (const file of files) {
        const rows = await parseCsvBuffer(file.buffer);
        totalRowsRead += rows.length;
        console.log(`Archivo ${file.originalname} leído, contiene ${rows.length} filas.`);

        for (const row of rows) {
            // Unificar los posibles campos de nombre en un solo string para buscar
            const fullName = `${row['Name'] || ''} ${row['First Name'] || ''} ${row['Last Name'] || ''}`.toLowerCase();
            const phoneValue = row['Phone 1 - Value'];

            if (!fullName || !phoneValue) continue;

            // 4. Aplicar el filtro inteligente
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

                    // Si no hay nombre y apellido pero sí un nombre completo, lo usamos
                    if (!clientData.firstname && !clientData.lastname && row['Name']) {
                        const nameParts = row['Name'].split(' ');
                        clientData.firstname = nameParts[0] || '';
                        clientData.lastname = nameParts.slice(1).join(' ');
                    }

                    batch.set(newClientRef, clientData);
                    existingPhones.add(cleanedPhone); // Añadir al set para no duplicarlo en este mismo proceso
                    newClientsAdded++;
                }
            }
        }
    }

    // 5. Guardar los nuevos clientes en Firebase si se encontró alguno
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

module.exports = {
    importClientsFromCsv,
};