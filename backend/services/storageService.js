const admin = require('firebase-admin');

/**
 * Sube un archivo a Firebase Storage y devuelve su URL pública.
 * @param {string} bucketName El nombre del bucket de Storage.
 * @param {Buffer} fileBuffer El buffer del archivo a subir.
 * @param {string} destinationPath La ruta dentro del bucket donde se guardará.
 * @param {string} mimeType El tipo MIME del archivo.
 * @returns {Promise<string>} La URL pública del archivo subido.
 */
async function uploadFile(bucketName, fileBuffer, destinationPath, mimeType) {
    const bucket = admin.storage().bucket(bucketName);
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