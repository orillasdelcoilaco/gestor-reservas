const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const jsonParser = express.json();
const { getReservasPendientes } = require('../services/gestionService');

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

    // Endpoint para actualizar el estado de gestión de una reserva
    router.post('/gestion/actualizar-estado/:id', jsonParser, async (req, res) => {
        const { id } = req.params;
        const { accion, detalles } = req.body; // detalles puede contener { medioDePago: '...' }

        if (!accion) {
            return res.status(400).json({ error: 'La acción es requerida.' });
        }

        try {
            const reservaRef = db.collection('reservas').doc(id);
            const dataToUpdate = {};
            let nuevoEstado = '';

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
                     if (!detalles || !detalles.medioDePago || !detalles.monto) {
                        return res.status(400).json({ error: 'El medio de pago y el monto son requeridos.' });
                    }
                    // Esta acción crea un documento en la subcolección 'transacciones'
                    const transaccionRef = reservaRef.collection('transacciones').doc();
                    await transaccionRef.set({
                        monto: detalles.monto,
                        medioDePago: detalles.medioDePago,
                        tipo: detalles.tipo || 'Abono', // 'Abono' o 'Pago Final'
                        fecha: admin.firestore.FieldValue.serverTimestamp(),
                        enlaceComprobante: detalles.enlaceComprobante || null
                    });
                    
                    // Si es el pago final, actualizamos el estado principal
                    if (detalles.esPagoFinal) {
                        nuevoEstado = 'Pendiente Boleta';
                        dataToUpdate.pagado = true;
                        dataToUpdate.pendiente = 0;
                    }
                    break;
                case 'marcar_boleta_enviada':
                    nuevoEstado = 'Facturado';
                    dataToUpdate.fechaBoletaEnviada = admin.firestore.FieldValue.serverTimestamp();
                    dataToUpdate.boleta = true;
                    if(detalles && detalles.enlaceBoleta) {
                        dataToUpdate['documentos.enlaceBoleta'] = detalles.enlaceBoleta;
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