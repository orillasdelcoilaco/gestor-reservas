const admin = require('firebase-admin');
const { v4: uuidv4 } = require('uuid');

/**
 * Sube un archivo a Firebase Storage y devuelve su URL pública.
 * @param {Buffer} fileBuffer El buffer del archivo a subir.
 * @param {string} destinationPath La ruta dentro del bucket donde se guardará (ej. 'reservas/2024/1234/abono.jpg').
 * @param {string} mimeType El tipo MIME del archivo (ej. 'image/jpeg').
 * @returns {Promise<string>} La URL pública del archivo subido.
 */
async function uploadFile(fileBuffer, destinationPath, mimeType) {
    // --- CORRECCIÓN DEFINITIVA APLICADA AQUÍ ---
    // Obtenemos una referencia explícita al bucket por su nombre exacto.
    const bucket = admin.storage().bucket('reservas-sodc.firebaseapp.com');
    const file = bucket.file(destinationPath);
    
    // Generamos un token para el acceso público
    const token = uuidv4();

    try {
        await file.save(fileBuffer, {
            metadata: {
                contentType: mimeType,
                metadata: {
                    firebaseStorageDownloadTokens: token
                }
            },
        });
        
        // Construimos la URL pública
        const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(destinationPath)}?alt=media&token=${token}`;
        
        console.log(`Archivo subido exitosamente a Firebase Storage: ${publicUrl}`);
        return publicUrl;
    } catch (error) {
        console.error('Error al subir archivo a Firebase Storage:', error);
        throw new Error('No se pudo subir el archivo a Firebase Storage.');
    }
}

module.exports = {
    uploadFile,
};