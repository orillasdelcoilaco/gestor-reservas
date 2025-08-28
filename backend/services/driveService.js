const { google } = require('googleapis');
const stream = require('stream');

/**
 * Crea un cliente de Google Drive autenticado.
 * Se actualizan los scopes para permitir la creación de carpetas y subida de archivos.
 */
function getDriveClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.RENDER ? '/etc/secrets/serviceAccountKey.json' : './serviceAccountKey.json',
    scopes: [
      'https://www.googleapis.com/auth/drive', // Scope completo para leer, crear y modificar
    ]
  });
  return google.drive({ version: 'v3', auth });
}

/**
 * Busca el archivo más reciente en una carpeta de Drive que coincida con un patrón de nombre.
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

/**
 * --- NUEVA FUNCIÓN ---
 * Busca una carpeta por su nombre dentro de una carpeta padre. Si no la encuentra, la crea.
 * @returns {string} El ID de la carpeta encontrada o creada.
 */
async function findOrCreateFolder(drive, folderName, parentFolderId) {
    const query = `'${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`;
    try {
        const res = await drive.files.list({ q: query, fields: 'files(id, name)' });
        if (res.data.files.length > 0) {
            console.log(`Carpeta '${folderName}' encontrada con ID: ${res.data.files[0].id}`);
            return res.data.files[0].id;
        } else {
            console.log(`Carpeta '${folderName}' no encontrada. Creando...`);
            const fileMetadata = {
                name: folderName,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [parentFolderId]
            };
            const folder = await drive.files.create({
                resource: fileMetadata,
                fields: 'id'
            });
            console.log(`Carpeta '${folderName}' creada con ID: ${folder.data.id}`);
            return folder.data.id;
        }
    } catch (error) {
        console.error(`Error al buscar o crear la carpeta '${folderName}':`, error);
        throw new Error('Error de comunicación con Google Drive para gestionar carpetas.');
    }
}

/**
 * --- NUEVA FUNCIÓN ---
 * Sube un archivo a una carpeta específica en Google Drive.
 * @returns {string} El ID del archivo subido.
 */
async function uploadFile(drive, fileName, mimeType, fileBuffer, folderId) {
    const bufferStream = new stream.PassThrough();
    bufferStream.end(fileBuffer);

    const fileMetadata = {
        name: fileName,
        parents: [folderId]
    };
    const media = {
        mimeType: mimeType,
        body: bufferStream
    };

    try {
        const file = await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id, webViewLink' // Pedimos el webViewLink para guardarlo
        });
        console.log(`Archivo '${fileName}' subido exitosamente con ID: ${file.data.id}`);
        return file.data; // Devolvemos el objeto completo con id y webViewLink
    } catch (error) {
        console.error(`Error al subir el archivo '${fileName}':`, error);
        throw new Error('No se pudo subir el archivo a Google Drive.');
    }
}


module.exports = {
  getDriveClient,
  findLatestFile,
  downloadFile,
  findOrCreateFolder, // Exportamos la nueva función
  uploadFile,         // Exportamos la nueva función
};