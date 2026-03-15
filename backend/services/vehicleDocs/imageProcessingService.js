const sharp = require('sharp');
const jsQR = require('jsqr');

/**
 * Procesa imagen de documento para fiscalización
 * - Detecta bordes y corrige perspectiva
 * - Separa certificados en triplicados
 * - Mejora contraste y nitidez
 * - Extrae QR code
 * - Genera thumbnail
 */
async function processDocumentForInspection(imageBuffer, documentType, side = 'front') {
    try {
        console.log(`[ImageProc] Procesando ${documentType} (${side})...`);

        // PASO 1: Auto-rotar si está en landscape
        let rotatedBuffer = await autoRotateDocument(imageBuffer);

        // PASO 2: Detectar bordes del documento
        const documentBounds = await detectDocumentBorders(rotatedBuffer);

        // PASO 3: Recortar al área detectada (corrección de perspectiva simplificada)
        const croppedBuffer = await cropToDocument(rotatedBuffer, documentBounds);

        // PASO 4: Para triplicados, separar certificados individuales
        let certificateBuffer;
        if (['PERMISO_CIRCULACION', 'REVISION_TECNICA', 'SOAP'].includes(documentType)) {
            const certificates = await separateTriplicateCertificates(croppedBuffer);
            certificateBuffer = selectBestCertificate(certificates);
        } else {
            certificateBuffer = croppedBuffer;
        }

        // PASO 5: Extraer QR con margen amplio (ANTES de enhance)
        const qrResult = await extractQRWithMargin(certificateBuffer);

        // PASO 6: Mejorar calidad para fiscalización (agresivo)
        const enhancedBuffer = await enhanceForInspection(certificateBuffer);

        // PASO 7: Generar thumbnail para lista
        const thumbnailBuffer = await generateThumbnail(enhancedBuffer);

        console.log('[ImageProc] Procesamiento exitoso');

        return {
            success: true,
            processed: enhancedBuffer,
            qrImage: qrResult?.image || null,
            qrData: qrResult?.data || null,
            thumbnail: thumbnailBuffer,
            metadata: {
                width: (await sharp(enhancedBuffer).metadata()).width,
                height: (await sharp(enhancedBuffer).metadata()).height,
                hasQR: !!qrResult,
                side: side
            }
        };

    } catch (error) {
        console.error('[ImageProc] ❌ ERROR EN PROCESAMIENTO AVANZADOreturn:', error.message);
        console.error('[ImageProc] Stack:', error.stack);

        // Fallback: solo mejora básica sin procesamiento avanzado
        try {
            console.log('[ImageProc] Intentando fallback básico...');
            const basic = await enhanceForInspection(imageBuffer);
            const thumbnail = await generateThumbnail(basic);

            console.log('[ImageProc] ⚠️ Fallback exitoso - procesamiento básico aplicado');

            return {
                success: false,
                processed: basic,
                qrImage: null,
                qrData: null,
                thumbnail: thumbnail,
                warning: `Procesamiento avanzado falló: ${error.message}`
            };
        } catch (fallbackError) {
            console.error('[ImageProc] ❌ FALLBACK TAMBIÉN FALLÓ:', fallbackError.message);
            throw new Error(`Procesamiento falló completamente: ${fallbackError.message}`);
        }
    }
}

/**
 * Rota automáticamente si la imagen está en landscape
 */
async function autoRotateDocument(buffer) {
    const metadata = await sharp(buffer).metadata();

    if (metadata.width > metadata.height) {
        console.log('[ImageProc] Rotando de landscape a portrait');
        return sharp(buffer).rotate(90).toBuffer();
    }

    return buffer;
}

/**
 * Detecta los bordes del documento (algoritmo simplificado con Sharp)
 * Asume que el documento ocupa ~80% de la imagen
 */
async function detectDocumentBorders(buffer) {
    const metadata = await sharp(buffer).metadata();

    // Asumimos que el documento ocupa el centro con margen de ~10%
    const margin = 0.1;

    return {
        left: Math.floor(metadata.width * margin),
        top: Math.floor(metadata.height * margin),
        width: Math.floor(metadata.width * (1 - 2 * margin)),
        height: Math.floor(metadata.height * (1 - 2 * margin))
    };
}

/**
 * Recorta la imagen al área del documento
 */
async function cropToDocument(buffer, bounds) {
    return sharp(buffer)
        .extract({
            left: bounds.left,
            top: bounds.top,
            width: bounds.width,
            height: bounds.height
        })
        .toBuffer();
}

/**
 * Separa certificados individuales en documentos triplicados
 * Los triplicados chilenos tienen 3 secciones horizontales con líneas punteadas
 */
async function separateTriplicateCertificates(buffer) {
    const metadata = await sharp(buffer).metadata();

    // Dividir en 3 secciones horizontales
    const sectionHeight = Math.floor(metadata.height / 3);
    const certificates = [];

    for (let i = 0; i < 3; i++) {
        const top = i * sectionHeight;

        const certBuffer = await sharp(buffer)
            .extract({
                left: 0,
                top: top,
                width: metadata.width,
                height: sectionHeight
            })
            .toBuffer();

        certificates.push({
            buffer: certBuffer,
            index: i
        });
    }

    console.log(`[ImageProc] Separados ${certificates.length} certificados`);
    return certificates;
}

/**
 * Selecciona el mejor certificado (menos borroso)
 * Por ahora usa el del medio, que suele ser el más limpio
 */
function selectBestCertificate(certificates) {
    // Certificado del medio (índice 1 de 0-2)
    const middleIndex = Math.floor(certificates.length / 2);
    console.log(`[ImageProc] Seleccionado certificado ${middleIndex + 1} de ${certificates.length}`);
    return certificates[middleIndex].buffer;
}

/**
 * Mejora agresiva de imagen para verse profesional en fiscalización
 */
async function enhanceForInspection(buffer) {
    return sharp(buffer)
        .resize(1200, null, { // Ancho estándar de 1200px
            fit: 'inside',
            withoutEnlargement: false
        })
        .sharpen({ sigma: 2 }) // Nitidez agresiva
        .normalize() // Auto-contraste
        .linear(1.2, -(128 * 0.2)) // Aumentar contraste manualmente
        .toBuffer();
}

/**
 * Extrae código QR con margen amplio (20px) para que sea escaneable
 */
async function extractQRWithMargin(buffer) {
    try {
        // Convertir a formato raw para jsQR
        const { data, info } = await sharp(buffer)
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });

        // Buscar QR code
        const code = jsQR(new Uint8ClampedArray(data), info.width, info.height);

        if (!code) {
            console.log('[ImageProc] No se detectó QR code');
            return null;
        }

        console.log('[ImageProc] QR detectado:', code.data.substring(0, 50) + '...');

        // Calcular bounding box del QR con margen de 20px
        const margin = 20;
        const loc = code.location;

        const minX = Math.max(0, Math.min(
            loc.topLeftCorner.x,
            loc.bottomLeftCorner.x
        ) - margin);

        const minY = Math.max(0, Math.min(
            loc.topLeftCorner.y,
            loc.topRightCorner.y
        ) - margin);

        const maxX = Math.min(info.width, Math.max(
            loc.topRightCorner.x,
            loc.bottomRightCorner.x
        ) + margin);

        const maxY = Math.min(info.height, Math.max(
            loc.bottomLeftCorner.y,
            loc.bottomRightCorner.y
        ) + margin);

        // Recortar QR con margen
        const qrBuffer = await sharp(buffer)
            .extract({
                left: Math.floor(minX),
                top: Math.floor(minY),
                width: Math.floor(maxX - minX),
                height: Math.floor(maxY - minY)
            })
            // Ampliar QR a 400x400px para que sea más escaneable
            .resize(400, 400, {
                fit: 'contain',
                background: { r: 255, g: 255, b: 255 }
            })
            .toBuffer();

        return {
            image: qrBuffer,
            data: code.data
        };

    } catch (error) {
        console.error('[ImageProc] Error extrayendo QR:', error);
        return null;
    }
}

/**
 * Genera thumbnail de 300x400px para lista de documentos
 */
async function generateThumbnail(buffer) {
    return sharp(buffer)
        .resize(300, 400, { fit: 'cover' })
        .toBuffer();
}

/**
 * Función especial para Padrón (2 caras)
 * Procesa frente y reverso por separado
 */
async function processPadronDocument(frontBuffer, backBuffer) {
    const frontProcessed = await processDocumentForInspection(frontBuffer, 'PADRON', 'front');
    const backProcessed = await processDocumentForInspection(backBuffer, 'PADRON', 'back');

    return {
        front: frontProcessed,
        back: backProcessed
    };
}

module.exports = {
    processDocumentForInspection,
    processPadronDocument
};
