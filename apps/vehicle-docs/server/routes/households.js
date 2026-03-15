const express = require('express');

module.exports = (db) => {
    const router = express.Router();
    const householdsRef = db.collection('households');

    // GET /api/households
    // List households the user is a member of
    router.get('/', async (req, res) => {
        try {
            const { uid } = req.user;

            const snapshot = await householdsRef.get();
            const households = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                const members = data.members || [];
                if (members.some(m => m.uid === uid) || data.ownerUid === uid) {
                    households.push({ id: doc.id, ...data });
                }
            });

            res.json(households);
        } catch (error) {
            console.error('Error fetching households:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // POST /api/households
    // Create a new household
    router.post('/', async (req, res) => {
        try {
            const { uid, email } = req.user;
            const { name } = req.body;

            if (!name) return res.status(400).json({ error: 'Nombre es requerido' });

            const newHousehold = {
                name,
                ownerUid: uid,
                members: [
                    { uid, role: 'admin', email: email || '', joinedAt: new Date().toISOString() }
                ],
                createdAt: new Date()
            };

            const docRef = await householdsRef.add(newHousehold);
            res.status(201).json({ id: docRef.id, ...newHousehold });

        } catch (error) {
            console.error('Error creating household:', error);
            res.status(500).json({ error: error.message });
        }
    });

    return router;
};
