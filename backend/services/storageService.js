const admin = require('firebase-admin');

/**
 * Sube un archivo a Firebase Storage y devuelve su URL pública.
 * No necesita el nombre del bucket porque lo toma de la inicialización de Firebase Admin.
 * @param {Buffer} fileBuffer El buffer del archivo a subir.
 * @param {string} destinationPath La ruta dentro del bucket donde se guardará.
 * @param {string} mimeType El tipo MIME del archivo.
 * @returns {Promise<string>} La URL pública del archivo subido.
 */
async function uploadFile(fileBuffer, destinationPath, mimeType) {
    // --- CORRECCIÓN CLAVE ---
    // Simplemente llamamos a admin.storage().bucket() sin argumentos.
    // Esto usará el bucket configurado en admin.initializeApp() en index.js.
    const bucket = admin.storage().bucket();
    const file = bucket.file(destinationPath);

    try {
        await file.save(fileBuffer, {
            metadata: {
                contentType: mimeType,
            },
            public: true,
            validation: 'md5'
        });
        
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${destinationPath}`;
        
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