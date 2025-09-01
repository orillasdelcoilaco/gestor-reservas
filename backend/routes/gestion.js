const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const path = require('path');
const { getReservasPendientes } = require('../services/gestionService');
const storageService = require('../services/storageService');

const jsonParser = express.json();
const upload = require('multer')({ storage: require('multer').memoryStorage() });

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

    // --- RUTA MODIFICADA PARA MANEJAR ACCIONES DE GRUPO ---
    router.post('/gestion/actualizar-estado-grupo', upload.single('documento'), async (req, res) => {
        const { accion, detalles, idsIndividuales, reservaIdOriginal } = req.body;
        
        if (!accion || !idsIndividuales || !reservaIdOriginal) {
            return res.status(400).json({ error: 'La acción, los IDs de las reservas y el ID original son requeridos.' });
        }

        const batch = db.batch();
        const detallesParseados = detalles ? JSON.parse(detalles) : {};
        const individualIds = JSON.parse(idsIndividuales);

        try {
            let publicUrl = null;
            if (detallesParseados.sinDocumento) {
                publicUrl = 'SIN_DOCUMENTO';
            } else if (req.file) {
                const firstReservaRef = db.collection('reservas').doc(individualIds[0]);
                const firstReservaDoc = await firstReservaRef.get();
                const reservaData = firstReservaDoc.data();
                const year = reservaData.fechaLlegada.toDate().getFullYear().toString();
                const fileExtension = path.extname(req.file.originalname);
                let fileName = `${reservaIdOriginal}_${accion}_${Date.now()}${fileExtension}`;
                const destinationPath = `reservas/${year}/${reservaIdOriginal}/${fileName}`;
                publicUrl = await storageService.uploadFile(req.file.buffer, destinationPath, req.file.mimetype);
            }

            for (const id of individualIds) {
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
                        if (!detallesParseados || !detallesParseados.monto || !detallesParseados.medioDePago) {
                            return res.status(400).json({ error: 'Monto y medio de pago son requeridos.' });
                        }
                        const transaccionesRef = reservaRef.collection('transacciones');
                        const newTransactionRef = transaccionesRef.doc();
                        
                        // El pago se divide proporcionalmente entre las cabañas
                        const montoIndividual = parseFloat(detallesParseados.monto) / individualIds.length;
                        
                        batch.set(newTransactionRef, {
                            monto: montoIndividual,
                            medioDePago: detallesParseados.medioDePago,
                            tipo: detallesParseados.tipo || 'Abono',
                            fecha: admin.firestore.FieldValue.serverTimestamp(),
                            enlaceComprobante: publicUrl
                        });
                        
                        const transSnapshot = await transaccionesRef.get();
                        const abonoPrevio = transSnapshot.docs.reduce((sum, doc) => sum + doc.data().monto, 0);
                        dataToUpdate.abono = abonoPrevio + montoIndividual;

                        if (detallesParseados.esPagoFinal) {
                            nuevoEstado = 'Pendiente Boleta';
                            dataToUpdate.pagado = true;
                        }
                        break;
                    case 'marcar_boleta_enviada':
                        nuevoEstado = 'Facturado';
                        dataToUpdate.fechaBoletaEnviada = admin.firestore.FieldValue.serverTimestamp();
                        dataToUpdate.boleta = true;
                        if (publicUrl) dataToUpdate['documentos.enlaceBoleta'] = publicUrl;
                        break;
                }

                if (nuevoEstado) dataToUpdate.estadoGestion = nuevoEstado;
                batch.update(reservaRef, dataToUpdate);
            }

            await batch.commit();
            res.status(200).json({ message: `Acción '${accion}' registrada exitosamente para el grupo ${reservaIdOriginal}.` });
        } catch (error) {
            console.error(`Error al actualizar estado del grupo ${reservaIdOriginal}:`, error);
            res.status(500).json({ error: 'Error interno del servidor.' });
        }
    });

    router.post('/gestion/grupo/ajustar-valores', jsonParser, async (req, res) => {
        const { reservaIdOriginal, valoresCabanas } = req.body;
        if (!reservaIdOriginal || !valoresCabanas) {
            return res.status(400).json({ error: 'Faltan datos para el ajuste.' });
        }
        try {
            const batch = db.batch();
            for (const item of valoresCabanas) {
                const reservaRef = db.collection('reservas').doc(item.id);
                batch.update(reservaRef, {
                    valorCLP: parseFloat(item.valor),
                    valorManual: true
                });
            }
            await batch.commit();
            res.status(200).json({ message: `Valores del grupo ${reservaIdOriginal} actualizados.` });
        } catch (error) {
            console.error(`Error al ajustar valores del grupo ${reservaIdOriginal}:`, error);
            res.status(500).json({ error: 'Error interno del servidor.' });
        }
    });

    router.get('/gestion/transacciones/:reservaId', async (req, res) => {
        const { reservaId } = req.params;
        try {
            const transaccionesRef = db.collection('reservas').doc(reservaId).collection('transacciones').orderBy('fecha', 'asc');
            const snapshot = await transaccionesRef.get();
            if (snapshot.empty) return res.status(200).json([]);
            const transacciones = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), fecha: doc.data().fecha.toDate() }));
            res.status(200).json(transacciones);
        } catch (error) {
            console.error(`Error al obtener transacciones para la reserva ${reservaId}:`, error);
            res.status(500).json({ error: 'Error interno del servidor.' });
        }
    });

    return router;
};