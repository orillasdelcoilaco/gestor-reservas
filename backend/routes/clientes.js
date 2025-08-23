// backend/routes/clientes.js - CÓDIGO COMPLETO Y CORREGIDO

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { importClientsFromCsv, getAllClientsWithStats, updateClient, syncClientToGoogle } = require('../services/clienteService');

const upload = multer({ storage: multer.memoryStorage() }).array('clientsFiles', 10);

module.exports = (db) => {
    
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
    
    router.put('/clientes/:id', async (req, res) => {
        const { id } = req.params;
        const clientData = req.body;

        console.log(`Solicitud recibida para actualizar cliente con ID: ${id}`);

        if (!id || !clientData) {
            return res.status(400).json({ error: 'Faltan el ID del cliente o los datos a actualizar.' });
        }

        try {
            await updateClient(db, id, clientData);
            res.status(200).json({ message: 'Cliente actualizado correctamente.' });
        } catch (error) {
            console.error(`Error al actualizar el cliente ${id}:`, error);
            res.status(500).json({ error: 'Error interno del servidor al actualizar el cliente.' });
        }
    });

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

    // --- NUEVO ENDPOINT PARA SINCRONIZACIÓN MANUAL ---
    router.post('/clientes/:id/sincronizar-google', async (req, res) => {
        const { id } = req.params;
        console.log(`Solicitud recibida para sincronizar cliente ${id} con Google Contacts.`);

        try {
            const result = await syncClientToGoogle(db, id);
            res.status(200).json(result);
        } catch (error) {
            console.error(`Error al sincronizar manualmente el cliente ${id}:`, error);
            res.status(500).json({ error: error.message });
        }
    });

    return router;
};