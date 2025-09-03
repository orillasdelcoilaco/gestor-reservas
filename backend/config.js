// Este archivo centraliza las configuraciones importantes de la aplicación.

const config = {
  // ID de la carpeta en Google Drive donde se almacenan los reportes.
  DRIVE_FOLDER_ID: '1ED6xW0Ti_nBgRr_EzbYJ9XG1AxvfiUrx', // <-- Asegúrate de que este ID sea el correcto

    // ID de la carpeta compartida en "Mi Unidad" para guardar los documentos de reservas.
  DOCUMENTS_PARENT_FOLDER_ID: '1Nl6Z5tAmm4nwTfwDfWgEpjT298VmusLX',

  // Patrones para identificar los archivos de reporte.
  SODC_FILE_PATTERN: 'mphb-bookings',
  BOOKING_FILE_PATTERN: 'Check-in con datos de contacto',
  // --- INICIO DE LA MODIFICACIÓN ---
  AIRBNB_FILE_PATTERN: 'airbnb_', // Se añade el nuevo patrón para Airbnb
  // --- FIN DE LA MODIFICACIÓN ---
};

module.exports = config;