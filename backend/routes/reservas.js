// backend/routes/reservas.js - CÓDIGO CORREGIDO Y FINAL

const express = require('express');
const router = express.Router();
const jsonParser = express.json();

module.exports = (db) => {
    // --- OBTENER TODAS LAS RESERVAS (GET) ---
    router.get('/reservas', async (req, res) => {
        try {
            const snapshot = await db.collection('reservas').orderBy('fechaLlegada', 'desc').get();
            if (snapshot.empty) return res.status(200).json([]);

            const clientsMap = new Map();
            const clientsSnapshot = await db.collection('clientes').get();
            clientsSnapshot.forEach(doc => {
                clientsMap.set(doc.id, doc.data());
            });

            const todasLasReservas = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                const cliente = clientsMap.get(data.clienteId) || {};
                const llegada = data.fechaLlegada ? data.fechaLlegada.toDate().toLocaleDateString('es-CL') : 'N/A';
                const salida = data.fechaSalida ? data.fechaSalida.toDate().toLocaleDateString('es-CL') : 'N/A';
                todasLasReservas.push({
                    id: doc.id,
                    reservaIdOriginal: data.reservaIdOriginal || 'N/A',
                    clienteId: data.clienteId,
                    nombre: data.clienteNombre || 'Sin Nombre',
                    telefono: cliente.phone || 'Sin Teléfono',
                    llegada: llegada,
                    salida: salida,
                    estado: data.estado || 'N/A',
                    alojamiento: data.alojamiento || 'N/A',
                    canal: data.canal || 'N/A',
                    valorCLP: data.valorCLP || 0,
                    totalNoches: data.totalNoches || 0,
                    valorManual: data.valorManual || false,
                    nombreManual: data.nombreManual || false,
                    telefonoManual: cliente.telefonoManual || false
                });
            });
            res.status(200).json(todasLasReservas);
        } catch (error) {
            console.error("Error al obtener las reservas consolidadas:", error);
            res.status(500).json({ error: 'Error interno del servidor.' });
        }
    });

    // --- ACTUALIZAR UNA RESERVA INDIVIDUAL (PUT) ---
    router.put('/reservas/:id', jsonParser, async (req, res) => {
        try {
            const { id } = req.params;
            const { valorCLP, clienteNombre, telefono } = req.body;

            const reservaRef = db.collection('reservas').doc(id);
            const doc = await reservaRef.get();
            if (!doc.exists) return res.status(404).json({ error: 'La reserva no existe.' });

            const updateReservaData = {};
            const updateClienteData = {};
            const originalData = doc.data();
            const clienteRef = db.collection('clientes').doc(originalData.clienteId);

            if (valorCLP !== undefined) {
                updateReservaData.valorCLP = valorCLP;
                updateReservaData.valorOriginalCLP = originalData.valorCLP;
                updateReservaData.valorManual = true;
            }
            if (clienteNombre !== undefined) {
                updateReservaData.clienteNombre = clienteNombre;
                updateReservaData.nombreManual = true;
                // Actualizamos también el cliente
                const nameParts = clienteNombre.split(' ');
                updateClienteData.firstname = nameParts[0] || '';
                updateClienteData.lastname = nameParts.slice(1).join(' ');
            }
            if (telefono !== undefined) {
                updateClienteData.phone = telefono;
                updateClienteData.telefonoManual = true;
            }

            // Ejecutamos las actualizaciones
            if (Object.keys(updateReservaData).length > 0) {
                await reservaRef.update(updateReservaData);
            }
            if (Object.keys(updateClienteData).length > 0) {
                await clienteRef.update(updateClienteData);
            }

            res.status(200).json({ message: 'Reserva actualizada correctamente.' });
        } catch (error) {
            console.error("Error al actualizar la reserva:", error);
            res.status(500).json({ error: 'Error interno del servidor.' });
        }
    });

    // --- ACTUALIZAR UN GRUPO DE RESERVAS (PUT) ---
    router.put('/reservas/grupo/:reservaIdOriginal', jsonParser, async (req, res) => {
        try {
            const { reservaIdOriginal } = req.params;
            const { nuevoTotalCLP, clienteNombre, telefono } = req.body;

            const query = db.collection('reservas').where('reservaIdOriginal', '==', reservaIdOriginal);
            const snapshot = await query.get();
            if (snapshot.empty) return res.status(404).json({ error: 'No se encontraron reservas.' });

            const batch = db.batch();
            const clienteId = snapshot.docs[0].data().clienteId;
            const clienteRef = db.collection('clientes').doc(clienteId);
            const updateClienteData = {};

            if (telefono !== undefined) {
                updateClienteData.phone = telefono;
                updateClienteData.telefonoManual = true;
            }
            if (clienteNombre !== undefined) {
                 const nameParts = clienteNombre.split(' ');
                updateClienteData.firstname = nameParts[0] || '';
                updateClienteData.lastname = nameParts.slice(1).join(' ');
            }
            
            // Actualizamos el cliente si hay cambios
            if (Object.keys(updateClienteData).length > 0) {
                batch.update(clienteRef, updateClienteData);
            }
            
            // Actualizamos todas las reservas del grupo
            snapshot.forEach(doc => {
                const docRef = db.collection('reservas').doc(doc.id);
                const updateReservaData = {};
                if (clienteNombre !== undefined) {
                    updateReservaData.clienteNombre = clienteNombre;
                    updateReservaData.nombreManual = true;
                }
                if (Object.keys(updateReservaData).length > 0) {
                    batch.update(docRef, updateReservaData);
                }
            });

            if (nuevoTotalCLP !== undefined) {
                let totalActualCLP = 0;
                const reservasDelGrupo = [];
                snapshot.forEach(doc => {
                    const data = doc.data();
                    totalActualCLP += data.valorCLP;
                    reservasDelGrupo.push({ id: doc.id, valorCLP: data.valorCLP });
                });
                reservasDelGrupo.forEach(reserva => {
                    const docRef = db.collection('reservas').doc(reserva.id);
                    const proporcion = totalActualCLP > 0 ? reserva.valorCLP / totalActualCLP : 1 / reservasDelGrupo.length;
                    const nuevoValorIndividual = Math.round(nuevoTotalCLP * proporcion);
                    batch.update(docRef, {
                        valorCLP: nuevoValorIndividual,
                        valorOriginalCLP: reserva.valorCLP,
                        valorManual: true
                    });
                });
            }

            await batch.commit();
            res.status(200).json({ message: `Grupo de reserva ${reservaIdOriginal} actualizado.` });
        } catch (error) {
            console.error("Error al actualizar el grupo de reservas:", error);
            res.status(500).json({ error: 'Error interno del servidor.' });
        }
    });

    // --- OBTENER RESERVAS DE UN CLIENTE (GET) ---
    router.get('/reservas/cliente/:clienteId', async (req, res) => {
        const { clienteId } = req.params;
        if (!clienteId) {
            return res.status(400).json({ error: 'Falta el ID del cliente.' });
        }

        try {
            const q = db.collection('reservas')
                .where('clienteId', '==', clienteId)
                .orderBy('fechaLlegada', 'desc');
            
            const snapshot = await q.get();

            if (snapshot.empty) {
                return res.status(200).json([]);
            }

            const reservasCliente = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                reservasCliente.push({
                    id: doc.id,
                    llegada: data.fechaLlegada.toDate().toLocaleDateString('es-CL'),
                    salida: data.fechaSalida.toDate().toLocaleDateString('es-CL'),
                    alojamiento: data.alojamiento,
                    canal: data.canal,
                    valorCLP: data.valorCLP,
                    estado: data.estado
                });
            });

            res.status(200).json(reservasCliente);

        } catch (error) {
            console.error(`Error al obtener las reservas para el cliente ${clienteId}:`, error);
            res.status(500).json({ error: 'Error interno del servidor.' });
        }
    });

    return router;
};