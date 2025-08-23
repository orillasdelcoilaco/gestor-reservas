// backend/routes/clientes.js - CÓDIGO COMPLETO Y CORREGIDO

const express = require('express');
const router = express.Router();
const multer = require('multer');
// Importamos ambas funciones del servicio
const { importClientsFromCsv, getAllClientsWithStats } = require('../services/clienteService');

const upload = multer({ storage: multer.memoryStorage() }).array('clientsFiles', 10);

module.exports = (db) => {
    /**
     * ¡NUEVA RUTA!
     * GET /api/clientes
     * Devuelve una lista de todos los clientes con estadísticas calculadas.
     */
    router.get('/clientes', async (req, res) => {
        console.log('Solicitud recibida para obtener todos los clientes.');
        try {
            const clientes = await getAllClientsWithStats(db);
            res.status(200).json(clientes);
        } catch (error) {
            console.error('Error al obtener la lista de clientes:', error);
            res.status(500).json({ error: 'Error interno del servidor al obtener clientes.' });
        }
    });

    /**
     * POST /api/clientes/importar-csv (Ruta original restaurada)
     * Recibe archivos CSV, los procesa y crea nuevos clientes en Firebase.
     */
    router.post('/clientes/importar-csv', upload, async (req, res) => {
        console.log('Solicitud recibida para importar clientes desde CSV.');

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No se han subido archivos.' });
        }

        try {
            const summary = await importClientsFromCsv(db, req.files);
            res.status(200).json({
                message: `Proceso completado. Se leyeron ${summary.totalRowsRead} contactos en ${summary.filesProcessed} archivo(s). Se importaron ${summary.newClientsAdded} clientes nuevos.`,
                summary: summary,
            });
        } catch (error) {
            console.error('Error al procesar el archivo CSV de clientes:', error);
            res.status(500).json({ error: 'Falló el procesamiento del archivo CSV.' });
        }
    });

    return router;
};