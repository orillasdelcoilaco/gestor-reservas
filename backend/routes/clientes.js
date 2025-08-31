// backend/routes/clientes.js - CÓDIGO ACTUALIZADO Y CENTRALIZADO

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { importClientsFromCsv, getAllClientsWithStats, syncClientToGoogle, updateClientMaster } = require('../services/clienteService');

const upload = multer({ storage: multer.memoryStorage() }).array('clientsFiles', 10);
const jsonParser = express.json();

module.exports = (db) => {
    
    router.get('/clientes', async (req, res) => {
        try {
            const clientes = await getAllClientsWithStats(db);
            res.status(200).json(clientes);
        } catch (error) {
            console.error('Error al obtener la lista de clientes:', error);
            res.status(500).json({ error: 'Error interno del servidor al obtener clientes.' });
        }
    });

    // --- RUTA OPTIMIZADA ACTUALIZADA PARA PRESUPUESTOS ---
    router.get('/clientes/simplificado', async (req, res) => {
        try {
            const snapshot = await db.collection('clientes').get();
            if (snapshot.empty) {
                return res.status(200).json([]);
            }
            const clientes = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    nombre: `${data.firstname || ''} ${data.lastname || ''}`.trim(),
                    telefono: data.phone || '',
                    email: data.email || '',
                    empresa: data.fuente || '' // Se añade el campo empresa/fuente
                };
            });
            res.status(200).json(clientes);
        } catch (error) {
             console.error('Error al obtener la lista simplificada de clientes:', error);
            res.status(500).json({ error: 'Error interno del servidor.' });
        }
    });
    
    router.put('/clientes/:id', jsonParser, async (req, res) => {
        const { id } = req.params;
        const clientData = req.body;
        if (!id || !clientData) {
            return res.status(400).json({ error: 'Faltan el ID del cliente o los datos a actualizar.' });
        }
        try {
            const result = await updateClientMaster(db, id, clientData);
            res.status(200).json({ message: result.message });
        } catch (error) {
            console.error(`Error al actualizar el cliente ${id}:`, error);
            res.status(500).json({ error: 'Error interno del servidor al actualizar el cliente.' });
        }
    });

    router.post('/clientes/importar-csv', upload, async (req, res) => {
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

    router.post('/clientes/:id/sincronizar-google', async (req, res) => {
        const { id } = req.params;
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