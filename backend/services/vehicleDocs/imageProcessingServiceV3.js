const axios = require('axios');

const OPENCV_SERVICE_URL = process.env.OPENCV_SERVICE_URL || 'http://localhost:5000';

/**
 * Procesar documento usando servicio OpenCV en Docker
 * 
 * Este servicio maneja:
 * - Detección automática de documentos
 * - Corrección de perspectiva (enderezar)
 * - Recorte automático (sin fondos)
 * - Conversión a fotocopia (blanco/negro puro)
 * - Separación de triplicados
 * - Extracción de códigos QR
 */
async function processDocumentForInspection(imageBuffer, documentType, side = 'front', qrImageBuffer = null) {
    try {
        console.log('\n╔══════════════════════════════════════╗');
        console.log('║  PROCESAMIENTO OPENCV (DOCKER)      ║');
        console.log('╚══════════════════════════════════════╝');
        console.log('Tipo:', documentType, '| Lado:', side);
        if (qrImageBuffer) console.log('QR manual detectado (Buffer presente)');
        console.log('Servicio:', OPENCV_SERVICE_URL);

        // Crear FormData para enviar al servicio OpenCV
        const FormData = require('form-data');
        const formData = new FormData();

        formData.append('document', imageBuffer, {
            filename: 'document.jpg',
            contentType: 'image/jpeg'
        });
        formData.append('documentType', documentType);

        if (qrImageBuffer) {
            formData.append('qrImage', qrImageBuffer, {
                filename: 'qr_manual.jpg',
                contentType: 'image/jpeg'
            });
        }

        // Llamar al servicio OpenCV
        console.log(`[OpenCV] Enviando a: ${OPENCV_SERVICE_URL}/process-document`);
        const startTime = Date.now();

        const response = await axios.post(
            `${OPENCV_SERVICE_URL}/process-document`,
            formData,
            {
                headers: formData.getHeaders(),
                timeout: 30000,
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            }
        );

        console.log(`[OpenCV] Status: ${response.status} ${response.statusText}`);

        const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`[OpenCV] ✅ Respuesta recibida en ${processingTime}s`);

        if (!response.data.success) {
            console.error('[OpenCV] ❌ Error en respuesta:', response.data.error);
            throw new Error('OpenCV service returned error: ' + response.data.error);
        }

        // Extraer imágenes en base64 (ya vienen como data URIs)
        const { images, qr_data, metadata } = response.data;
        console.log('[OpenCV] Documento final:', images.processed ? 'Buffer OK' : 'MISSING');
        console.log('[OpenCV] QR final:', images.qr ? 'Buffer OK' : 'NONE');

        // Convertir data URIs a Buffers
        const processedBuffer = dataUriToBuffer(images.processed);
        const colorProcessedBuffer = images.colorProcessed ? dataUriToBuffer(images.colorProcessed) : null;
        const thumbnailBuffer = dataUriToBuffer(images.thumbnail);
        const qrBuffer = images.qr ? dataUriToBuffer(images.qr) : null;

        console.log('✅ Resultado:');
        console.log(`   Dimensiones: ${metadata.width}x${metadata.height}`);
        console.log(`   QR detectado: ${metadata.has_qr ? 'Sí' : 'No'}`);
        console.log(`   Color procesado: ${colorProcessedBuffer ? 'Sí' : 'No'}`);
        console.log('╚══════════════════════════════════════╝\n');

        return {
            success: true,
            processed: processedBuffer,
            colorProcessed: colorProcessedBuffer,
            qrImage: qrBuffer,
            qrData: qr_data,
            thumbnail: thumbnailBuffer,
            metadata: {
                ...metadata,
                side: side,
                processingTime: processingTime
            }
        };

    } catch (error) {
        console.error('\n❌ ERROR llamando a OpenCV service:', error.message);

        // Fallback: usar Sharp si OpenCV no está disponible
        console.log('⚠️ Intentando fallback con Sharp...');

        const sharp = require('sharp');

        try {
            const fallback = await sharp(imageBuffer)
                .greyscale()
                .normalise()
                .resize(1200, null, { fit: 'inside' })
                .jpeg({ quality: 90 })
                .toBuffer();

            const meta = await sharp(fallback).metadata();

            return {
                success: true,
                processed: fallback,
                qrImage: null,
                qrData: null,
                thumbnail: fallback,
                metadata: {
                    width: meta.width,
                    height: meta.height,
                    hasQR: false,
                    side: side,
                    warning: 'Procesado con Sharp (OpenCV no disponible)'
                }
            };
        } catch (fallbackError) {
            throw new Error('OpenCV service failed and fallback failed: ' + error.message);
        }
    }
}

/**
 * Convertir data URI a Buffer
 */
function dataUriToBuffer(dataUri) {
    if (!dataUri) return null;

    const base64Data = dataUri.split(',')[1];
    return Buffer.from(base64Data, 'base64');
}

/**
 * Procesar Padrón (2 caras)
 */
async function processPadronDocument(frontBuffer, backBuffer) {
    console.log('\n╔═══════════════════════════════════════╗');
    console.log('║   PROCESAMIENTO DE PADRÓN (2 CARAS)  ║');
    console.log('╚═══════════════════════════════════════╝');

    const front = await processDocumentForInspection(frontBuffer, 'PADRON', 'front');
    const back = await processDocumentForInspection(backBuffer, 'PADRON', 'back');

    console.log('\n✅ Ambas caras del Padrón procesadas\n');

    return { front, back };
}

module.exports = {
    processDocumentForInspection,
    processPadronDocument
};
