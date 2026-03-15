const admin = require('firebase-admin');

const db = admin.firestore();
const storage = admin.storage();

/**
 * Guarda documento en historial (nueva versión o renovación)
 * Al guardar, marca automáticamente versiones anteriores como "expired"
 * NOTA: Esta es una reescritura completa de la función original
 */
async function saveDocumentToFirebase(documentData) {
    const {
        vehicleId,
        userId,
        familyGroup,
        type,
        data,
        extractedData,      // Datos crudos de la IA (antes de revisión del usuario)
        reviewedData,       // Datos confirmados/corregidos por el usuario
        qrCodes,
        qrData,             // Contenido del QR como string plano
        images, // { processed: Buffer, qr: Buffer, thumbnail: Buffer }
        issueDate,
        expiryDate,
        issueLocation,
        issueEntity,
        notes,
        processingVersion   // 'V3', 'V3_FALLBACK_SHARP', 'V1'
    } = documentData;

    try {
        console.log(`[FirebaseService] Guardando documento ${type} para vehículo ${vehicleId}`);

        // 1. Crear entrada en historial primero para obtener el ID
        const historyRef = await db
            .collection('vehicles')
            .doc(vehicleId)
            .collection('documentTypes')
            .doc(type)
            .collection('history')
            .add({
                issueDate: issueDate ? new Date(issueDate) : new Date(),
                expiryDate: expiryDate ? new Date(expiryDate) : null,
                issueLocation: issueLocation || '',
                issueEntity: issueEntity || '',
                status: 'current',
                // Campo legacy (mantener para compatibilidad)
                data: reviewedData || data,
                // Campos separados para trazabilidad
                extractedData: extractedData || null,
                reviewedData: reviewedData || data || null,
                qrData: qrData || (qrCodes && qrCodes[0]?.data) || null,
                qrCodes,
                processingMetadata: {
                    version: processingVersion || 'V1',
                    capturedAt: new Date().toISOString()
                },
                images: {}, // Se actualizará después de subir imágenes
                captureDate: new Date(),
                capturedBy: userId,
                notes: notes || '',
                createdAt: new Date()
            });

        console.log(`[FirebaseService] Documento guardado en historial: ${historyRef.id}`);

        // 2. Subir imágenes a Storage con el historyId
        const imageUrls = await uploadDocumentImages(vehicleId, type, historyRef.id, images);

        // 3. Actualizar documento con URLs de imágenes
        await historyRef.update({
            images: imageUrls
        });

        // 4. Actualizar documento de tipo para apuntar al actual
        await db
            .collection('vehicles')
            .doc(vehicleId)
            .collection('documentTypes')
            .doc(type)
            .set({
                type,
                currentDocumentId: historyRef.id,
                lastUpdated: new Date()
            }, { merge: true });

        // 5. Marcar documentos anteriores como expired
        await markPreviousDocumentsAsExpired(vehicleId, type, historyRef.id);

        return historyRef.id;

    } catch (error) {
        console.error('[FirebaseService] Error guardando documento:', error);
        throw error;
    }
}

/**
 * Sube 3 imágenes a Storage y retorna URLs permanentes
 * Si images.qr es null, no sube ese archivo
 */
async function uploadDocumentImages(vehicleId, type, historyId, images) {
    const bucket = storage.bucket();
    const basePath = `documents/${vehicleId}/${type}/${historyId}`;

    const imageUrls = {};

    // Subir imagen procesada B&W (obligatoria)
    if (images.processed) {
        const processedFile = bucket.file(`${basePath}/processed.jpg`);
        await processedFile.save(images.processed, {
            metadata: { contentType: 'image/jpeg' }
        });
        await processedFile.makePublic();
        imageUrls.processed = processedFile.publicUrl();
    }

    // Subir imagen a color (frente)
    if (images.colorProcessed) {
        const colorFile = bucket.file(`${basePath}/color.jpg`);
        await colorFile.save(images.colorProcessed, { metadata: { contentType: 'image/jpeg' } });
        await colorFile.makePublic();
        imageUrls.color = colorFile.publicUrl();
    } else {
        imageUrls.color = null;
    }

    // Subir reverso a color (solo para Padrón de 2 caras)
    if (images.colorBack) {
        const backFile = bucket.file(`${basePath}/back.jpg`);
        await backFile.save(images.colorBack, { metadata: { contentType: 'image/jpeg' } });
        await backFile.makePublic();
        imageUrls.back = backFile.publicUrl();
    } else {
        imageUrls.back = null;
    }

    // Subir QR solo si existe
    if (images.qr) {
        const qrFile = bucket.file(`${basePath}/qr.jpg`);
        await qrFile.save(images.qr, {
            metadata: { contentType: 'image/jpeg' }
        });
        await qrFile.makePublic();
        imageUrls.qr = qrFile.publicUrl();
    } else {
        imageUrls.qr = null;
    }

    // Subir thumbnail (obligatorio)
    if (images.thumbnail) {
        const thumbnailFile = bucket.file(`${basePath}/thumbnail.jpg`);
        await thumbnailFile.save(images.thumbnail, {
            metadata: { contentType: 'image/jpeg' }
        });
        await thumbnailFile.makePublic();
        imageUrls.thumbnail = thumbnailFile.publicUrl();
    }

    console.log(`[FirebaseService] Imágenes subidas: ${Object.keys(imageUrls).filter(k => imageUrls[k] !== null).length}`);
    return imageUrls;
}

/**
 * Marca documentos anteriores del mismo tipo como "expired"
 */
async function markPreviousDocumentsAsExpired(vehicleId, type, currentDocId) {
    const historyRef = db
        .collection('vehicles')
        .doc(vehicleId)
        .collection('documentTypes')
        .doc(type)
        .collection('history');

    const previousDocs = await historyRef
        .where('status', '==', 'current')
        .get();

    const batch = db.batch();
    let markedCount = 0;

    previousDocs.forEach(doc => {
        if (doc.id !== currentDocId) {
            batch.update(doc.ref, {
                status: 'expired',
                archivedAt: new Date()
            });
            markedCount++;
        }
    });

    if (markedCount > 0) {
        await batch.commit();
        console.log(`[FirebaseService] ${markedCount} documentos marcados como expired`);
    }
}

/**
 * Obtiene historial completo de un tipo de documento
 */
async function getDocumentHistory(vehicleId, documentType, familyGroup) {
    try {
        // Verificar acceso
        const vehicleDoc = await db.collection('vehicles').doc(vehicleId).get();
        if (!vehicleDoc.exists || vehicleDoc.data().familyGroup !== familyGroup) {
            throw new Error('Acceso denegado');
        }

        const historySnapshot = await db
            .collection('vehicles')
            .doc(vehicleId)
            .collection('documentTypes')
            .doc(documentType)
            .collection('history')
            .orderBy('issueDate', 'desc')
            .get();

        const history = historySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            issueDate: doc.data().issueDate?.toDate().toISOString(),
            expiryDate: doc.data().expiryDate?.toDate().toISOString(),
            captureDate: doc.data().captureDate?.toDate().toISOString()
        }));

        console.log(`[FirebaseService] Historial obtenido: ${history.length} documentos`);
        return history;

    } catch (error) {
        console.error('[FirebaseService] Error obteniendo historial:', error);
        throw error;
    }
}

/**
 * Obtiene solo documentos VIGENTES (status: current)
 */
async function getCurrentDocuments(vehicleId, familyGroup) {
    try {
        const vehicleDoc = await db.collection('vehicles').doc(vehicleId).get();
        if (!vehicleDoc.exists || vehicleDoc.data().familyGroup !== familyGroup) {
            throw new Error('Acceso denegado');
        }

        // Check all possible type names (canonical + legacy aliases)
        const documentTypes = ['PADRON', 'REVISION', 'PERMISO', 'SOAP', 'REVISION_TECNICA', 'PERMISO_CIRCULACION'];
        // Normalize legacy names to frontend-canonical names
        const legacyAlias = { REVISION_TECNICA: 'REVISION', PERMISO_CIRCULACION: 'PERMISO' };

        const currentDocuments = [];
        const seenTypes = new Set(); // avoid duplicates if both REVISION and REVISION_TECNICA exist

        for (const type of documentTypes) {
            const canonicalType = legacyAlias[type] || type;
            if (seenTypes.has(canonicalType)) continue;

            const typeDoc = await db
                .collection('vehicles')
                .doc(vehicleId)
                .collection('documentTypes')
                .doc(type)
                .get();

            if (!typeDoc.exists || !typeDoc.data().currentDocumentId) {
                continue;
            }

            const currentDocId = typeDoc.data().currentDocumentId;
            const docSnapshot = await db
                .collection('vehicles')
                .doc(vehicleId)
                .collection('documentTypes')
                .doc(type)
                .collection('history')
                .doc(currentDocId)
                .get();

            if (docSnapshot.exists) {
                const docData = docSnapshot.data();
                seenTypes.add(canonicalType);
                currentDocuments.push({
                    id: docSnapshot.id,
                    type: canonicalType,   // always return frontend canonical type
                    ...docData,
                    issueDate: docData.issueDate?.toDate().toISOString(),
                    expiryDate: docData.expiryDate?.toDate().toISOString(),
                    status: calculateDocumentStatus(docData.expiryDate)
                });
            }
        }

        return currentDocuments;

    } catch (error) {
        console.error('[FirebaseService] Error obteniendo documentos actuales:', error);
        throw error;
    }
}

/**
 * Calcula status dinámico basado en fecha de vencimiento
 */
function calculateDocumentStatus(expiryDate) {
    if (!expiryDate) return 'permanent';

    const now = new Date();
    const expiry = expiryDate.toDate ? expiryDate.toDate() : new Date(expiryDate);
    const daysUntilExpiry = Math.floor((expiry - now) / (1000 * 60 * 60 * 24));

    if (daysUntilExpiry < 0) return 'expired';
    if (daysUntilExpiry <= 30) return 'about_to_expire';
    return 'active';
}

async function getFamilyVehicles(familyGroup) {
    const snapshot = await db
        .collection('vehicles')
        .where('familyGroup', '==', familyGroup)
        // .orderBy('createdAt', 'desc') // Deshabilitado para evitar error de indice en dev
        .get();

    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function getVehicleDocuments(vehicleId, familyGroup) {
    // Redirige a getCurrentDocuments que lee la estructura correcta
    return getCurrentDocuments(vehicleId, familyGroup);
}

/**
 * Crea vehículo (foto opcional)
 */
async function createVehicle(vehicleData, photoBuffer = null) {
    try {
        const {
            familyGroup,
            householdId,
            patente,
            vin,
            propietario,
            marca,
            modelo,
            año,
            anio,
            color
        } = vehicleData;

        let photoURL = null;
        if (photoBuffer) {
            const bucket = storage.bucket();
            const fileName = `vehicles/photos/${Date.now()}_${patente}.jpg`;
            const file = bucket.file(fileName);

            await file.save(photoBuffer, {
                metadata: { contentType: 'image/jpeg' }
            });
            await file.makePublic();
            photoURL = file.publicUrl();
        }

        const vehicleRef = await db.collection('vehicles').add({
            familyGroup: familyGroup || householdId,
            patente: (patente || 'SIN-PATENTE').toUpperCase(),
            vin: (vin || '').toUpperCase(),
            propietario: propietario || '',
            marca: marca || '',
            modelo: modelo || '',
            año: año || anio || '',
            color: color || '',
            photoURL,
            createdAt: new Date(),
            status: 'active'
        });

        console.log('[FirebaseService] Vehículo creado:', vehicleRef.id);
        return vehicleRef.id;

    } catch (error) {
        console.error('[FirebaseService] Error creando vehículo:', error);
        throw error;
    }
}

async function deleteVehicle(vehicleId, familyGroup) {
    const docRef = db.collection('vehicles').doc(vehicleId);
    const doc = await docRef.get();

    if (!doc.exists || doc.data().familyGroup !== familyGroup) {
        throw new Error('Vehicle not found or access denied');
    }

    const bucket = storage.bucket();
    const docTypes = ['PADRON', 'PERMISO_CIRCULACION', 'REVISION_TECNICA', 'SOAP'];

    // 1. Borrar historial de cada tipo de documento + archivos en Storage
    for (const type of docTypes) {
        const historySnap = await docRef
            .collection('documentTypes').doc(type)
            .collection('history').get();

        const batch = db.batch();
        for (const histDoc of historySnap.docs) {
            // Borrar archivos de Storage (processed, qr, thumbnail)
            const basePath = `documents/${vehicleId}/${type}/${histDoc.id}`;
            await Promise.allSettled([
                bucket.file(`${basePath}/processed.jpg`).delete(),
                bucket.file(`${basePath}/color.jpg`).delete(),
                bucket.file(`${basePath}/back.jpg`).delete(),
                bucket.file(`${basePath}/qr.jpg`).delete(),
                bucket.file(`${basePath}/thumbnail.jpg`).delete()
            ]);
            batch.delete(histDoc.ref);
        }
        if (!historySnap.empty) await batch.commit();

        // Borrar el doc del tipo
        await docRef.collection('documentTypes').doc(type).delete();
    }

    // 2. Borrar foto del vehículo de Storage
    const photoURL = doc.data().photoURL;
    if (photoURL) {
        try {
            // Extraer path del URL y borrar
            const url = new URL(photoURL);
            const filePath = decodeURIComponent(url.pathname.split('/o/')[1]?.split('?')[0]);
            if (filePath) await bucket.file(filePath).delete();
        } catch (e) {
            console.warn('[FirebaseService] No se pudo borrar foto del vehículo:', e.message);
        }
    }

    // 3. Borrar el documento raíz del vehículo
    await docRef.delete();

    console.log(`[FirebaseService] Vehículo ${vehicleId} y todos sus datos eliminados.`);
    return true;
}

/**
 * Obtiene todos los vehículos de una familia con status de documentos.
 * Usa Promise.all para lecturas paralelas (antes era secuencial → muy lento).
 */
async function getFamilyVehiclesWithStatus(familyGroup) {
    try {
        const vehiclesSnapshot = await db.collection('vehicles')
            .where('familyGroup', '==', familyGroup)
            .get();

        if (vehiclesSnapshot.empty) return [];

        const CANONICAL_TYPES = ['PADRON', 'REVISION', 'PERMISO', 'SOAP'];
        const LEGACY_ALIAS = { REVISION_TECNICA: 'REVISION', PERMISO_CIRCULACION: 'PERMISO' };
        // Buscar también los nombres legacy por si hay datos históricos
        const ALL_TYPES = [...CANONICAL_TYPES, 'REVISION_TECNICA', 'PERMISO_CIRCULACION'];

        const vehicles = await Promise.all(vehiclesSnapshot.docs.map(async (doc) => {
            const vehicleData = { id: doc.id, ...doc.data() };

            // Leer todos los tipos de documento en paralelo
            const typeResults = await Promise.all(ALL_TYPES.map(async (type) => {
                try {
                    const typeRef = db.collection('vehicles').doc(doc.id)
                        .collection('documentTypes').doc(type);
                    const typeDoc = await typeRef.get();
                    if (!typeDoc.exists || !typeDoc.data().currentDocumentId) return null;

                    const currentDoc = await typeRef
                        .collection('history')
                        .doc(typeDoc.data().currentDocumentId)
                        .get();
                    if (!currentDoc.exists) return null;

                    const docData = currentDoc.data();
                    const canonicalType = LEGACY_ALIAS[type] || type;
                    return {
                        canonicalType,
                        status: calculateDocumentStatus(docData.expiryDate),
                        expiryDate: docData.expiryDate ? docData.expiryDate.toDate().toISOString() : null
                    };
                } catch (_) {
                    return null;
                }
            }));

            // Consolidar evitando duplicados (REVISION_TECNICA y REVISION → mismo slot)
            const documentStatus = {};
            typeResults.filter(Boolean).forEach(r => {
                if (!documentStatus[r.canonicalType]) {
                    documentStatus[r.canonicalType] = { status: r.status, expiryDate: r.expiryDate };
                }
            });

            vehicleData.documentStatus = documentStatus;
            return vehicleData;
        }));

        return vehicles;
    } catch (error) {
        console.error('Error en getFamilyVehiclesWithStatus:', error);
        throw error;
    }
}

/**
 * Elimina completamente un tipo de documento (todo el historial + Storage)
 */
async function deleteDocumentType(vehicleId, type, familyGroup) {
    const vehicleDoc = await db.collection('vehicles').doc(vehicleId).get();
    if (!vehicleDoc.exists || vehicleDoc.data().familyGroup !== familyGroup) {
        throw new Error('Vehicle not found or access denied');
    }

    const bucket = storage.bucket();
    const typeRef = db.collection('vehicles').doc(vehicleId).collection('documentTypes').doc(type);

    // 1. Borrar historial + archivos Storage
    const historySnap = await typeRef.collection('history').get();
    const batch = db.batch();
    for (const histDoc of historySnap.docs) {
        const basePath = `documents/${vehicleId}/${type}/${histDoc.id}`;
        await Promise.allSettled([
            bucket.file(`${basePath}/processed.jpg`).delete(),
            bucket.file(`${basePath}/color.jpg`).delete(),
            bucket.file(`${basePath}/back.jpg`).delete(),
            bucket.file(`${basePath}/qr.jpg`).delete(),
            bucket.file(`${basePath}/thumbnail.jpg`).delete()
        ]);
        batch.delete(histDoc.ref);
    }
    if (!historySnap.empty) await batch.commit();

    // 2. Borrar el documento del tipo
    await typeRef.delete();

    console.log(`[FirebaseService] Documento ${type} del vehículo ${vehicleId} eliminado completamente.`);
    return true;
}

// Exportar todas las funciones (legacy + nuevas)
module.exports = {
    // Función principal (reescrita)
    saveDocumentToFirebase,

    // Funciones de historial (nuevas)
    getDocumentHistory,
    getCurrentDocuments,
    getFamilyVehiclesWithStatus,
    calculateDocumentStatus,

    // Funciones legacy (mantener para compatibilidad)
    getFamilyVehicles,
    getVehicleDocuments,
    createVehicle,
    deleteVehicle,
    deleteDocumentType
};
