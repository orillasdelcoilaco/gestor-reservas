const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const multer = require('multer');
const { getReservasPendientes } = require('../services/gestionService');
const storageService = require('../services/storageService');

const upload = multer({ storage: multer.memoryStorage() });

// Ya no necesitamos recibir el bucketName como parámetro
module.exports = (db) => {

    router.get('/gestion/pendientes', async (req, res) => {
        try {
            const reservasPendientes = await getReservasPendientes(db);
            res.status(200).json(reservasPendientes);
        } catch (error) {
            console.error("Error al obtener reservas pendientes:", error);
            res.status(500).json({ error: 'Error interno del servidor.' });
        }
    });

    router.post('/gestion/actualizar-estado/:id', upload.single('documento'), async (req, res) => {
        const { id } = req.params;
        const { accion, detalles } = req.body;

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

            let publicUrl = null;
            if (req.file) {
                const year = reservaData.fechaLlegada.toDate().getFullYear().toString();
                const reservaId = reservaData.reservaIdOriginal;
                const destinationPath = `reservas/${year}/${reservaId}/${req.file.originalname}`;
                
                // --- CORRECCIÓN CLAVE ---
                // Llamamos a uploadFile sin pasarle el nombre del bucket.
                publicUrl = await storageService.uploadFile(req.file.buffer, destinationPath, req.file.mimetype);
            }

            // ... (el resto del switch case no cambia)
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
                        enlaceComprobante: publicUrl
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
                    if (publicUrl) {
                        dataToUpdate['documentos.enlaceBoleta'] = publicUrl;
                    }
                    break;
                 case 'subir_documento_reserva':
                    if (publicUrl) {
                         dataToUpdate['documentos.enlaceReserva'] = publicUrl;
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