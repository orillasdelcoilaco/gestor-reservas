const express = require('express');
const router = express.Router();
const { generarPropuestaRango } = require('../services/planificadorService');

// GET /api/public/plan/:workerId
// Public read-only route for workers to see their daily plan
router.get('/plan/:workerId', async (req, res) => {
    try {
        const { workerId } = req.params;
        const db = req.app.locals.db; // Access Firebase/DB from app locals if set, or require admin

        // We need db instance. In index.js 'db' is initialized. 
        // We'll rely on global admin or require local file
        const admin = require('firebase-admin');
        const firestore = admin.firestore();

        if (!workerId) return res.status(400).json({ error: 'Falta workerId' });

        // Use today's date
        const todayStr = new Date().toISOString().split('T')[0];

        // Reuse service logic
        const propuesta = await generarPropuestaRango(firestore, todayStr, todayStr);

        if (!propuesta.dias || propuesta.dias.length === 0) {
            return res.json({ date: todayStr, tasks: [] });
        }

        const dia = propuesta.dias[0];
        // Filter for this worker
        const tasks = dia.activePlan.filter(t => t.trabajadorId === workerId);

        res.json({
            date: todayStr,
            workerId,
            tasks: tasks.map(t => ({
                cabana: t.cabanaId,
                tipo: t.tipoAseo,
                duracion: (t.duracion || t.duration || 30),
                inicio: t.horarioInicio || '--:--'
            }))
        });

    } catch (error) {
        console.error('Error in public plan:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
