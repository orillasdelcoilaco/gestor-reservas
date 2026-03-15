const express = require('express');
const multer = require('multer');
const { checkFirebaseToken } = require('../utils/authMiddleware');
const { extractVehicleDocumentData } = require('../services/vehicleDocs/aiService');
const { processDocumentForInspection } = require('../services/vehicleDocs/imageProcessingService');
const { processDocumentForInspection: processDocumentV2 } = require('../services/vehicleDocs/imageProcessingServiceV2');
const { processDocumentForInspection: processDocumentV3 } = require('../services/vehicleDocs/imageProcessingServiceV3');
const {
    saveDocumentToFirebase,
    getVehicleDocuments,
    createVehicle,
    deleteVehicle,
    deleteDocumentType
} = require('../services/vehicleDocs/firebaseService');

const router = express.Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }
});

// Middleware: verificar que el usuario tiene permiso vehicleDocs
const checkVehicleDocsPermission = async (req, res, next) => {
    // Permitir acceso sin auth al endpoint de prueba
    if (req.path === '/test-extract') return next();

    try {
        console.log('[VehicleDocs Auth] Checking vehicle docs permission...');
        console.log('[VehicleDocs Auth] Session exists:', !!req.session);
        console.log('[VehicleDocs Auth] User in session:', req.session?.user?.email);
        console.log('[VehicleDocs Auth] req.user exists:', !!req.user);
        console.log('[VehicleDocs Auth] req.user.email:', req.user?.email);
        console.log('[VehicleDocs Auth] req.user.uid:', req.user?.uid);

        // El middleware checkFirebaseToken ya pobló req.user con el decodedToken
        if (!req.user || !req.user.uid) {
            console.log('[VehicleDocs Auth] DENIED - No user UID found');
            return res.status(403).json({
                success: false,
                error: 'No tienes permisos para acceder a Vehicle Docs (no authenticated)'
            });
        }

        // Caso mock-token: permisos ya vienen en req.user (sin Firestore)
        if (req.user.uid === 'mock-uid' && req.user.permissions?.vehicleDocs && req.user.familyGroup) {
            console.log('[VehicleDocs Auth] ✅ MOCK USER - acceso aprobado');
            return next();
        }

        const userUid = req.user.uid;
        const userEmail = req.user.email;
        console.log('[VehicleDocs Auth] Checking permissions for UID:', userUid, 'Email:', userEmail);

        // Verificar permisos en Firestore usando UID como document ID
        const admin = require('firebase-admin');
        const db = admin.firestore();
        const userDoc = await db.collection('users').doc(userUid).get();

        if (!userDoc.exists) {
            console.log('[VehicleDocs Auth] DENIED - User document not found in Firestore for UID:', userUid);
            return res.status(403).json({
                success: false,
                error: 'Usuario no encontrado en el sistema'
            });
        }

        const userData = userDoc.data();
        console.log('[VehicleDocs Auth] User permissions:', userData.permissions);
        console.log('[VehicleDocs Auth] Family group:', userData.familyGroup);

        if (!userData.permissions || !userData.permissions.vehicleDocs) {
            console.log('[VehicleDocs Auth] DENIED - No vehicleDocs permission');
            return res.status(403).json({
                success: false,
                error: 'No tienes permisos para acceder a Vehicle Docs'
            });
        }

        if (!userData.familyGroup) {
            console.log('[VehicleDocs Auth] DENIED - No family group assigned');
            return res.status(403).json({
                success: false,
                error: 'No tienes un grupo familiar asignado'
            });
        }

        console.log('[VehicleDocs Auth] ✅ APPROVED - User has access');

        // Agregar información al request para uso posterior
        req.user.permissions = userData.permissions;
        req.user.familyGroup = userData.familyGroup;

        next();
    } catch (error) {
        console.error('[VehicleDocs Auth] ERROR:', error);
        res.status(500).json({
            success: false,
            error: 'Error verificando permisos',
            details: error.message
        });
    }
};

// ========================================
// TEST ENDPOINT (Sin autenticación)
// ========================================
router.post('/test-image-processing', upload.fields([
    { name: 'document', maxCount: 1 },
    { name: 'qrImage', maxCount: 1 }
]), async (req, res) => {
    try {
        console.log('\n╔══════════════════════════════════════╗');
        console.log('║  DIAGNÓSTICO: PROCESAMIENTO IMAGEN  ║');
        console.log('╚══════════════════════════════════════╝');

        console.log('[DEBUG] Files:', Object.keys(req.files || {}));
        console.log('[DEBUG] Body:', req.body);

        const documentFile = req.files['document'] ? req.files['document'][0] : null;
        const qrImageFile = req.files['qrImage'] ? req.files['qrImage'][0] : null;

        if (!documentFile) {
            console.error('[DEBUG] ❌ No document file found in req.files');
            return res.status(400).json({
                success: false,
                message: 'No se recibió ninguna imagen de documento'
            });
        }

        const documentType = req.body.documentType || 'PADRON';

        console.log('[DEBUG] Documento:', documentFile.originalname, `(${documentFile.size} bytes)`);
        if (qrImageFile) {
            console.log('[DEBUG] QR Manual:', qrImageFile.originalname, `(${qrImageFile.size} bytes)`);
        }
        console.log('[DEBUG] Tipo:', documentType);

        console.log('[DEBUG] → Llamando a processDocumentV3...');
        // PROCESAR IMAGEN con V3 (OpenCV Docker)
        const result = await processDocumentV3(
            documentFile.buffer,
            documentType,
            'front',
            qrImageFile ? qrImageFile.buffer : null
        );
        console.log('[DEBUG] ✅ processDocumentV3 retornó éxito');

        // Convertir buffers a base64 para preview en navegador
        const response = {
            success: result.success,
            processing: {
                qrDetected: !!result.qrData,
                qrContent: result.qrData,
                warning: result.warning,
                metadata: result.metadata
            },
            images: {
                // Imagen procesada (fotocopia)
                processed: `data:image/jpeg;base64,${result.processed.toString('base64')}`,

                // QR extraído (si existe)
                qr: result.qrImage ? `data:image/png;base64,${result.qrImage.toString('base64')}` : null,

                // Thumbnail
                thumbnail: `data:image/jpeg;base64,${result.thumbnail.toString('base64')}`
            }
        };

        console.log('\n✅ Procesamiento completado exitosamente');
        console.log('Resultado:', {
            success: result.success,
            qrDetectado: !!result.qrData,
            dimensiones: `${result.metadata.width}x${result.metadata.height}`
        });

        res.json(response);

    } catch (error) {
        console.error('\n❌ ERROR EN PROCESAMIENTO:', error);
        res.status(500).json({
            success: false,
            message: 'Error procesando imagen',
            error: error.message
        });
    }
});

// Aplicar Firebase auth a todas las rutas (excepto test-image-processing que está antes de este punto)
router.use(checkFirebaseToken);
router.use(checkVehicleDocsPermission);

// 1. Extract Data with Full Processing Pipeline
router.post('/extract', upload.single('document'), async (req, res) => {
    console.log('\n=== INICIO PROCESAMIENTO DE DOCUMENTO ===');
    console.log('[Extract] Tipo documento esperado:', req.body.expectedDocType);
    console.log('[Extract] Tamaño archivo:', req.file?.size, 'bytes');
    console.log('[Extract] Tipo archivo:', req.file?.mimetype);

    try {
        if (!req.file) {
            throw new Error('No se recibió ningún archivo');
        }

        const expectedDocType = req.body.expectedDocType || 'OTRO';

        // PASO 1: Procesar imagen — intentar V3 (OpenCV Docker), fallback a V1 (Sharp+jsQR)
        let processed;
        let processingVersion;

        try {
            console.log('[1/3] Procesando imagen con V3 (OpenCV Docker)...');
            processed = await processDocumentV3(req.file.buffer, expectedDocType, 'front');
            processingVersion = processed.metadata?.warning ? 'V3_FALLBACK_SHARP' : 'V3';
            console.log('[1/3] ✅ V3 completado, versión:', processingVersion);
        } catch (v3Error) {
            console.warn('[1/3] ⚠️ V3 falló, usando V1 (Sharp+jsQR):', v3Error.message);
            processed = await processDocumentForInspection(req.file.buffer, expectedDocType, 'front');
            processingVersion = 'V1';
            console.log('[1/3] ✅ V1 completado');
        }

        console.log('[1/3] Resultado procesamiento:', {
            success: processed.success,
            version: processingVersion,
            qrDetected: processed.qrData ? 'Sí' : 'No',
            qrContent: processed.qrData ? processed.qrData.substring(0, 50) + '...' : null,
            width: processed.metadata?.width,
            height: processed.metadata?.height,
            warning: processed.warning
        });

        // PASO 2: Extraer datos con Gemini AI
        // Usar imagen a color recortada (mejor OCR que B&W). Si no hay color de OpenCV,
        // aplicar el mismo multi-copy crop con Sharp sobre el original.
        console.log('[2/3] Preparando imagen para Gemini...');
        let imageForGemini = processed.colorProcessed || null;
        if (!imageForGemini) {
            try {
                const sharp = require('sharp');
                const MULTI_COPY = ['REVISION', 'PERMISO', 'SOAP', 'REVISION_TECNICA', 'PERMISO_CIRCULACION'];
                const meta = await sharp(req.file.buffer).metadata();
                const ratioHW = meta.height / meta.width;
                let pipeline = sharp(req.file.buffer);
                if (MULTI_COPY.includes(expectedDocType) && ratioHW > 0.8) {
                    const copies = ratioHW > 1.2 ? 4 : 3;
                    const sliceH = Math.floor(meta.height / copies);
                    pipeline = pipeline.extract({ left: 0, top: sliceH, width: meta.width, height: sliceH });
                }
                imageForGemini = await pipeline
                    .resize(1200, null, { fit: 'inside', withoutEnlargement: true })
                    .jpeg({ quality: 92 })
                    .toBuffer();
                console.log('[2/3] Color/crop generado con Sharp como fallback');
            } catch (e) {
                imageForGemini = processed.processed;
                console.warn('[2/3] Fallback a imagen B&W para Gemini:', e.message);
            }
        }

        console.log('[2/3] Extrayendo datos con Gemini AI...');
        let extractedData = null;
        let aiUnavailable = false;
        try {
            extractedData = await extractVehicleDocumentData(
                imageForGemini,
                processed.qrData ? [processed.qrData] : [],
                expectedDocType
            );
            console.log('[2/3] ✅ Extracción completada:', {
                documentType: extractedData.documentType,
                patente: extractedData.patente || extractedData.data?.patente || 'NO DETECTADA',
                marca: extractedData.data?.marca || 'NO DETECTADA',
                modelo: extractedData.data?.modelo || 'NO DETECTADO'
            });
        } catch (aiError) {
            console.warn('[2/3] ⚠️ IA no disponible, devolviendo modo manual:', aiError.message);
            aiUnavailable = true;
        }

        // Si la IA falló, devolver respuesta parcial para ingreso manual
        if (aiUnavailable) {
            let aiUnavailableImage = null;
            try {
                const sharp = require('sharp');
                const buf = await sharp(req.file.buffer)
                    .resize(1600, null, { fit: 'inside', withoutEnlargement: true })
                    .jpeg({ quality: 90 })
                    .toBuffer();
                aiUnavailableImage = `data:image/jpeg;base64,${buf.toString('base64')}`;
            } catch (e) {
                const fb = processed.colorProcessed || processed.processed;
                aiUnavailableImage = fb ? `data:image/jpeg;base64,${fb.toString('base64')}` : null;
            }
            return res.json({
                success: false,
                aiUnavailable: true,
                qrDetected: !!processed.qrData,
                qrContent: processed.qrData,
                processedImage: aiUnavailableImage,
                qrImage: processed.qrImage ? `data:image/jpeg;base64,${processed.qrImage.toString('base64')}` : null,
            });
        }

        // PASO 3: Preparar respuesta compatible con frontend
        console.log('[3/3] Preparando respuesta para frontend...');

        // El frontend espera los datos en el nivel raíz, no anidados
        const response = {
            success: true,
            type: extractedData.documentType,

            // Campos principales extraídos
            patente: extractedData.patente || extractedData.data?.patente,
            marca: extractedData.data?.marca,
            modelo: extractedData.data?.modelo,
            color: extractedData.data?.color,
            anio: extractedData.data?.anio || extractedData.data?.año,
            numeroMotor: extractedData.data?.numeroMotor,
            vin: extractedData.data?.vin || extractedData.data?.chasis,

            // Fechas
            issueDate: extractedData.data?.fechaEmision || extractedData.metadata?.fechaEmision,
            expiryDate: extractedData.data?.fechaVencimiento || extractedData.metadata?.fechaVencimiento,

            // Metadata completa
            metadata: {
                ...extractedData.metadata,
                ...extractedData.data,
                patente: extractedData.patente || extractedData.data?.patente
            },

            // Info del QR detectado
            qrDetected: !!processed.qrData,
            qrContent: processed.qrData,

            // Imagen para mostrar en frontend: ORIGINAL completa (sin recorte)
            // El recorte solo se usa para Gemini (imageForGemini), nunca para guardar/mostrar
            processedImage: await (async () => {
                try {
                    const sharp = require('sharp');
                    const buf = await sharp(req.file.buffer)
                        .resize(1600, null, { fit: 'inside', withoutEnlargement: true })
                        .jpeg({ quality: 90 })
                        .toBuffer();
                    return `data:image/jpeg;base64,${buf.toString('base64')}`;
                } catch (e) {
                    // fallback: usar processed B&W si sharp falla
                    const fb = processed.colorProcessed || processed.processed;
                    return fb ? `data:image/jpeg;base64,${fb.toString('base64')}` : null;
                }
            })(),
            qrImage: processed.qrImage ? `data:image/jpeg;base64,${processed.qrImage.toString('base64')}` : null,

            // Información adicional del procesamiento
            imageProcessing: {
                success: processed.success,
                warning: processed.warning,
                width: processed.metadata?.width,
                height: processed.metadata?.height,
                processingVersion
            }
        };

        console.log('[3/3] ✅ Respuesta preparada');
        console.log('=== RESPUESTA COMPLETA ===');
        console.log('Tipo:', response.type);
        console.log('Patente:', response.patente);
        console.log('Marca:', response.marca);
        console.log('Modelo:', response.modelo);
        console.log('Color:', response.color);
        console.log('Año:', response.anio);
        console.log('Número Motor:', response.numeroMotor);
        console.log('VIN:', response.vin);
        console.log('Metadata completa:', JSON.stringify(response.metadata, null, 2));
        console.log('=== FIN PROCESAMIENTO ===\n');

        res.json(response);

    } catch (error) {
        console.error('\n❌ ERROR EN PROCESAMIENTO:', error.message);
        console.error('Stack:', error.stack);
        console.log('=== FIN PROCESAMIENTO (CON ERROR) ===\n');

        res.status(500).json({
            success: false,
            message: 'Error procesando documento',
            error: error.message
        });
    }
});

// 2. Save Document (After user review) - UPDATED
const uploadFields = upload.fields([
    { name: 'file',     maxCount: 1 },
    { name: 'fileBack', maxCount: 1 },
    { name: 'qrFile',   maxCount: 1 }
]);

router.post('/documents', uploadFields, async (req, res) => {
    try {
        const {
            vehicleId,
            type,
            data,
            extractedData: extractedDataRaw,
            processingVersion,
            issueLocation,
            issueEntity,
            notes
        } = req.body;

        const userId = req.user.uid;
        const familyGroup = req.user.familyGroup;

        let parsedReviewedData = {};
        try { parsedReviewedData = JSON.parse(data); } catch (e) { parsedReviewedData = data || {}; }

        let parsedExtractedData = null;
        try { parsedExtractedData = extractedDataRaw ? JSON.parse(extractedDataRaw) : null; } catch (e) {}

        const mainFile  = req.files?.['file']?.[0];
        const backFile  = req.files?.['fileBack']?.[0];
        const qrFileUp  = req.files?.['qrFile']?.[0];
        if (!mainFile) throw new Error('No file provided');

        // Procesar imagen — intentar V3, fallback a V1
        let processed;
        let usedVersion = processingVersion || 'V1';
        try {
            processed = await processDocumentV3(mainFile.buffer, type);
            if (!processingVersion) usedVersion = processed.metadata?.warning ? 'V3_FALLBACK_SHARP' : 'V3';
        } catch (v3Err) {
            console.warn('[VehicleDocs] V3 falló en /documents, usando V1:', v3Err.message);
            processed = await processDocumentForInspection(mainFile.buffer, type);
            if (!processingVersion) usedVersion = 'V1';
        }

        if (!processed.success) {
            console.warn('[VehicleDocs] Procesamiento parcial de imagen');
        }

        // Color image para tarjeta: SIEMPRE imagen original completa (sin recortar).
        // El recorte multi-copy solo se usa para Gemini (en /extract), nunca para almacenamiento.
        const sharp = require('sharp');

        const toColorFull = async (buf) => {
            return sharp(buf)
                .resize(1600, null, { fit: 'inside', withoutEnlargement: true })
                .sharpen({ sigma: 1 })
                .jpeg({ quality: 90 })
                .toBuffer();
        };

        let colorBuffer = null;
        try { colorBuffer = await toColorFull(mainFile.buffer); } catch (e) {
            console.warn('[VehicleDocs] Color image generation failed:', e.message);
        }

        let colorBackBuffer = null;
        if (backFile) {
            try { colorBackBuffer = await toColorFull(backFile.buffer); } catch (e) {}
        }

        // Guardar documento con trazabilidad completa
        const documentId = await saveDocumentToFirebase({
            vehicleId,
            userId,
            familyGroup,
            type,
            data: parsedReviewedData,
            extractedData: parsedExtractedData,
            reviewedData: parsedReviewedData,
            qrCodes: processed.qrData ? [{ data: processed.qrData }] : [],
            qrData: processed.qrData || null,
            images: {
                processed: processed.processed,
                colorProcessed: colorBuffer,
                colorBack: colorBackBuffer,
                qr: qrFileUp ? qrFileUp.buffer : processed.qrImage,
                thumbnail: processed.thumbnail
            },
            issueDate: parsedReviewedData.fechaEmision || parsedReviewedData.issueDate || req.body.issueDate || new Date().toISOString(),
            expiryDate: parsedReviewedData.fechaVencimiento || parsedReviewedData.expiryDate || req.body.expiryDate || null,
            issueLocation: issueLocation || '',
            issueEntity: issueEntity || '',
            notes: notes || '',
            processingVersion: usedVersion
        });

        res.json({ success: true, documentId });
    } catch (error) {
        console.error('[VehicleDocs] Save doc error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 3. Get Vehicles List for Family Group
router.get('/vehicles', async (req, res) => {
    try {
        const familyGroup = req.user.familyGroup;

        if (!familyGroup) {
            return res.json({ success: true, vehicles: [] });
        }

        const { getFamilyVehiclesWithStatus } = require('../services/vehicleDocs/firebaseService');
        const vehicles = await getFamilyVehiclesWithStatus(familyGroup);

        res.json({ success: true, vehicles: vehicles || [] });
    } catch (error) {
        console.error('[VehicleDocs] Get vehicles error:', error);
        res.status(500).json({ success: false, error: error.message, vehicles: [] });
    }
});

// 3b. Get Household Info
router.get('/households', async (req, res) => {
    try {
        const familyGroup = req.user.familyGroup;
        if (!familyGroup) return res.json([]);
        res.json([{ id: familyGroup, name: 'Mi Familia' }]);
    } catch (error) {
        console.error('[VehicleDocs] Get household error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 4. Create Vehicle - UPDATED
router.post('/vehicles', upload.single('photo'), async (req, res) => {
    try {
        const vehicleData = req.body;
        const familyGroup = req.user.familyGroup;

        // Ensure familyGroup is set
        vehicleData.familyGroup = familyGroup;
        vehicleData.householdId = familyGroup;

        // Pass photo buffer if present
        const photoBuffer = req.file ? req.file.buffer : null;

        const vehicleId = await createVehicle(vehicleData, photoBuffer);
        res.json({ success: true, id: vehicleId });
    } catch (error) {
        console.error('[VehicleDocs] Create vehicle error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 4b. Delete Document Type (all history + storage for one doc type)
router.delete('/vehicles/:vehicleId/documents/:type', async (req, res) => {
    try {
        const { vehicleId, type } = req.params;
        const familyGroup = req.user.familyGroup;
        await deleteDocumentType(vehicleId, type, familyGroup);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 4. Delete Vehicle
router.delete('/vehicles/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const familyGroup = req.user.familyGroup;
        await deleteVehicle(id, familyGroup);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 7. Get Documents
router.get('/vehicles/:vehicleId/documents', async (req, res) => { // Legacy path support if needed
    try {
        const { vehicleId } = req.params;
        const familyGroup = req.user.familyGroup;
        const documents = await getVehicleDocuments(vehicleId, familyGroup);
        res.json({ success: true, documents });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Support query param style: /documents?vehicleId=...
router.get('/documents', async (req, res) => {
    try {
        const { vehicleId } = req.query;
        if (!vehicleId) throw new Error('Vehicle ID required');
        const familyGroup = req.user.familyGroup;
        const documents = await getVehicleDocuments(vehicleId, familyGroup);
        res.json(documents); // Return direct array as expected by App.jsx
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 8. Get Document History (NEW)
router.get('/vehicles/:vehicleId/documents/:type/history', async (req, res) => {
    try {
        const { vehicleId, type } = req.params;
        const familyGroup = req.user.familyGroup;

        const { getDocumentHistory } = require('../services/vehicleDocs/firebaseService');
        const history = await getDocumentHistory(vehicleId, type, familyGroup);

        res.json({
            success: true,
            type,
            history
        });

    } catch (error) {
        console.error('[VehicleDocs] Get history error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 9. Get Current Documents (NEW)
router.get('/vehicles/:vehicleId/documents/current', async (req, res) => {
    try {
        const { vehicleId } = req.params;
        const familyGroup = req.user.familyGroup;

        const { getCurrentDocuments } = require('../services/vehicleDocs/firebaseService');
        const documents = await getCurrentDocuments(vehicleId, familyGroup);

        res.json({
            success: true,
            documents
        });

    } catch (error) {
        console.error('[VehicleDocs] Get current docs error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 10. Get Vehicle with Current Documents (NEW)
router.get('/vehicles/:vehicleId', async (req, res) => {
    try {
        const { vehicleId } = req.params;
        const familyGroup = req.user.familyGroup;

        const admin = require('firebase-admin');
        const db = admin.firestore();

        const vehicleDoc = await db.collection('vehicles').doc(vehicleId).get();

        if (!vehicleDoc.exists) {
            return res.status(404).json({ success: false, error: 'Vehículo no encontrado' });
        }

        const vehicleData = vehicleDoc.data();

        if (vehicleData.familyGroup !== familyGroup) {
            return res.status(403).json({ success: false, error: 'Acceso denegado' });
        }

        const { getCurrentDocuments } = require('../services/vehicleDocs/firebaseService');
        const documents = await getCurrentDocuments(vehicleId, familyGroup);

        res.json({
            success: true,
            vehicle: {
                id: vehicleId,
                ...vehicleData
            },
            documents
        });

    } catch (error) {
        console.error('[VehicleDocs] Get vehicle error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});


// Endpoint de prueba con procesamiento completo
router.post('/test-extract', upload.single('document'), async (req, res) => {
    try {
        const { expectedDocType } = req.body;

        console.log('[Test] Recibida imagen, tamaño:', req.file?.size, 'bytes');

        if (!req.file) throw new Error('No document file uploaded');

        // PASO 1: Procesar imagen (detectar bordes, corregir, mejorar)
        console.log('[Test] Procesando imagen...');
        const { processDocumentForInspection } = require('../services/vehicleDocs/imageProcessingService');

        const processed = await processDocumentForInspection(
            req.file.buffer,
            expectedDocType
        );

        if (!processed.success) {
            console.warn('[Test] Procesamiento parcial:', processed.warning);
        }

        // PASO 2: Extraer datos con Gemini (usar imagen procesada)
        console.log('[Test] Extrayendo datos con Gemini...');
        const extractedData = await extractVehicleDocumentData(
            processed.processed, // Imagen procesada, no original
            processed.qrData ? [{ data: processed.qrData }] : [],
            expectedDocType
        );

        console.log('[Test] Extracción exitosa');

        res.json({
            success: true,
            extractedData,
            imageProcessing: {
                success: processed.success,
                qrDetected: !!processed.qrData,
                qrContent: processed.qrData?.substring(0, 100),
                warning: processed.warning,
                metadata: processed.metadata
            },
            // Enviar imágenes en base64 para preview en frontend
            images: {
                processed: processed.processed.toString('base64'),
                qr: processed.qrImage ? processed.qrImage.toString('base64') : null,
                thumbnail: processed.thumbnail.toString('base64')
            },
            imageSize: req.file.size,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('[Test] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});



module.exports = router;
