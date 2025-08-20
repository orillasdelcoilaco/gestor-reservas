const { google } = require('googleapis');
const { cleanPhoneNumber } = require('../utils/helpers');
const csv = require('csv-parser');
const stream = require('stream');

function getPeopleApiClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.RENDER ? '/etc/secrets/serviceAccountKey.json' : './serviceAccountKey.json',
    scopes: ['https://www.googleapis.com/auth/contacts.readonly'],
  });
  return google.people({ version: 'v1', auth });
}

async function getAllGoogleContactPhones(people) {
  const phoneNumbers = new Set();
  let pageToken = null;
  console.log('Obteniendo contactos existentes de Google...');
  try {
    do {
      const response = await people.people.connections.list({
        resourceName: 'people/me',
        pageSize: 1000,
        // Pedimos más campos para el diagnóstico
        personFields: 'phoneNumbers,names,emailAddresses',
        pageToken: pageToken,
      });

      const connections = response.data.connections || [];
      connections.forEach(person => {
        // --- INICIO DEL CÓDIGO DE DIAGNÓSTICO ---
        if (person.phoneNumbers && person.phoneNumbers.length > 0) {
            const displayName = person.names && person.names.length > 0 ? person.names[0].displayName : "Sin Nombre";
            console.log(`Contacto encontrado: ${displayName}, Teléfonos: ${person.phoneNumbers.map(p => p.value).join(', ')}`);
        // --- FIN DEL CÓDIGO DE DIAGNÓSTICO ---

          person.phoneNumbers.forEach(phone => {
            const cleanedPhone = cleanPhoneNumber(phone.value);
            if (cleanedPhone) phoneNumbers.add(cleanedPhone);
          });
        }
      });
      pageToken = response.data.nextPageToken;
    } while (pageToken);

    console.log(`Se encontraron ${phoneNumbers.size} números de teléfono únicos y limpios en Google Contacts.`);
    return phoneNumbers;
  } catch (error) {
    console.error('Error al obtener los contactos de Google:', error.message);
    throw new Error('No se pudieron obtener los contactos de Google.');
  }
}

function convertToCsv(clients) {
  if (clients.length === 0) return '';
  const headers = 'Given Name,Family Name,Phone 1 - Type,Phone 1 - Value';
  const rows = clients.map(client => {
    const phone = client.phone || '';
    const givenName = `${client.firstname || ''} ${client.lastname || ''}`.trim();
    return `"${givenName}","","Mobile","${phone}"`;
  });
  return [headers, ...rows].join('\n');
}

async function generateContactsCsv(db) {
  const people = getPeopleApiClient();
  const googlePhones = await getAllGoogleContactPhones(people);

  const firebaseClients = [];
  const clientsSnapshot = await db.collection('clientes').get();
  clientsSnapshot.forEach(doc => {
    firebaseClients.push(doc.data());
  });
  console.log(`Se encontraron ${firebaseClients.length} clientes en Firebase.`);

  const newClients = firebaseClients.filter(client => {
    const cleanedPhone = cleanPhoneNumber(client.phone);
    if (!cleanedPhone) return false;
    return !googlePhones.has(cleanedPhone);
  });

  console.log(`Se encontraron ${newClients.length} clientes nuevos para agregar.`);

  const csvContent = convertToCsv(newClients);
  return {
    csvContent: csvContent,
    newContactsCount: newClients.length,
  };
}

/**
 * Procesa un buffer de archivo CSV, extrae clientes válidos y los guarda en Firebase.
 * @param {admin.firestore.Firestore} db - La instancia de Firestore.
 * @param {Buffer} buffer - El buffer del archivo CSV.
 * @returns {Promise<Object>} Un resumen del proceso de importación.
 */
async function importClientsFromCsv(db, buffer) {
  console.log('Iniciando procesamiento de CSV...');

  // 1. Obtener teléfonos existentes de Firebase para evitar duplicados
  const existingPhones = new Set();
  const clientsSnapshot = await db.collection('clientes').get();
  clientsSnapshot.forEach(doc => {
    if (doc.data().phone) {
      existingPhones.add(doc.data().phone);
    }
  });
  console.log(`Se encontraron ${existingPhones.size} clientes existentes en Firebase.`);

  // 2. Leer el archivo CSV desde el buffer
  const results = await new Promise((resolve, reject) => {
    const data = [];
    const readableStream = new stream.Readable();
    readableStream._read = () => {}; // No-op
    readableStream.push(buffer);
    readableStream.push(null);

    readableStream
      .pipe(csv())
      .on('data', (row) => data.push(row))
      .on('end', () => resolve(data))
      .on('error', (error) => reject(error));
  });

  const rowsRead = results.length;
  console.log(`Se leyeron ${rowsRead} filas del archivo CSV.`);

  // 3. Filtrar, procesar y preparar los nuevos clientes
  const batch = db.batch();
  let newClientsAdded = 0;
  let validClients = 0;
  const keywords = ['booking', 'reserva', 'airbnb'];

  for (const row of results) {
    const name = row['Name'];
    const phoneValue = row['Phone 1 - Value'];

    if (!name || !phoneValue) {
      continue; // Ignorar filas sin nombre o teléfono
    }

    const nameLower = name.toLowerCase();
    const hasKeyword = keywords.some(keyword => nameLower.includes(keyword));

    if (hasKeyword) {
      validClients++;
      const cleanedPhone = cleanPhoneNumber(phoneValue);

      if (cleanedPhone && !existingPhones.has(cleanedPhone)) {
        const newClientRef = db.collection('clientes').doc();

        // Extraer el nombre real del cliente
        let clientName = name;
        for (const keyword of keywords) {
          const index = clientName.toLowerCase().indexOf(keyword);
          if (index !== -1) {
            clientName = clientName.substring(0, index).trim();
            break;
          }
        }
        
        const nameParts = clientName.split(' ').filter(p => p);
        const firstname = nameParts[0] || '';
        const lastname = nameParts.slice(1).join(' ');
        
        const email = row['E-mail 1 - Value'] || null;

        batch.set(newClientRef, { firstname, lastname, phone: cleanedPhone, email });
        existingPhones.add(cleanedPhone); // Añadir al set para no duplicar en el mismo proceso
        newClientsAdded++;
      }
    }
  }

  // 4. Guardar los nuevos clientes en Firebase
  if (newClientsAdded > 0) {
    await batch.commit();
    console.log(`Commit a Firestore: Se guardaron ${newClientsAdded} nuevos clientes.`);
  }

  return { rowsRead, validClients, newClientsAdded };
}

module.exports = {
  generateContactsCsv,
  importGoogleContactsToFirebase, // Esta puede que la borremos luego si no la usamos
  importClientsFromCsv, // Asegúrate de que esta línea esté aquí
};