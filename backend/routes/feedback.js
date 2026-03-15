const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');

/**
 * POST /api/feedback
 * Saves user feedback to Firestore collection "feedback"
 */
router.post('/', async (req, res) => {
    try {
        const { category, message } = req.body;

        if (!message || typeof message !== 'string' || !message.trim()) {
            return res.status(400).json({ error: 'El mensaje no puede estar vacío.' });
        }

        const VALID_CATEGORIES = ['Sugerencia', 'Error', 'Pregunta', 'Otro'];
        const resolvedCategory = VALID_CATEGORIES.includes(category) ? category : 'Otro';

        const db = admin.firestore();
        await db.collection('feedback').add({
            category: resolvedCategory,
            message: message.trim(),
            userId: req.user?.uid || null,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        res.json({ success: true });
    } catch (error) {
        console.error('[Feedback] Error:', error);
        res.status(500).json({ error: 'Error al guardar el comentario.' });
    }
});

module.exports = router;
