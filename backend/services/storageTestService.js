const admin = require('firebase-admin');
const { v4: uuidv4 } = require('uuid');

/**
 * Realiza una subida de prueba a Firebase Storage.
 * Sube un buffer de texto simple para verificar la conexión y los permisos.
 * @returns {Promise<string>} La URL pública del archivo de prueba.
 */
async function testUpload() {
    console.log('[Test Service] Iniciando prueba de subida...');
    const bucket = admin.storage().bucket('reservas-sodc.firebaseapp.com');
    const destinationPath = 'test/test-upload.txt';
    const file = bucket.file(destinationPath);
    
    // Creamos un archivo de texto simple en memoria
    const fileBuffer = Buffer.from('Si puedes leer esto, la subida funcionó.');
    const mimeType = 'text/plain';
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
        
        const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(destinationPath)}?alt=media&token=${token}`;
        
        console.log(`[Test Service] ¡Prueba exitosa! Archivo subido a: ${publicUrl}`);
        return publicUrl;
    } catch (error) {
        console.error('[Test Service] La prueba de subida falló:', error);
        // Re-lanzamos el error para que la ruta lo capture y lo muestre
        throw error;
    }
}

module.exports = {
    testUpload,
};