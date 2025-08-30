const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const multer = require('multer');
const path = require('path');
const { getReservasPendientes } = require('../services/gestionService');
const storageService = require('../services/storageService');

const upload = multer({ storage: multer.memoryStorage() });

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
            const transaccionesRef = reservaRef.collection('transacciones');

            const dataToUpdate = {};
            let nuevoEstado = '';
            const detallesParseados = detalles ? JSON.parse(detalles) : {};
            let publicUrl = null;

            if (req.file) {
                const year = reservaData.fechaLlegada.toDate().getFullYear().toString();
                const reservaId = reservaData.reservaIdOriginal;
                const fileExtension = path.extname(req.file.originalname);
                let fileName = '';

                switch(accion) {
                    case 'registrar_pago':
                        const transaccionesSnapshot = await transaccionesRef.get();
                        const abonoIndex = transaccionesSnapshot.docs.filter(doc => doc.data().tipo === 'Abono').length + 1;
                        const tipoPago = detallesParseados.esPagoFinal ? 'pago_final' : `abono_${abonoIndex}`;
                        fileName = `${reservaId}_${tipoPago}${fileExtension}`;
                        break;
                    case 'marcar_boleta_enviada':
                        fileName = `${reservaId}_boleta${fileExtension}`;
                        break;
                    case 'subir_documento_reserva':
                        fileName = `${reservaId}_reserva_comprobante${fileExtension}`;
                        break;
                    default:
                        fileName = `${reservaId}_documento_${Date.now()}${fileExtension}`;
                }

                const destinationPath = `reservas/${year}/${reservaId}/${fileName}`;
                publicUrl = await storageService.uploadFile(req.file.buffer, destinationPath, req.file.mimetype);
            }

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
                    const newTransactionRef = transaccionesRef.doc();
                    await newTransactionRef.set({
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

                    // Recalcular el total abonado
                    const allTransactions = await transaccionesRef.get();
                    const totalAbonado = allTransactions.docs.reduce((sum, doc) => sum + doc.data().monto, 0);
                    dataToUpdate.abono = totalAbonado;

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
                    // No cambia de estado, solo sube el archivo
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