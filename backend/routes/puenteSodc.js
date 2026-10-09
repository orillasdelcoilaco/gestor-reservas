const express = require('express');
const { puenteActivo, secretoCoincide } = require('../services/puenteSodc.auth');
const { crearDesdeSodc } = require('../services/puenteSodc.write');

const hits = new Map();

function limitado(ip) {
    const now = Date.now();
    const row = hits.get(ip) || { n: 0, ts: now };
    if (now - row.ts > 60000) {
        row.n = 0;
        row.ts = now;
    }
    row.n += 1;
    hits.set(ip, row);
    return row.n <= 30;
}

module.exports = (db) => {
    const router = express.Router();

    router.post('/reservas', async (req, res) => {
        if (!puenteActivo()) return res.status(404).json({ error: 'No disponible.' });
        const ip = String(req.ip || '0');
        if (!limitado(ip)) return res.status(429).json({ error: 'Demasiados intentos.' });
        if (!secretoCoincide(req.get('X-Puente-Secreto'))) {
            return res.status(401).json({ error: 'No autorizado.' });
        }
        try {
            const result = await crearDesdeSodc(db, req.body || {});
            res.status(result.creada ? 201 : 200).json({ ok: true, reservaId: result.reservaId });
        } catch (error) {
            const status = Number(error.statusCode) || 500;
            if (status >= 500) console.error('puente sodc alta:', error.message);
            res.status(status).json({ error: status >= 500 ? 'No se pudo copiar la reserva.' : 'datos_invalidos' });
        }
    });

    return router;
};
