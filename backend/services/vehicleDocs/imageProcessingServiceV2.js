const sharp = require('sharp');
const jsQR = require('jsqr');
const Jimp = require('jimp');

/**
 * PIPELINE SIMPLIFICADO DE PROCESAMIENTO DE IMÁGENES
 * 
 * Usa solo Sharp (sin Jimp) para máxima compatibilidad
 */

async function processDocumentForInspection(imageBuffer, documentType, side = 'front') {
    try {
        console.log('\n╔══════════════════════════════════════╗');
        console.log('║  PROCESAMIENTO DE IMAGEN V2 (SHARP) ║');
        console.log('╚══════════════════════════════════════╝');
        console.log('Tipo:', documentType, '| Lado:', side);

        // PASO 1: Análisis inicial
        console.log('\n[1/6] Analizando imagen original...');
        const metadata = await sharp(imageBuffer).metadata();
        console.log(`   Dimensiones: ${metadata.width}x${metadata.height}`);

        // PASO 2: Convertir a fotocopia (blanco y negro puro)
        console.log('\n[2/6] Convirtiendo a fotocopia...');
        let processed = await sharp(imageBuffer)
            .rotate() // Auto-rotar según EXIF
            .resize(3000, 3000, {
                fit: 'inside',
                withoutEnlargement: true
            })
            .greyscale()
            .normalise() // Maximizar contraste
            .linear(1.5, -(128 * 0.5)) // Aumentar contraste más
            .toBuffer();

        console.log('   ✓ Imagen convertida a escala de grises con alto contraste');

        // PASO 3: Separar triplicados si aplica
        console.log('\n[3/6] Procesando formato del documento...');
        let certificate = sharp(processed);

        if (['PERMISO_CIRCULACION', 'REVISION_TECNICA', 'SOAP'].includes(documentType)) {
            console.log('   Separando triplicados...');
            const meta = await sharp(processed).metadata();
            const sectionHeight = Math.floor(meta.height / 3);

            certificate = sharp(processed).extract({
                left: 0,
                top: sectionHeight,
                width: meta.width,
                height: sectionHeight
            });

            console.log(`   ✓ Certificado del medio extraído (${meta.width}x${sectionHeight})`);
        } else {
            console.log('   Sin triplicados (Padrón)');
        }

        // PASO 4: Redimensionar a tamaño estándar
        console.log('\n[4/6] Redimensionando...');
        const finalProcessed = await certificate
            .resize(1200, null, {
                fit: 'inside',
                withoutEnlargement: false
            })
            .jpeg({ quality: 95 })
            .toBuffer();

        const finalMeta = await sharp(finalProcessed).metadata();
        console.log(`   ✓ Dimensiones finales: ${finalMeta.width}x${finalMeta.height}`);

        // PASO 5: Extraer QR CODE
        console.log('\n[5/6] Buscando código QR...');
        const qrResult = await extractQRCode(finalProcessed);

        if (qrResult.data) {
            console.log(`   ✓ QR detectado: ${qrResult.data.substring(0, 60)}...`);
        } else {
            console.log('   ⚠️ No se detectó QR');
        }

        // PASO 6: Generar thumbnail
        console.log('\n[6/6] Generando thumbnail...');
        const thumbnail = await sharp(finalProcessed)
            .resize(400, 300, { fit: 'inside' })
            .jpeg({ quality: 85 })
            .toBuffer();

        console.log('\n✅ Procesamiento completado exitosamente');
        console.log('╚══════════════════════════════════════╝\n');

        return {
            success: true,
            processed: finalProcessed,
            qrImage: qrResult.image,
            qrData: qrResult.data,
            thumbnail: thumbnail,
            metadata: {
                width: finalMeta.width,
                height: finalMeta.height,
                hasQR: !!qrResult.data,
                side: side,
                format: 'jpeg'
            }
        };

    } catch (error) {
        console.error('\n❌ ERROR EN PROCESAMIENTO:', error.message);
        console.error('Stack:', error.stack);

        // Fallback: imagen con mejora básica
        try {
            console.log('\n⚠️ Aplicando fallback...');
            const fallback = await sharp(imageBuffer)
                .greyscale()
                .normalise()
                .resize(1200, null, { fit: 'inside' })
                .jpeg({ quality: 90 })
                .toBuffer();

            const meta = await sharp(fallback).metadata();

            return {
                success: true, // Cambiar a true para que funcione el fallback
                processed: fallback,
                qrImage: null,
                qrData: null,
                thumbnail: fallback,
                metadata: { width: meta.width, height: meta.height, hasQR: false },
                warning: 'Procesamiento básico aplicado: ' + error.message
            };
        } catch (fallbackError) {
            throw new Error('Error crítico: ' + error.message);
        }
    }
}

/**
 * Extraer código QR de la imagen
 */
async function extractQRCode(buffer) {
    try {
        // Convertir buffer a imagen compatible con jsQR
        const image = await Jimp.read(buffer);

        const imageData = {
            data: new Uint8ClampedArray(image.bitmap.data),
            width: image.bitmap.width,
            height: image.bitmap.height
        };

        // Detectar QR con jsQR
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert'
        });

        if (!code) {
            return { image: null, data: null };
        }

        // Extraer región del QR con margen
        const margin = 20;
        const bounds = {
            x: Math.max(0, Math.floor(code.location.topLeftCorner.x) - margin),
            y: Math.max(0, Math.floor(code.location.topLeftCorner.y) - margin),
            width: Math.min(
                image.bitmap.width,
                Math.ceil(code.location.bottomRightCorner.x - code.location.topLeftCorner.x) + margin * 2
            ),
            height: Math.min(
                image.bitmap.height,
                Math.ceil(code.location.bottomRightCorner.y - code.location.topLeftCorner.y) + margin * 2
            )
        };

        // Extraer y ampliar QR a 400x400
        const qrBuffer = await sharp(buffer)
            .extract({
                left: bounds.x,
                top: bounds.y,
                width: bounds.width,
                height: bounds.height
            })
            .resize(400, 400, {
                fit: 'contain',
                background: { r: 255, g: 255, b: 255 }
            })
            .png()
            .toBuffer();

        return {
            image: qrBuffer,
            data: code.data
        };

    } catch (error) {
        console.error('   Error extrayendo QR:', error.message);
        return { image: null, data: null };
    }
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

    console.log('\n✅ Ambas caras del Padrón procesadas');

    return { front, back };
}

module.exports = {
    processDocumentForInspection,
    processPadronDocument
};
