const { google } = require('googleapis');

/**
 * Obtiene un cliente autenticado para la API de Google People.
 * @returns {people_v1.People}
 */
function getPeopleApiClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.RENDER ? '/etc/secrets/serviceAccountKey.json' : './serviceAccountKey.json',
    scopes: [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/contacts'
    ],
  });
  return google.people({ version: 'v1', auth });
}

/**
 * Busca un contacto en Google Contacts por su número de teléfono.
 * @param {people_v1.People} people - El cliente de la API de People.
 * @param {string} phoneNumber - El número de teléfono a buscar.
 * @returns {Promise<object|null>} El objeto del contacto si se encuentra, o null.
 */
async function findContactByPhone(people, phoneNumber) {
  try {
    const response = await people.people.searchContacts({
      query: phoneNumber,
      readMask: 'names,phoneNumbers,biographies',
    });

    if (response.data.results && response.data.results.length > 0) {
      // Devolvemos el primer resultado que coincida exactamente
      for (const result of response.data.results) {
        if (result.person.phoneNumbers) {
          for (const phone of result.person.phoneNumbers) {
            // Comparamos los números sin caracteres especiales
            const cleanedApiPhone = phone.value.replace(/\D/g, '');
            const cleanedSearchPhone = phoneNumber.replace(/\D/g, '');
            if (cleanedApiPhone.includes(cleanedSearchPhone)) {
              console.log(`Contacto encontrado para ${phoneNumber}: ${result.person.names[0].displayName}`);
              return result.person;
            }
          }
        }
      }
    }
    return null;
  } catch (error) {
    console.error('Error al buscar contacto por teléfono:', error.message);
    return null;
  }
}

/**
 * Crea un nuevo contacto en Google Contacts.
 * @param {people_v1.People} people - El cliente de la API de People.
 * @param {object} reservaData - Los datos de la reserva.
 * @returns {Promise<void>}
 */
async function createGoogleContact(people, reservaData) {
  const { nombreCompleto, canal, reservaIdOriginal, telefono, fechaLlegada, alojamiento } = reservaData;
  
  const contact = {
    names: [{ givenName: `${nombreCompleto} ${canal} ${reservaIdOriginal}` }],
    phoneNumbers: [{ value: telefono }],
    biographies: [{ value: `Reserva N° ${reservaIdOriginal} - Llegada: ${fechaLlegada.toLocaleDateString('es-CL')} - Cabaña: ${alojamiento}` }]
  };

  try {
    await people.people.createContact({ requestBody: contact });
    console.log(`Nuevo contacto creado: ${nombreCompleto} ${canal} ${reservaIdOriginal}`);
  } catch (error) {
    console.error('Error al crear el contacto:', error.message);
  }
}

/**
 * Actualiza la nota de un contacto existente en Google Contacts.
 * @param {people_v1.People} people - El cliente de la API de People.
 * @param {object} existingContact - El objeto del contacto existente.
 * @param {object} reservaData - Los datos de la nueva reserva.
 * @returns {Promise<void>}
 */
async function updateGoogleContactNotes(people, existingContact, reservaData) {
  const { reservaIdOriginal, fechaLlegada, alojamiento } = reservaData;
  
  const newNote = `Reserva N° ${reservaIdOriginal} - Llegada: ${fechaLlegada.toLocaleDateString('es-CL')} - Cabaña: ${alojamiento}`;
  
  // Obtenemos las notas existentes y añadimos la nueva
  const existingNotes = existingContact.biographies ? existingContact.biographies[0].value : '';
  const updatedNotes = existingNotes ? `${existingNotes}\n${newNote}` : newNote;

  const contactToUpdate = {
    resourceName: existingContact.resourceName,
    etag: existingContact.etag,
    biographies: [{ value: updatedNotes }]
  };

  try {
    await people.people.updateContact({
      resourceName: existingContact.resourceName,
      updatePersonFields: 'biographies',
      requestBody: contactToUpdate,
    });
    console.log(`Notas actualizadas para el contacto: ${existingContact.names[0].displayName}`);
  } catch (error) {
    console.error('Error al actualizar las notas del contacto:', error.message);
  }
}

module.exports = {
  getPeopleApiClient,
  findContactByPhone,
  createGoogleContact,
  updateGoogleContactNotes,
};
