const express = require('express');
const multer = require('multer');
const storageServiceFactory = require('../services/storageService');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

module.exports = (db, bucket) => {
    const router = express.Router();
    const vehiclesRef = db.collection('vehicles');
    const householdsRef = db.collection('households');
    const storageService = storageServiceFactory(bucket);

    // Helper: Get user's households
    // This logic should ideally be in a service, keeping it here for speed/simplicity as requested, 
    // or moving to a service if complex.
    const getUserHouseholds = async (uid) => {
        // Find households where members array contains an object with user's uid
        // Firestore array-contains doesn't work for objects unless exact match.
        // So we iterate ? No, better structure is map or separate collection access.
        // For now, let's assume households is small or we allow any household for the family user in seed.
        // BETTER: Query 'households' where 'members' (array of UIDs) contains uid.
        // User requested "members" to be [{ uid, role }].
        // To query this efficiently, we might need a separate 'memberUids' array field in household.

        // FALLBACK: Since we are in development, we'll list all households and filter in code (inefficient but works for small scale).
        // TODO: Optimize data model by adding 'memberUids' array to household.

        const snapshot = await householdsRef.get();
        const households = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            const members = data.members || [];
            if (members.some(m => m.uid === uid) || data.ownerUid === uid) {
                households.push({ id: doc.id, ...data });
            }
        });
        return households;
    };

    // GET /api/vehicles
    // List all vehicles for the households the user belongs to
    router.get('/', async (req, res) => {
        try {
            const { uid } = req.user;

            // 1. Get User Households
            const userHouseholds = await getUserHouseholds(uid);
            const householdIds = userHouseholds.map(h => h.id);

            if (householdIds.length === 0) {
                return res.json([]);
            }

            // 2. Get Vehicles for those households
            const snapshot = await vehiclesRef.where('householdId', 'in', householdIds).get();
            const vehicles = [];

            for (const doc of snapshot.docs) {
                const data = doc.data();
                let photoUrl = null;
                if (data.photoRef) {
                    try {
                        photoUrl = await storageService.getSignedUrl(data.photoRef);
                    } catch (e) {
                        console.warn('Failed to sign vehicle photo url', e);
                    }
                }
                vehicles.push({ id: doc.id, ...data, photoUrl });
            }

            res.json(vehicles);
        } catch (error) {
            console.error('Error fetching vehicles:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // POST /api/vehicles
    // Create a new vehicle
    router.post('/', upload.single('photo'), async (req, res) => {
        try {
            const { uid } = req.user;
            const { patente, marca, modelo, anio, alias, householdId, color, vin, chassisNum, engineNum } = req.body;

            // Validate access to household
            const userHouseholds = await getUserHouseholds(uid);
            if (!userHouseholds.find(h => h.id === householdId)) {
                return res.status(403).json({ error: 'No tienes acceso a este grupo familiar.' });
            }

            let photoRef = null;
            if (req.file) {
                const uploadResult = await storageService.uploadFile(req.file.buffer, req.file.originalname, 'vehicle-photos');
                photoRef = uploadResult.path;
            }

            const newVehicle = {
                patente: patente.toUpperCase(),
                marca,
                modelo,
                anio: parseInt(anio) || 0,
                alias: alias || '',
                householdId,
                color: color || null,
                vin: vin || null,
                chassisNum: chassisNum || null,
                engineNum: engineNum || null,
                photoRef,
                active: true,
                createdAt: new Date()
            };

            const docRef = await vehiclesRef.add(newVehicle);
            res.status(201).json({ id: docRef.id, ...newVehicle });

        } catch (error) {
            console.error('Error creating vehicle:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // GET /api/vehicles/:id
    router.get('/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const { uid } = req.user;

            const doc = await vehiclesRef.doc(id).get();
            if (!doc.exists) return res.status(404).json({ error: 'Vehículo no encontrado' });

            const data = doc.data();

            // Verify access
            const userHouseholds = await getUserHouseholds(uid);
            if (!userHouseholds.find(h => h.id === data.householdId)) {
                return res.status(403).json({ error: 'Acceso denegado' });
            }

            res.json({ id: doc.id, ...data });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // PUT /api/vehicles/:id
    router.put('/:id', upload.single('photo'), async (req, res) => {
        try {
            const { id } = req.params;
            const { uid } = req.user;
            const updates = req.body;

            const docRef = vehiclesRef.doc(id);
            const doc = await docRef.get();

            if (!doc.exists) return res.status(404).json({ error: 'Vehículo no encontrado' });

            const currentData = doc.data();

            // Verify access
            const userHouseholds = await getUserHouseholds(uid);
            if (!userHouseholds.find(h => h.id === currentData.householdId)) {
                return res.status(403).json({ error: 'Acceso denegado' });
            }

            // Whitelist updates to prevent overwriting critical fields like householdId or id
            const allowedUpdates = ['patente', 'marca', 'modelo', 'anio', 'alias', 'color', 'vin', 'chassisNum', 'engineNum', 'active'];
            const safeUpdates = {};

            allowedUpdates.forEach(field => {
                if (updates[field] !== undefined) safeUpdates[field] = updates[field];
            });

            if (req.file) {
                const uploadResult = await storageService.uploadFile(req.file.buffer, req.file.originalname, 'vehicle-photos');
                safeUpdates.photoRef = uploadResult.path;
            }

            safeUpdates.updatedAt = new Date();

            await docRef.update(safeUpdates);
            res.json({ id, ...currentData, ...safeUpdates });

        } catch (error) {
            console.error('Error updating vehicle:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // DELETE /api/vehicles/:id
    router.delete('/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const { uid } = req.user;

            const docRef = vehiclesRef.doc(id);
            const doc = await docRef.get();

            if (!doc.exists) return res.status(404).json({ error: 'Vehículo no encontrado' });

            const currentData = doc.data();

            // Verify access
            const userHouseholds = await getUserHouseholds(uid);
            if (!userHouseholds.find(h => h.id === currentData.householdId)) {
                return res.status(403).json({ error: 'Acceso denegado' });
            }

            // 1. Delete associated documents
            const docsSnapshot = await db.collection('documents').where('vehicleId', '==', id).get();
            for (const dDoc of docsSnapshot.docs) {
                const data = dDoc.data();
                // Delete files from storage
                if (data.fileRef) await storageService.deleteFile(data.fileRef).catch(() => { });
                if (data.previewRef) await storageService.deleteFile(data.previewRef).catch(() => { });
                if (data.qrRef) await storageService.deleteFile(data.qrRef).catch(() => { });
                // Delete document from Firestore
                await dDoc.ref.delete();
            }

            // 2. Delete vehicle photo from storage
            if (currentData.photoRef) {
                await storageService.deleteFile(currentData.photoRef).catch(() => { });
            }

            // 3. Delete vehicle from Firestore
            await docRef.delete();

            res.json({ message: 'Vehículo y sus documentos eliminados correctamente' });

        } catch (error) {
            console.error('Error deleting vehicle:', error);
            res.status(500).json({ error: error.message });
        }
    });

    return router;
};
