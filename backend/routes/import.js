// backend/routes/import.js - CÓDIGO ACTUALIZADO

const express = require('express');
const router = express.Router();
const multer = require('multer');
// Importamos la nueva función del servicio
const { processHistoricalClients, processHistoricalBookings } = require('../services/importService');

// Configuración de Multer para manejar la subida de archivos en memoria
const upload = multer({ storage: multer.memoryStorage() });

module.exports = (db) => {
    /**
     * POST /api/import/historical-clients
     * Recibe un archivo CSV de clientes y lo procesa.
     */
    router.post('/import/historical-clients', upload.single('clientsFile'), async (req, res) => {
        console.log('Solicitud recibida para importar clientes históricos.');

        if (!req.file) {
            return res.status(400).json({ error: 'No se ha subido ningún archivo.' });
        }

        try {
            const summary = await processHistoricalClients(db, req.file.buffer);
            res.status(200).json({
                message: `Proceso de clientes completado. Filas leídas: ${summary.totalRows}. Clientes nuevos: ${summary.newClients}. Clientes actualizados: ${summary.updatedClients}.`,
                summary: summary,
            });
        } catch (error) {
            console.error('Error al procesar el archivo CSV de clientes históricos:', error);
            res.status(500).json({ error: 'Falló el procesamiento del archivo CSV.' });
        }
    });

    /**
     * --- NUEVO ENDPOINT ---
     * POST /api/import/historical-bookings
     * Recibe un archivo CSV de reservas de Booking y lo procesa.
     */
    router.post('/import/historical-bookings', upload.single('bookingsFile'), async (req, res) => {
        console.log('Solicitud recibida para importar reservas históricas de Booking.');

        if (!req.file) {
            return res.status(400).json({ error: 'No se ha subido ningún archivo.' });
        }

        try {
            const summary = await processHistoricalBookings(db, req.file.buffer);
            res.status(200).json({
                message: `Proceso de reservas de Booking completado. Filas leídas: ${summary.totalRows}. Reservas nuevas: ${summary.newReservations}. Clientes nuevos creados: ${summary.newClientsFromBookings}.`,
                summary: summary,
            });
        } catch (error) {
            console.error('Error al procesar el archivo CSV de reservas históricas:', error);
            res.status(500).json({ error: 'Falló el procesamiento del archivo CSV.' });
        }
    });
    
    return router;
};