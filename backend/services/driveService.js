const { google } = require('googleapis');

/**
 * Crea un cliente de Google Drive autenticado.
 * @returns {drive_v3.Drive} Una instancia del cliente de la API de Google Drive.
 */
function getDriveClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.RENDER ? '/etc/secrets/serviceAccountKey.json' : './serviceAccountKey.json',
    scopes: [
      'https://www.googleapis.com/auth/drive.readonly',
      // 'https://www.googleapis.com/auth/contacts' // <-- LÍNEA ELIMINADA
    ]
  });
  return google.drive({ version: 'v3', auth });
}

/**
 * Busca el archivo más reciente en una carpeta de Drive que coincida con un patrón de nombre.
 * @param {drive_v3.Drive} drive - El cliente de la API de Google Drive.
 * @param {string} folderId - El ID de la carpeta de Google Drive donde buscar.
 * @param {string} fileNamePattern - El patrón que debe contener el nombre del archivo.
 * @returns {Promise<Object|null>} El objeto del archivo más reciente o null si no se encuentra.
 */
async function findLatestFile(drive, folderId, fileNamePattern) {
  try {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and name contains '${fileNamePattern}' and trashed = false`,
      fields: 'files(id, name, modifiedTime)',
      orderBy: 'modifiedTime desc',
      pageSize: 1,
    });
    if (res.data.files.length > 0) {
      console.log(`Archivo más reciente encontrado para '${fileNamePattern}': ${res.data.files[0].name}`);
      return res.data.files[0];
    } else {
      console.log(`No se encontraron archivos para '${fileNamePattern}' en la carpeta ${folderId}.`);
      return null;
    }
  } catch (error) {
    console.error(`Error buscando el archivo para '${fileNamePattern}':`, error.message);
    throw new Error('No se pudo buscar archivos en Google Drive.');
  }
}

/**
 * Descarga el contenido de un archivo de Google Drive.
 * @param {drive_v3.Drive} drive - El cliente de la API de Google Drive.
 * @param {string} fileId - El ID del archivo a descargar.
 * @returns {Promise<stream.Readable>} El contenido del archivo como un stream.
 */
async function downloadFile(drive, fileId) {
  try {
    const response = await drive.files.get(
      { fileId: fileId, alt: 'media' },
      { responseType: 'stream' }
    );
    return response.data;
  } catch (error) {
    console.error(`Error al descargar el archivo ${fileId}:`, error.message);
    throw new Error('No se pudo descargar el archivo desde Google Drive.');
  }
}

module.exports = {
  getDriveClient,
  findLatestFile,
  downloadFile,
};