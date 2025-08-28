const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const jsonParser = express.json();
const multer = require('multer');
const { getReservasPendientes } = require('../services/gestionService');
const driveService = require('../services/driveService');
const config = require('../config');

const upload = multer({ storage: multer.memoryStorage() });

module.exports = (db) => {

    // Endpoint para obtener todas las reservas pendientes, ya priorizadas por el servicio
    router.get('/gestion/pendientes', async (req, res) => {
        try {
            const reservasPendientes = await getReservasPendientes(db);
            res.status(200).json(reservasPendientes);
        } catch (error) {
            console.error("Error al obtener reservas pendientes:", error);
            res.status(500).json({ error: 'Error interno del servidor.' });
        }
    });

    // Endpoint para actualizar el estado de gestión de una reserva (incluye subida de archivos)
    router.post('/gestion/actualizar-estado/:id', upload.single('documento'), async (req, res) => {
        const { id } = req.params;
        const { accion, detalles } = req.body; // detalles es un JSON stringificado

        if (!accion) {
            return res.status(400).json({ error: 'La acción es requerida.' });
        }

        try {
            const reservaRef = db.collection('reservas').doc(id);
            const reservaDoc = await reservaRef.get();
            if (!reservaDoc.exists) {
                return res.status(404).json({ error: 'Reserva no encontrada.' });
            }
            const reservaData = reservaDoc.data();

            const dataToUpdate = {};
            let nuevoEstado = '';
            const detallesParseados = detalles ? JSON.parse(detalles) : {};

            // --- Lógica de subida de archivos a Drive ---
            let archivoSubido = null;
            if (req.file) {
                const drive = driveService.getDriveClient();
                const year = reservaData.fechaLlegada.toDate().getFullYear().toString();
                const reservaId = reservaData.reservaIdOriginal;

                const anioFolderId = await driveService.findOrCreateFolder(drive, year, config.DRIVE_FOLDER_ID);
                const reservaFolderId = await driveService.findOrCreateFolder(drive, reservaId, anioFolderId);
                
                archivoSubido = await driveService.uploadFile(drive, req.file.originalname, req.file.mimetype, req.file.buffer, reservaFolderId);
            }
            // --- Fin lógica de subida ---

            switch (accion) {
                case 'marcar_bienvenida_enviada':
                    nuevoEstado = 'Pendiente Cobro';
                    dataToUpdate.fechaMensajeBienvenida = admin.firestore.FieldValue.serverTimestamp();
                    break;
                case 'marcar_cobro_enviado':
                    nuevoEstado = 'Pendiente Pago';
                    dataToUpdate.fechaMensajeCobro = admin.firestore.FieldValue.serverTimestamp();
                    break;
                case 'registrar_pago':
                    if (!detallesParseados || !detallesParseados.monto || !detallesParseados.medioDePago) {
                        return res.status(400).json({ error: 'Monto y medio de pago son requeridos.' });
                    }
                    const transaccionRef = reservaRef.collection('transacciones').doc();
                    await transaccionRef.set({
                        monto: parseFloat(detallesParseados.monto),
                        medioDePago: detallesParseados.medioDePago,
                        tipo: detallesParseados.tipo || 'Abono',
                        fecha: admin.firestore.FieldValue.serverTimestamp(),
                        enlaceComprobante: archivoSubido ? archivoSubido.webViewLink : null
                    });
                    
                    if (detallesParseados.esPagoFinal) {
                        nuevoEstado = 'Pendiente Boleta';
                        dataToUpdate.pagado = true;
                    }
                    break;
                case 'marcar_boleta_enviada':
                    nuevoEstado = 'Facturado';
                    dataToUpdate.fechaBoletaEnviada = admin.firestore.FieldValue.serverTimestamp();
                    dataToUpdate.boleta = true;
                    if (archivoSubido) {
                        dataToUpdate['documentos.enlaceBoleta'] = archivoSubido.webViewLink;
                    }
                    break;
                 case 'subir_documento_reserva':
                    if (archivoSubido) {
                         dataToUpdate['documentos.enlaceReserva'] = archivoSubido.webViewLink;
                    }
                    break;
                default:
                    return res.status(400).json({ error: 'Acción no válida.' });
            }

            if (nuevoEstado) {
                dataToUpdate.estadoGestion = nuevoEstado;
            }

            if (Object.keys(dataToUpdate).length > 0) {
                 await reservaRef.update(dataToUpdate);
            }
           
            res.status(200).json({ message: `Acción '${accion}' registrada exitosamente.` });

        } catch (error) {
            console.error(`Error al actualizar estado de reserva ${id}:`, error);
            res.status(500).json({ error: 'Error interno del servidor.' });
        }
    });

    return router;
};