// Este archivo centraliza las configuraciones importantes de la aplicación.

const config = {
  // ID de la carpeta en Google Drive donde se almacenan los reportes.
  // Reemplaza 'TU_ID_DE_CARPETA_AQUI' con el ID real de tu carpeta.
  DRIVE_FOLDER_ID: '1xAZcGboZeYEf9hvYnmAy8jjUjK8X6PwE',

  // Patrones para identificar los archivos de reporte.
  // No cambies esto a menos que los nombres de tus archivos cambien.
  SODC_FILE_PATTERN: 'mphb-bookings',
  BOOKING_FILE_PATTERN: 'Check-in',
};

module.exports = config;
