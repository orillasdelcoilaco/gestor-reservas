const { google } = require('googleapis');

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
        if (!client.phone) return false;
        const cleanedPhone = client.phone.replace(/\D/g, '');
        return !googlePhones.has(cleanedPhone);
    });
    console.log(`Se encontraron ${newClients.length} clientes nuevos para agregar.`);

    const csvContent = convertToCsv(newClients);

    return {
        csvContent: csvContent,
        newContactsCount: newClients.length
    };
}

module.exports = {
  generateContactsCsv,
};
