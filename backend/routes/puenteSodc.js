const express = require('express');
const { puenteActivo, secretoCoincide } = require('../services/puenteSodc.auth');
const { crearDesdeSodc } = require('../services/puenteSodc.write');
const { consultarDisponibilidad } = require('../services/puenteSodc.disponibilidad');
const { aplicarEstadoDesdeRezerva } = require('../services/puenteSodc.estado');
const { aplicarPagoDesdeRezerva, aplicarBajaPagoDesdeRezerva } = require('../services/puenteSodc.pago');
const { aplicarNotaDesdeRezerva } = require('../services/puenteSodc.nota');
const { aplicarDocumentoDesdeRezerva } = require('../services/puenteSodc.documento');
const { aplicarClienteDesdeRezerva } = require('../services/puenteSodc.cliente');

const hits = new Map();
const hitsDisponibilidad = new Map();
const hitsEstado = new Map();
const hitsPago = new Map();
const hitsBajaPago = new Map();
const hitsNota = new Map();
const hitsDocumento = new Map();
const hitsCliente = new Map();

function limitado(ip, mapa = hits, max = 30) {
    const now = Date.now();
    const row = mapa.get(ip) || { n: 0, ts: now };
    if (now - row.ts > 60000) {
        row.n = 0;
        row.ts = now;
    }
    row.n += 1;
    mapa.set(ip, row);
    return row.n <= max;
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

    router.post('/estado', async (req, res) => {
        if (!puenteActivo()) return res.status(404).json({ error: 'No disponible.' });
        const ip = String(req.ip || '0');
        if (!limitado(ip, hitsEstado, 60)) {
            return res.status(429).json({ error: 'Demasiados intentos.' });
        }
        if (!secretoCoincide(req.get('X-Puente-Secreto'))) {
            return res.status(401).json({ error: 'No autorizado.' });
        }
        try {
            const result = await aplicarEstadoDesdeRezerva(db, req.body || {});
            res.status(200).json(result);
        } catch (error) {
            const status = Number(error.statusCode) || 500;
            if (status >= 500) console.error('puente sodc estado inbound:', error.message);
            const mensaje = status === 404
                ? 'reserva_no_encontrada'
                : (status >= 500 ? 'No se pudo actualizar el estado.' : 'datos_invalidos');
            res.status(status).json({ error: mensaje });
        }
    });

    router.post('/pago', async (req, res) => {
        if (!puenteActivo()) return res.status(404).json({ error: 'No disponible.' });
        const ip = String(req.ip || '0');
        if (!limitado(ip, hitsPago, 60)) {
            return res.status(429).json({ error: 'Demasiados intentos.' });
        }
        if (!secretoCoincide(req.get('X-Puente-Secreto'))) {
            return res.status(401).json({ error: 'No autorizado.' });
        }
        try {
            const result = await aplicarPagoDesdeRezerva(db, req.body || {});
            res.status(200).json(result);
        } catch (error) {
            const status = Number(error.statusCode) || 500;
            if (status >= 500) console.error('puente sodc pago inbound:', error.message);
            const mensaje = status === 404
                ? 'reserva_no_encontrada'
                : (status >= 500 ? 'No se pudo registrar el pago.' : 'datos_invalidos');
            res.status(status).json({ error: mensaje });
        }
    });

    router.post('/nota', async (req, res) => {
        if (!puenteActivo()) return res.status(404).json({ error: 'No disponible.' });
        const ip = String(req.ip || '0');
        if (!limitado(ip, hitsNota, 60)) {
            return res.status(429).json({ error: 'Demasiados intentos.' });
        }
        if (!secretoCoincide(req.get('X-Puente-Secreto'))) {
            return res.status(401).json({ error: 'No autorizado.' });
        }
        try {
            const result = await aplicarNotaDesdeRezerva(db, req.body || {});
            res.status(200).json(result);
        } catch (error) {
            const status = Number(error.statusCode) || 500;
            if (status >= 500) console.error('puente sodc nota inbound:', error.message);
            const mensaje = status === 404
                ? 'reserva_no_encontrada'
                : (status >= 500 ? 'No se pudo registrar la nota.' : 'datos_invalidos');
            res.status(status).json({ error: mensaje });
        }
    });

    router.post('/documento', async (req, res) => {
        if (!puenteActivo()) return res.status(404).json({ error: 'No disponible.' });
        const ip = String(req.ip || '0');
        if (!limitado(ip, hitsDocumento, 60)) {
            return res.status(429).json({ error: 'Demasiados intentos.' });
        }
        if (!secretoCoincide(req.get('X-Puente-Secreto'))) {
            return res.status(401).json({ error: 'No autorizado.' });
        }
        try {
            const result = await aplicarDocumentoDesdeRezerva(db, req.body || {});
            res.status(200).json(result);
        } catch (error) {
            const status = Number(error.statusCode) || 500;
            if (status >= 500) console.error('puente sodc documento inbound:', error.message);
            const mensaje = status === 404
                ? 'reserva_no_encontrada'
                : (status >= 500 ? 'No se pudo actualizar el documento.' : 'datos_invalidos');
            res.status(status).json({ error: mensaje });
        }
    });

    router.post('/cliente', async (req, res) => {
        if (!puenteActivo()) return res.status(404).json({ error: 'No disponible.' });
        const ip = String(req.ip || '0');
        if (!limitado(ip, hitsCliente, 60)) {
            return res.status(429).json({ error: 'Demasiados intentos.' });
        }
        if (!secretoCoincide(req.get('X-Puente-Secreto'))) {
            return res.status(401).json({ error: 'No autorizado.' });
        }
        try {
            const result = await aplicarClienteDesdeRezerva(db, req.body || {});
            res.status(200).json(result);
        } catch (error) {
            const status = Number(error.statusCode) || 500;
            if (status >= 500) console.error('puente sodc cliente inbound:', error.message);
            const mensaje = status === 404
                ? 'reserva_no_encontrada'
                : (status >= 500 ? 'No se pudo actualizar el cliente.' : 'datos_invalidos');
            res.status(status).json({ error: mensaje });
        }
    });

    router.post('/pago-baja', async (req, res) => {
        if (!puenteActivo()) return res.status(404).json({ error: 'No disponible.' });
        const ip = String(req.ip || '0');
        if (!limitado(ip, hitsBajaPago, 60)) {
            return res.status(429).json({ error: 'Demasiados intentos.' });
        }
        if (!secretoCoincide(req.get('X-Puente-Secreto'))) {
            return res.status(401).json({ error: 'No autorizado.' });
        }
        try {
            const result = await aplicarBajaPagoDesdeRezerva(db, req.body || {});
            res.status(200).json(result);
        } catch (error) {
            const status = Number(error.statusCode) || 500;
            if (status >= 500) console.error('puente sodc baja pago:', error.message);
            const mensaje = status === 404
                ? 'reserva_no_encontrada'
                : (status >= 500 ? 'No se pudo borrar el pago.' : 'datos_invalidos');
            res.status(status).json({ error: mensaje });
        }
    });

    router.post('/disponibilidad', async (req, res) => {
        const ip = String(req.ip || '0');
        if (!limitado(ip, hitsDisponibilidad, 60)) {
            return res.status(429).json({ error: 'Demasiados intentos.' });
        }
        if (!secretoCoincide(req.get('X-Puente-Secreto'))) {
            return res.status(401).json({ error: 'No autorizado.' });
        }
        try {
            const result = await consultarDisponibilidad(db, req.body || {});
            res.status(200).json(result);
        } catch (error) {
            const status = Number(error.statusCode) || 500;
            if (status >= 500) console.error('puente sodc disponibilidad:', error.message);
            const mensaje = status === 404
                ? 'alojamiento_no_encontrado'
                : (status >= 500 ? 'No se pudo consultar la disponibilidad.' : 'datos_invalidos');
            res.status(status).json({ error: mensaje });
        }
    });

    return router;
};
