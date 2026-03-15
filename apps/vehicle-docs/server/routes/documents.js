const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const storageServiceFactory = require('../services/storageService');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

const cropImage = async (buffer, box) => {
    // box: [ymin, xmin, ymax, xmax] in 0-1000 normalized
    const metadata = await sharp(buffer).metadata();
    const left = Math.round((box[1] / 1000) * metadata.width);
    const top = Math.round((box[0] / 1000) * metadata.height);
    const width = Math.round(((box[3] - box[1]) / 1000) * metadata.width);
    const height = Math.round(((box[2] - box[0]) / 1000) * metadata.height);

    return await sharp(buffer)
        .extract({ left, top, width, height })
        .toBuffer();
};

module.exports = (db, bucket) => {
    const router = express.Router();
    const documentsRef = db.collection('documents');
    const storageService = storageServiceFactory(bucket);

    // GET /api/documents?vehicleId=...
    router.get('/', async (req, res) => {
        try {
            const { vehicleId } = req.query;
            const { uid } = req.user;

            if (!vehicleId) return res.status(400).json({ error: 'vehicleId required' });

            const snapshot = await documentsRef
                .where('vehicleId', '==', vehicleId)
                .get();

            let docs = [];

            // Helper to sign URLs
            for (const doc of snapshot.docs) {
                const data = doc.data();
                let fileUrl = null;
                let previewUrl = null;
                let qrUrl = null;
                let frontUrl = null;
                let backUrl = null;

                try {
                    if (data.fileRef) fileUrl = await storageService.getSignedUrl(data.fileRef);
                    if (data.previewRef) previewUrl = await storageService.getSignedUrl(data.previewRef);
                    if (data.qrRef) qrUrl = await storageService.getSignedUrl(data.qrRef);
                    if (data.frontRef) frontUrl = await storageService.getSignedUrl(data.frontRef);
                    if (data.backRef) backUrl = await storageService.getSignedUrl(data.backRef);
                } catch (e) {
                    console.warn('Failed to sign doc urls', e);
                }

                docs.push({ id: doc.id, ...data, fileUrl, previewUrl, qrUrl, frontUrl, backUrl });
            }

            // Sort in-memory to avoid requiring composite index
            docs.sort((a, b) => {
                const dateA = new Date(a.issueDate || 0);
                const dateB = new Date(b.issueDate || 0);
                return dateB - dateA;
            });

            res.json(docs);

        } catch (error) {
            console.error('Error fetching documents:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // POST /api/documents
    // Upload and save document metadata
    router.post('/', upload.fields([{ name: 'file' }, { name: 'front' }, { name: 'back' }, { name: 'qr' }]), async (req, res) => {
        try {
            const { vehicleId, householdId, type, issueDate, expiryDate, data } = req.body;

            if (!vehicleId || !householdId || !type) {
                return res.status(400).json({ error: 'Missing required fields' });
            }

            let fileRef = null;
            let previewRef = null;
            let qrRef = null;
            let frontRef = null;
            let backRef = null;

            // 1. Parse metadata
            let metadata = {};
            try {
                if (data) metadata = JSON.parse(data);
            } catch (e) { }

            // 2. Upload Files
            const uploadFile = async (file, prefix = '') => {
                const fileName = `${prefix}${Date.now()}_${file.originalname || 'doc.jpg'}`;
                const result = await storageService.uploadFile(file.buffer, fileName);
                return result.path;
            };

            if (req.files) {
                if (req.files.file) fileRef = await uploadFile(req.files.file[0]);
                if (req.files.front) frontRef = await uploadFile(req.files.front[0], 'front_');
                if (req.files.back) backRef = await uploadFile(req.files.back[0], 'back_');
                if (req.files.qr) qrRef = await uploadFile(req.files.qr[0], 'qr_');
            }

            // 3. Create Document Record
            const newDoc = {
                vehicleId,
                householdId,
                type,
                issueDate: issueDate || new Date().toISOString().split('T')[0],
                expiryDate: expiryDate || null,
                fileRef,
                previewRef: previewRef || frontRef || fileRef, // Fallback for simple previews
                qrRef,
                frontRef,
                backRef,
                status: 'VALID',
                metadata,
                createdAt: new Date()
            };

            // Expiry logic
            if (newDoc.expiryDate) {
                if (new Date(newDoc.expiryDate) < new Date()) newDoc.status = 'EXPIRED';
            }

            const docRef = await documentsRef.add(newDoc);
            res.status(201).json({ id: docRef.id, ...newDoc });

        } catch (error) {
            console.error('Error saving document:', error);
            res.status(500).json({ error: error.message });
        }
    });

    return router;
};
