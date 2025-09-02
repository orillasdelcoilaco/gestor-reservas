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

    // --- RUTA UNIFICADA PARA ACTUALIZAR ESTADO (INDIVIDUAL Y GRUPO) ---
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

            for (const id of individualIds) {
                const reservaRef = db.collection('reservas').doc(id);
                const dataToUpdate = {};
                let nuevoEstado = '';
                
                switch (accion) {
                    case 'registrar_pago':
                        if (!detallesParseados || !detallesParseados.monto || !detallesParseados.medioDePago) {
                            return res.status(400).json({ error: 'Monto y medio de pago son requeridos.' });
                        }
                        const transaccionesRef = reservaRef.collection('transacciones');
                        const newTransactionRef = transaccionesRef.doc();
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
                        fecha: doc.data().fecha.toDate()
                    });
                });
            }
            todasLasTransacciones.sort((a, b) => a.fecha - b.fecha);
            res.status(200).json(todasLasTransacciones);
        } catch (error) {
            console.error(`Error al obtener transacciones del grupo:`, error);
            res.status(500).json({ error: 'Error interno del servidor.' });
        }
    });

    // Rutas para editar y eliminar transacciones individuales (se mantienen por si se necesitan a futuro)
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
            if (!reservaDoc.exists) { return res.status(404).json({ error: 'Reserva no encontrada.' }); }
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

    return router;
};