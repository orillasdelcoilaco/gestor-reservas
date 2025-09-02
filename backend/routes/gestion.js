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

    router.post('/gestion/actualizar-estado', upload.single('documento'), async (req, res) => {
        const { accion, detalles, idsIndividuales, reservaIdOriginal } = req.body;
        
        if (!accion || !idsIndividuales || !reservaIdOriginal) {
            return res.status(400).json({ error: 'Faltan datos clave para procesar la acción.' });
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
            
            let totalValorGrupo = 0;
            if(accion === 'registrar_pago' && individualIds.length > 1){
                const docs = await db.getAll(...individualIds.map(id => db.collection('reservas').doc(id)));
                for (const doc of docs) {
                    totalValorGrupo += doc.data().valorCLP || 0;
                }
            }

            for (const id of individualIds) {
                const reservaRef = db.collection('reservas').doc(id);
                
                switch (accion) {
                    case 'marcar_bienvenida_enviada':
                        batch.update(reservaRef, { estadoGestion: 'Pendiente Cobro' });
                        break;
                    case 'marcar_cobro_enviado':
                        batch.update(reservaRef, { estadoGestion: 'Pendiente Pago' });
                        break;
                    case 'registrar_pago':
                        if (!detallesParseados || !detallesParseados.monto || !detallesParseados.medioDePago) {
                            return res.status(400).json({ error: 'Monto y medio de pago son requeridos.' });
                        }
                        const transaccionesRef = reservaRef.collection('transacciones');
                        const newTransactionRef = transaccionesRef.doc();
                        
                        let montoIndividual;
                        if(individualIds.length > 1) {
                            const reservaDoc = await db.collection('reservas').doc(id).get();
                            const valorCabana = reservaDoc.data().valorCLP || 0;
                            const proporcion = totalValorGrupo > 0 ? valorCabana / totalValorGrupo : 1 / individualIds.length;
                            montoIndividual = Math.round(parseFloat(detallesParseados.monto) * proporcion);
                        } else {
                            montoIndividual = parseFloat(detallesParseados.monto);
                        }
                        
                        batch.set(newTransactionRef, {
                            monto: montoIndividual,
                            medioDePago: detallesParseados.medioDePago,
                            tipo: detallesParseados.esPagoFinal ? 'Pago Final' : 'Abono',
                            fecha: admin.firestore.FieldValue.serverTimestamp(),
                            enlaceComprobante: publicUrl
                        });
                        
                        if (detallesParseados.esPagoFinal) {
                            batch.update(reservaRef, { estadoGestion: 'Pendiente Boleta', pagado: true });
                        }
                        break;
                    case 'marcar_boleta_enviada':
                        const boletaUpdate = {
                            estadoGestion: 'Facturado',
                            fechaBoletaEnviada: admin.firestore.FieldValue.serverTimestamp(),
                            boleta: true
                        };
                        if (publicUrl) boletaUpdate['documentos.enlaceBoleta'] = publicUrl;
                        batch.update(reservaRef, boletaUpdate);
                        break;
                    case 'gestionar_reserva':
                        if (publicUrl) {
                           batch.update(reservaRef, { 'documentos.enlaceReserva': publicUrl });
                        }
                        break;
                }
            }

            await batch.commit();
            
            if (accion === 'registrar_pago') {
                for (const id of individualIds) {
                    const reservaRef = db.collection('reservas').doc(id);
                    const transaccionesSnapshot = await reservaRef.collection('transacciones').get();
                    const totalAbonado = transaccionesSnapshot.docs.reduce((sum, doc) => sum + doc.data().monto, 0);
                    
                    const reservaDoc = await reservaRef.get();
                    const reservaData = reservaDoc.data();
                    
                    const updatePayload = { abono: totalAbonado };

                    if (individualIds.length === 1 && totalAbonado > (reservaData.valorCLP || 0)) {
                        updatePayload.valorCLP = totalAbonado;
                        updatePayload.valorManual = true;
                    }
                    
                    await reservaRef.update(updatePayload);
                }
            }

            res.status(200).json({ message: `Acción '${accion}' registrada para el grupo ${reservaIdOriginal}.` });
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

    router.post('/gestion/grupo/calcular-potencial', jsonParser, async (req, res) => {
        const { reservaIdOriginal, descuento } = req.body;
        if (!reservaIdOriginal || descuento === undefined) {
            return res.status(400).json({ error: 'Faltan datos para el cálculo.' });
        }
        try {
            const batch = db.batch();
            const query = db.collection('reservas').where('reservaIdOriginal', '==', reservaIdOriginal);
            const snapshot = await query.get();
            if (snapshot.empty) {
                return res.status(404).json({ error: 'No se encontraron reservas.' });
            }

            snapshot.forEach(doc => {
                const reservaRef = db.collection('reservas').doc(doc.id);
                const valorActual = doc.data().valorCLP;
                const valorPotencial = Math.round(valorActual / (1 - (parseFloat(descuento) / 100)));
                batch.update(reservaRef, { valorPotencialCLP: valorPotencial });
            });
            
            await batch.commit();
            res.status(200).json({ message: 'Valor potencial calculado y guardado para el grupo.' });
        } catch (error) {
            console.error(`Error al calcular valor potencial para ${reservaIdOriginal}:`, error);
            res.status(500).json({ error: 'Error interno del servidor.' });
        }
    });

    router.post('/gestion/grupo/ajustar-monto-final', jsonParser, async (req, res) => {
        const { reservaIdOriginal, nuevoTotalCLP } = req.body;
        if (!reservaIdOriginal || nuevoTotalCLP === undefined) {
            return res.status(400).json({ error: 'Faltan datos para el ajuste.' });
        }

        try {
            const batch = db.batch();
            const query = db.collection('reservas').where('reservaIdOriginal', '==', reservaIdOriginal);
            const snapshot = await query.get();
            if (snapshot.empty) {
                return res.status(404).json({ error: 'No se encontraron reservas.' });
            }

            if (snapshot.size === 1) {
                const docRef = snapshot.docs[0].ref;
                batch.update(docRef, { valorCLP: parseFloat(nuevoTotalCLP), valorManual: true });
            } else {
                let totalActualGrupo = 0;
                snapshot.docs.forEach(doc => totalActualGrupo += (doc.data().valorCLP || 0));

                const descuentoTotal = totalActualGrupo - parseFloat(nuevoTotalCLP);

                snapshot.docs.forEach(doc => {
                    const reservaActual = doc.data();
                    const valorOriginal = reservaActual.valorCLP || 0;
                    const proporcionDescuento = totalActualGrupo > 0 ? valorOriginal / totalActualGrupo : 1 / snapshot.size;
                    const descuentoIndividual = Math.round(descuentoTotal * proporcionDescuento);
                    const nuevoValorIndividual = valorOriginal - descuentoIndividual;
                    
                    batch.update(doc.ref, { valorCLP: nuevoValorIndividual, valorManual: true });
                });
            }

            await batch.commit();
            res.status(200).json({ message: `Monto final del grupo ${reservaIdOriginal} actualizado.` });
        } catch (error) {
            console.error(`Error al ajustar monto final para ${reservaIdOriginal}:`, error);
            res.status(500).json({ error: 'Error interno del servidor.' });
        }
    });
    
    router.post('/gestion/transacciones-grupo', jsonParser, async (req, res) => {
        const { idsIndividuales } = req.body;
        if (!idsIndividuales || !Array.isArray(idsIndividuales)) {
            return res.status(400).json({ error: 'Se requiere un arreglo de IDs.' });
        }
        try {
            let todasLasTransacciones = [];
            for (const id of idsIndividuales) {
                const transaccionesRef = db.collection('reservas').doc(id).collection('transacciones');
                const snapshot = await transaccionesRef.get();
                snapshot.forEach(doc => {
                    todasLasTransacciones.push({
                        reservaId: id,
                        id: doc.id,
                        ...doc.data(),
                        fecha: doc.data().fecha ? doc.data().fecha.toDate() : new Date()
                    });
                });
            }
            todasLasTransacciones.sort((a, b) => b.fecha - a.fecha);
            res.status(200).json(todasLasTransacciones);
        } catch (error) {
            console.error(`Error al obtener transacciones del grupo:`, error);
            res.status(500).json({ error: 'Error interno del servidor.' });
        }
    });

    router.post('/gestion/transaccion/editar', upload.single('documento'), async (req, res) => {
        const { reservaId, transaccionId, detalles, idsIndividuales } = req.body;
        if (!reservaId || !transaccionId || !detalles || !idsIndividuales) {
            return res.status(400).json({ error: 'Faltan datos para editar la transacción.' });
        }
        try {
            const detallesParseados = JSON.parse(detalles);
            const individualIds = JSON.parse(idsIndividuales);
            const transaccionRef = db.collection('reservas').doc(reservaId).collection('transacciones').doc(transaccionId);
            
            if (req.file) {
                const reservaDoc = await db.collection('reservas').doc(reservaId).get();
                const reservaData = reservaDoc.data();
                const year = reservaData.fechaLlegada.toDate().getFullYear().toString();
                const fileExtension = path.extname(req.file.originalname);
                let fileName = `${reservaData.reservaIdOriginal}_pago_${transaccionId}_${Date.now()}${fileExtension}`;
                const destinationPath = `reservas/${year}/${reservaData.reservaIdOriginal}/${fileName}`;
                detallesParseados.enlaceComprobante = await storageService.uploadFile(req.file.buffer, destinationPath, req.file.mimetype);
            } else if (detallesParseados.sinDocumento) {
                detallesParseados.enlaceComprobante = 'SIN_DOCUMENTO';
            }

            await transaccionRef.update(detallesParseados);
            
            const batch = db.batch();
            let hayPagoFinal = false;

            for (const id of individualIds) {
                const transaccionesSnapshot = await db.collection('reservas').doc(id).collection('transacciones').get();
                if (transaccionesSnapshot.docs.some(doc => doc.data().tipo === 'Pago Final')) {
                    hayPagoFinal = true;
                    break;
                }
            }

            for(const id of individualIds) {
                const reservaRef = db.collection('reservas').doc(id);
                if (hayPagoFinal) {
                    batch.update(reservaRef, { estadoGestion: 'Pendiente Boleta', pagado: true });
                } else {
                    batch.update(reservaRef, { estadoGestion: 'Pendiente Pago', pagado: false });
                }
            }
            await batch.commit();

            for(const id of individualIds) {
                 const resRef = db.collection('reservas').doc(id);
                 const transaccionesSnapshot = await resRef.collection('transacciones').get();
                 const totalAbonado = transaccionesSnapshot.docs.reduce((sum, doc) => sum + doc.data().monto, 0);
                 
                 const reservaDoc = await resRef.get();
                 const reservaData = reservaDoc.data();
                 const updatePayload = { abono: totalAbonado };

                 if (individualIds.length === 1 && totalAbonado > (reservaData.valorCLP || 0)) {
                     updatePayload.valorCLP = totalAbonado;
                     updatePayload.valorManual = true;
                 }
                 await resRef.update(updatePayload);
            }

            res.status(200).json({ message: 'Transacción actualizada y total recalculado.' });
        } catch (error) {
            console.error('Error al editar transacción:', error);
            res.status(500).json({ error: 'Error interno del servidor.' });
        }
    });

    router.post('/gestion/transaccion/eliminar', jsonParser, async (req, res) => {
        const { reservaId, transaccionId, idsIndividuales } = req.body;
         if (!reservaId || !transaccionId || !idsIndividuales) {
            return res.status(400).json({ error: 'Faltan datos para eliminar la transacción.' });
        }
        try {
            const reservaRef = db.collection('reservas').doc(reservaId);
            const transaccionRef = reservaRef.collection('transacciones').doc(transaccionId);
            
            await transaccionRef.delete();

            for(const id of idsIndividuales) {
                 const resRef = db.collection('reservas').doc(id);
                 const transaccionesSnapshot = await resRef.collection('transacciones').get();
                 const totalAbonado = transaccionesSnapshot.docs.reduce((sum, doc) => sum + doc.data().monto, 0);
                 await resRef.update({ abono: totalAbonado });
            }
            
            res.status(200).json({ message: 'Elemento eliminado correctamente.' });
        } catch (error) {
            console.error('Error al eliminar documento:', error);
            res.status(500).json({ error: 'Error interno del servidor.' });
        }
    });

    // --- INICIO DE LA NUEVA RUTA ---
    router.post('/gestion/grupo/revertir-estado', jsonParser, async (req, res) => {
        const { reservaIdOriginal, nuevoEstado, idsIndividuales } = req.body;
        if (!reservaIdOriginal || !nuevoEstado || !idsIndividuales || !Array.isArray(idsIndividuales)) {
            return res.status(400).json({ error: 'Faltan datos para revertir el estado.' });
        }

        try {
            const batch = db.batch();
            for (const id of idsIndividuales) {
                const reservaRef = db.collection('reservas').doc(id);
                batch.update(reservaRef, { estadoGestion: nuevoEstado });
            }
            await batch.commit();
            res.status(200).json({ message: `El estado del grupo ${reservaIdOriginal} se ha revertido a "${nuevoEstado}".` });
        } catch (error) {
            console.error(`Error al revertir el estado del grupo ${reservaIdOriginal}:`, error);
            res.status(500).json({ error: 'Error interno del servidor.' });
        }
    });
    // --- FIN DE LA NUEVA RUTA ---

    return router;
};