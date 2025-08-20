const { google } = require('googleapis');
const { cleanPhoneNumber } = require('../utils/helpers');

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

module.exports = {
  generateContactsCsv,
};