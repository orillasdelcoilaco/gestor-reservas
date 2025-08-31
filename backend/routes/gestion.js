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

            if (detallesParseados.sinDocumento) {
                publicUrl = 'SIN_DOCUMENTO';
            } else if (req.file) {
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
                    
                    const allTransactions = await transaccionesRef.get();
                    const totalAbonado = allTransactions.docs.reduce((sum, doc) => sum + doc.data().monto, 0);
                    dataToUpdate.abono = totalAbonado;
                    
                    if (detallesParseados.esPagoFinal) {
                        nuevoEstado = 'Pendiente Boleta';
                        dataToUpdate.pagado = true;
                        
                        if (totalAbonado > reservaData.valorCLP) {
                            console.log(`Ajuste automático de valor para reserva ${id}. Valor anterior: ${reservaData.valorCLP}, Nuevo valor (total pagado): ${totalAbonado}.`);
                            dataToUpdate.valorCLP = totalAbonado;
                            dataToUpdate.valorManual = true;
                        }
                    }
                    break;

                case 'marcar_boleta_enviada':
                    nuevoEstado = 'Facturado';
                    dataToUpdate.fechaBoletaEnviada = admin.firestore.FieldValue.serverTimestamp();
                    dataToUpdate.boleta = true;
                    if (publicUrl) dataToUpdate['documentos.enlaceBoleta'] = publicUrl;
                    break;
                case 'subir_documento_reserva':
                    if (publicUrl) dataToUpdate['documentos.enlaceReserva'] = publicUrl;
                    break;
                default:
                    return res.status(400).json({ error: 'Acción no válida.' });
            }

            if (nuevoEstado) dataToUpdate.estadoGestion = nuevoEstado;
            if (Object.keys(dataToUpdate).length > 0) await reservaRef.update(dataToUpdate);
           
            res.status(200).json({ message: `Acción '${accion}' registrada exitosamente.` });

        } catch (error) {
            console.error(`Error al actualizar estado de reserva ${id}:`, error);
            res.status(500).json({ error: 'Error interno del servidor.' });
        }
    });

    // --- NUEVA RUTA PARA AJUSTAR TARIFAS ---
    router.post('/gestion/ajustar-tarifa/:id', jsonParser, async (req, res) => {
        const { id } = req.params;
        const { tipoAjuste, valor } = req.body;

        if (!id || !tipoAjuste || valor === undefined) {
            return res.status(400).json({ error: 'Faltan datos para el ajuste de tarifa.' });
        }

        try {
            const reservaRef = db.collection('reservas').doc(id);
            const doc = await reservaRef.get();
            if (!doc.exists) {
                return res.status(404).json({ error: 'Reserva no encontrada.' });
            }

            const reservaData = doc.data();
            const dataToUpdate = { valorManual: true };

            if (tipoAjuste === 'porcentaje') {
                const descuentoPorcentaje = parseFloat(valor);
                if (isNaN(descuentoPorcentaje) || descuentoPorcentaje < 0 || descuentoPorcentaje >= 100) {
                    return res.status(400).json({ error: 'El porcentaje de descuento no es válido.' });
                }
                const valorReal = reservaData.valorCLP; // El valor en sistema es el real (con descuento)
                const valorPotencial = valorReal / (1 - (descuentoPorcentaje / 100));
                dataToUpdate.valorPotencialCLP = Math.round(valorPotencial);
                dataToUpdate.descuentoAplicado = Math.round(valorPotencial - valorReal);
            
            } else if (tipoAjuste === 'valor') {
                const valorRealPagado = parseFloat(valor);
                if (isNaN(valorRealPagado) || valorRealPagado < 0) {
                    return res.status(400).json({ error: 'El valor pagado no es válido.' });
                }
                const valorPotencial = reservaData.valorCLP; // El valor en sistema es el potencial (de lista)
                dataToUpdate.valorPotencialCLP = valorPotencial;
                dataToUpdate.valorCLP = valorRealPagado; // Actualizamos el valor real con el que pagó el cliente
                dataToUpdate.descuentoAplicado = Math.round(valorPotencial - valorRealPagado);

            } else {
                return res.status(400).json({ error: 'Tipo de ajuste no válido.' });
            }

            await reservaRef.update(dataToUpdate);
            res.status(200).json({ message: 'Tarifa ajustada y guardada correctamente.', newData: dataToUpdate });

        } catch (error) {
            console.error(`Error al ajustar la tarifa para la reserva ${id}:`, error);
            res.status(500).json({ error: 'Error interno del servidor.' });
        }
    });

    router.post('/gestion/transaccion/editar', jsonParser, async (req, res) => {
        const { reservaId, transaccionId, nuevoMonto } = req.body;
        if (!reservaId || !transaccionId || nuevoMonto === undefined) {
            return res.status(400).json({ error: 'Faltan datos para editar la transacción.' });
        }
        try {
            const transaccionRef = db.collection('reservas').doc(reservaId).collection('transacciones').doc(transaccionId);
            await transaccionRef.update({ monto: parseFloat(nuevoMonto) });

            const reservaRef = db.collection('reservas').doc(reservaId);
            const transaccionesSnapshot = await reservaRef.collection('transacciones').get();
            const totalAbonado = transaccionesSnapshot.docs.reduce((sum, doc) => sum + doc.data().monto, 0);
            await reservaRef.update({ abono: totalAbonado });

            res.status(200).json({ message: 'Transacción actualizada y total recalculado.' });
        } catch (error) {
            console.error('Error al editar transacción:', error);
            res.status(500).json({ error: 'Error interno del servidor.' });
        }
    });

    router.post('/gestion/documento/eliminar', jsonParser, async (req, res) => {
        const { reservaId, tipoDoc, transaccionId } = req.body;
        if (!reservaId || !tipoDoc) {
            return res.status(400).json({ error: 'Faltan datos para eliminar el documento.' });
        }
        try {
            const reservaRef = db.collection('reservas').doc(reservaId);
            const reservaDoc = await reservaRef.get();
            const reservaData = reservaDoc.data();
            let filePath = null;

            if (tipoDoc === 'transaccion') {
                if (!transaccionId) return res.status(400).json({ error: 'Falta ID de transacción.' });
                const transaccionRef = reservaRef.collection('transacciones').doc(transaccionId);
                const transaccionDoc = await transaccionRef.get();
                if (transaccionDoc.exists && transaccionDoc.data().enlaceComprobante && transaccionDoc.data().enlaceComprobante !== 'SIN_DOCUMENTO') {
                    filePath = new URL(transaccionDoc.data().enlaceComprobante).pathname.split('/').slice(3).join('/');
                }
                await transaccionRef.delete();
                const transaccionesSnapshot = await reservaRef.collection('transacciones').get();
                const totalAbonado = transaccionesSnapshot.docs.reduce((sum, doc) => sum + doc.data().monto, 0);
                await reservaRef.update({ abono: totalAbonado });

            } else { 
                if (reservaData.documentos && reservaData.documentos[tipoDoc] && reservaData.documentos[tipoDoc] !== 'SIN_DOCUMENTO') {
                    filePath = new URL(reservaData.documentos[tipoDoc]).pathname.split('/').slice(3).join('/');
                }
                await reservaRef.update({ [`documentos.${tipoDoc}`]: admin.firestore.FieldValue.delete() });
            }

            if (filePath) {
                const bucket = admin.storage().bucket();
                const file = bucket.file(decodeURIComponent(filePath));
                await file.delete().catch(err => console.error(`No se pudo borrar el archivo ${filePath} de Storage, puede que ya no exista.`, err.message));
            }
            
            res.status(200).json({ message: 'Elemento eliminado correctamente.' });
        } catch (error) {
            console.error('Error al eliminar documento:', error);
            res.status(500).json({ error: 'Error interno del servidor.' });
        }
    });

    router.get('/gestion/transacciones/:reservaId', async (req, res) => {
        const { reservaId } = req.params;
        try {
            const transaccionesRef = db.collection('reservas').doc(reservaId).collection('transacciones').orderBy('fecha', 'asc');
            const snapshot = await transaccionesRef.get();

            if (snapshot.empty) {
                return res.status(200).json([]);
            }

            const transacciones = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                fecha: doc.data().fecha.toDate()
            }));

            res.status(200).json(transacciones);
        } catch (error) {
            console.error(`Error al obtener transacciones para la reserva ${reservaId}:`, error);
            res.status(500).json({ error: 'Error interno del servidor.' });
        }
    });

    return router;
};