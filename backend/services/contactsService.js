const { google } = require('googleapis');
const stream = require('stream');
const config = require('../config');

/**
 * Obtiene un cliente autenticado para la API de Google People.
 */
function getPeopleApiClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.RENDER ? '/etc/secrets/serviceAccountKey.json' : './serviceAccountKey.json',
    scopes: ['https://www.googleapis.com/auth/contacts.readonly'], // Solo necesitamos leer contactos
  });
  return google.people({ version: 'v1', auth });
}

/**
 * Obtiene un cliente autenticado para la API de Google Drive.
 */
function getDriveClient() {
    const auth = new google.auth.GoogleAuth({
      keyFile: process.env.RENDER ? '/etc/secrets/serviceAccountKey.json' : './serviceAccountKey.json',
      scopes: ['https://www.googleapis.com/auth/drive'], // Necesitamos permisos de escritura para subir el archivo
    });
    return google.drive({ version: 'v3', auth });
}

/**
 * Obtiene todos los números de teléfono de los contactos de Google.
 * Maneja la paginación para obtener la lista completa.
 * @param {people_v1.People} people - El cliente de la API de People.
 * @returns {Promise<Set<string>>} Un conjunto de todos los números de teléfono existentes.
 */
async function getAllGoogleContactPhones(people) {
    const phoneNumbers = new Set();
    let pageToken = null;
    console.log('Obteniendo contactos existentes de Google...');
    try {
        do {
            const response = await people.people.connections.list({
                resourceName: 'people/me',
                pageSize: 1000,
                personFields: 'phoneNumbers',
                pageToken: pageToken,
            });

            const connections = response.data.connections || [];
            connections.forEach(person => {
                if (person.phoneNumbers) {
                    person.phoneNumbers.forEach(phone => {
                        const cleanedPhone = phone.value.replace(/\D/g, '');
                        if(cleanedPhone) phoneNumbers.add(cleanedPhone);
                    });
                }
            });
            pageToken = response.data.nextPageToken;
        } while (pageToken);
        console.log(`Se encontraron ${phoneNumbers.size} números de teléfono en Google Contacts.`);
        return phoneNumbers;
    } catch (error) {
        console.error('Error al obtener los contactos de Google:', error.message);
        throw new Error('No se pudieron obtener los contactos de Google.');
    }
}

/**
 * Convierte un array de objetos de cliente a un string en formato CSV.
 * @param {Array<object>} clients - La lista de clientes a convertir.
 * @returns {string} El contenido del archivo CSV.
 */
function convertToCsv(clients) {
    if (clients.length === 0) return '';
    
    const headers = 'Given Name,Family Name,Phone 1 - Type,Phone 1 - Value';
    const rows = clients.map(client => {
        const phone = client.phone || '';
        // Para el formato de Google, el nombre completo va en "Given Name"
        const givenName = `${client.firstname || ''} ${client.lastname || ''}`.trim();
        return `"${givenName}","","Mobile","${phone}"`;
    });

    return [headers, ...rows].join('\n');
}

/**
 * Sube un archivo a Google Drive, sobreescribiéndolo si ya existe.
 * @param {drive_v3.Drive} drive - El cliente de la API de Drive.
 * @param {string} fileName - El nombre del archivo a subir.
 * @param {string} content - El contenido del archivo.
 * @returns {Promise<void>}
 */
async function uploadCsvToDrive(drive, fileName, content) {
    const folderId = config.DRIVE_FOLDER_ID;

    // Buscar si el archivo ya existe
    const res = await drive.files.list({
        q: `'${folderId}' in parents and name = '${fileName}' and trashed = false`,
        fields: 'files(id)',
    });

    const media = {
        mimeType: 'text/csv',
        body: content,
    };

    if (res.data.files.length > 0) {
        // El archivo existe, lo actualizamos
        const fileId = res.data.files[0].id;
        console.log(`Actualizando archivo existente en Drive con ID: ${fileId}`);
        await drive.files.update({
            fileId: fileId,
            media: media,
        });
    } else {
        // El archivo no existe, lo creamos
        console.log(`Creando nuevo archivo en Drive: ${fileName}`);
        await drive.files.create({
            resource: {
                name: fileName,
                parents: [folderId],
            },
            media: media,
            fields: 'id',
        });
    }
}


/**
 * Función principal que orquesta la generación del CSV de contactos.
 * @param {admin.firestore.Firestore} db - La instancia de Firestore.
 * @returns {Promise<object>} Un resumen del proceso.
 */
async function generateContactsCsv(db) {
    const people = getPeopleApiClient();
    const drive = getDriveClient();

    // 1. Obtener todos los contactos de Google
    const googlePhones = await getAllGoogleContactPhones(people);

    // 2. Obtener todos los clientes de Firebase
    const firebaseClients = [];
    const clientsSnapshot = await db.collection('clientes').get();
    clientsSnapshot.forEach(doc => {
        firebaseClients.push(doc.data());
    });
    console.log(`Se encontraron ${firebaseClients.length} clientes en Firebase.`);

    // 3. Comparar y encontrar los clientes nuevos
    const newClients = firebaseClients.filter(client => {
        if (!client.phone) return false;
        const cleanedPhone = client.phone.replace(/\D/g, '');
        return !googlePhones.has(cleanedPhone);
    });
    console.log(`Se encontraron ${newClients.length} clientes nuevos para agregar.`);

    // 4. Convertir los nuevos clientes a formato CSV
    const csvContent = convertToCsv(newClients);

    // 5. Subir el archivo CSV a Google Drive
    if (newClients.length > 0) {
        await uploadCsvToDrive(drive, 'contactos_para_importar.csv', csvContent);
    }

    return {
        totalFirebaseClients: firebaseClients.length,
        totalGoogleContacts: googlePhones.size,
        newContactsFound: newClients.length,
    };
}

module.exports = {
  generateContactsCsv,
};
