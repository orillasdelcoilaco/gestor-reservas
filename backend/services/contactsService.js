const { google } = require('googleapis');

/**
 * Obtiene un cliente autenticado para la API de Google People.
 */
function getPeopleApiClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.RENDER ? '/etc/secrets/serviceAccountKey.json' : './serviceAccountKey.json',
    scopes: ['https://www.googleapis.com/auth/contacts'],
  });
  return google.people({ version: 'v1', auth });
}

/**
 * Busca un contacto en Google Contacts por su número de teléfono.
 */
async function findContactByPhone(people, phoneNumber) {
  try {
    const response = await people.people.searchContacts({
      query: phoneNumber,
      readMask: 'names,phoneNumbers',
    });

    if (response.data.results && response.data.results.length > 0) {
      for (const result of response.data.results) {
        if (result.person.phoneNumbers) {
          for (const phone of result.person.phoneNumbers) {
            const cleanedApiPhone = phone.value.replace(/\D/g, '');
            const cleanedSearchPhone = phoneNumber.replace(/\D/g, '');
            if (cleanedApiPhone.includes(cleanedSearchPhone)) {
              return result.person; // Contacto encontrado
            }
          }
        }
      }
    }
    return null; // No se encontró
  } catch (error) {
    console.error(`Error al buscar contacto por teléfono (${phoneNumber}):`, error.message);
    return null;
  }
}

/**
 * Crea un nuevo contacto en Google Contacts (versión simplificada).
 */
async function createGoogleContact(people, contactInfo) {
  const { nombreCompleto, canal, reservaIdOriginal, telefono } = contactInfo;
  
  const contact = {
    names: [{ givenName: `${nombreCompleto} ${canal} ${reservaIdOriginal}` }],
    phoneNumbers: [{ value: telefono }],
    // No añadimos notas para agilizar el proceso
  };

  try {
    await people.people.createContact({ requestBody: contact });
    console.log(`Nuevo contacto de Google creado: ${contact.names[0].givenName}`);
  } catch (error) {
    console.error(`Error al crear el contacto de Google para ${nombreCompleto}:`, error.message);
  }
}

module.exports = {
  getPeopleApiClient,
  findContactByPhone,
  createGoogleContact,
};
