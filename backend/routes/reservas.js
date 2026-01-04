const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const jsonParser = express.json();
const { updateClientMaster } = require('../services/clienteService');
const { createManualReservation } = require('../services/reservaService');
const { getAvailabilityData } = require('../services/presupuestoService');

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

            const todasLasReservas = snapshot.docs.map(doc => {
                const data = doc.data();
                const cliente = clientsMap.get(data.clienteId) || {};
                return {
                    id: doc.id,
                    reservaIdOriginal: data.reservaIdOriginal || 'N/A',
                    clienteId: data.clienteId,
                    nombre: data.clienteNombre || 'Sin Nombre',
                    telefono: cliente.phone || 'Sin Teléfono',
                    llegada: data.fechaLlegada && typeof data.fechaLlegada.toDate === 'function' ? data.fechaLlegada.toDate().toISOString().split('T')[0] : 'Fecha Inválida',
                    salida: data.fechaSalida && typeof data.fechaSalida.toDate === 'function' ? data.fechaSalida.toDate().toISOString().split('T')[0] : 'Fecha Inválida',
                    estado: data.estado || 'N/A',
                    alojamiento: data.alojamiento || 'N/A',
                    canal: data.canal || 'N/A',
                    valorCLP: data.valorCLP || 0,
                    totalNoches: data.totalNoches || 0,
                    estadoGestion: data.estadoGestion || 'N/A',
                    comision: data.comision || 0,
                    valorDolarDia: data.valorDolarDia || 1,
                    monedaOriginal: data.monedaOriginal || 'CLP'
                };
            });
            res.status(200).json(todasLasReservas);
        } catch (error) {
            console.error("Error al obtener las reservas consolidadas:", error);
            res.status(500).json({ error: 'Error interno del servidor.' });
        }
    });

    // --- OBTENER DETALLES DE UNA RESERVA INDIVIDUAL (GET) ---
    router.get('/reservas/detalles/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const doc = await db.collection('reservas').doc(id).get();
            if (!doc.exists) return res.status(404).json({ error: 'La reserva no existe.' });

            const data = doc.data();
            const reservaConFechasISO = {
                ...data,
                fechaLlegada: data.fechaLlegada.toDate().toISOString().split('T')[0],
                fechaSalida: data.fechaSalida.toDate().toISOString().split('T')[0],
                fechaReserva: data.fechaReserva ? data.fechaReserva.toDate().toISOString().split('T')[0] : null
            };
            res.status(200).json(reservaConFechasISO);
        } catch (error) {
            console.error("Error al obtener los detalles de la reserva:", error);
            res.status(500).json({ error: 'Error interno del servidor.' });
        }
    });

    // --- OBTENER DETALLES COMPLETOS DE UN GRUPO DE RESERVA (GET) ---
    router.get('/reservas/grupo-detalles/:reservaIdOriginal', async (req, res) => {
        try {
            const { reservaIdOriginal } = req.params;
            const q = db.collection('reservas').where('reservaIdOriginal', '==', reservaIdOriginal);
            const snapshot = await q.get();

            if (snapshot.empty) {
                return res.status(404).json({ error: 'No se encontraron reservas con ese ID.' });
            }

            let grupo = {
                valorTotalCLP: 0,
                valorPotencialTotalCLP: 0,
                documentos: {},
                transacciones: [],
                notas: []
            };

            for (const doc of snapshot.docs) {
                const data = doc.data();
                grupo.valorTotalCLP += data.valorCLP || 0;
                grupo.valorPotencialTotalCLP += data.valorPotencialCLP || 0;

                if (data.documentos) {
                    grupo.documentos = { ...grupo.documentos, ...data.documentos };
                }

                const transaccionesSnapshot = await doc.ref.collection('transacciones').get();
                transaccionesSnapshot.forEach(transDoc => {
                    const transData = transDoc.data();
                    grupo.transacciones.push({
                        id: transDoc.id,
                        ...transData,
                        fecha: transData.fecha ? transData.fecha.toDate().toLocaleString('es-CL') : 'N/A'
                    });
                });
            }

            const notasSnapshot = await db.collection('gestion_notas')
                .where('reservaIdOriginal', '==', reservaIdOriginal)
                .orderBy('fecha', 'desc')
                .get();

            if (!notasSnapshot.empty) {
                grupo.notas = notasSnapshot.docs.map(doc => {
                    const data = doc.data();
                    return {
                        ...data,
                        fecha: data.fecha ? data.fecha.toDate().toLocaleString('es-CL', { timeZone: 'UTC' }) : 'N/A'
                    };
                });
            }

            grupo.transacciones.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

            res.status(200).json(grupo);
        } catch (error) {
            console.error("Error al obtener detalles del grupo de reserva:", error);
            res.status(500).json({ error: 'Error interno del servidor.' });
        }
    });


    // --- ACTUALIZAR UNA RESERVA INDIVIDUAL (PUT) ---
    router.put('/reservas/:id', jsonParser, async (req, res) => {
        try {
            const { id } = req.params;
            const datosActualizados = req.body;
            const reservaRef = db.collection('reservas').doc(id);

            if (datosActualizados.fechaLlegada) {
                datosActualizados.fechaLlegada = admin.firestore.Timestamp.fromDate(new Date(datosActualizados.fechaLlegada + 'T00:00:00Z'));
            }
            if (datosActualizados.fechaSalida) {
                datosActualizados.fechaSalida = admin.firestore.Timestamp.fromDate(new Date(datosActualizados.fechaSalida + 'T00:00:00Z'));
            }

            await reservaRef.update(datosActualizados);
            res.status(200).json({ message: 'Reserva actualizada correctamente.' });
        } catch (error) {
            console.error("Error al actualizar la reserva:", error);
            res.status(500).json({ error: 'Error interno del servidor.' });
        }
    });

    // --- ELIMINAR UNA RESERVA INDIVIDUAL (DELETE) ---
    router.delete('/reservas/:id', async (req, res) => {
        try {
            const { id } = req.params;
            await db.collection('reservas').doc(id).delete();
            res.status(200).json({ message: 'Reserva eliminada exitosamente.' });
        } catch (error) {
            console.error(`Error al eliminar la reserva ${id}:`, error);
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

            const clienteId = snapshot.docs[0].data().clienteId;

            if (clienteNombre || telefono) {
                const clienteRef = db.collection('clientes').doc(clienteId);
                const clienteDoc = await clienteRef.get();
                const clienteData = clienteDoc.exists ? clienteDoc.data() : {};
                const nameParts = clienteNombre ? clienteNombre.split(' ') : [];
                const telefonoParaActualizar = telefono || clienteData.phone;
                await updateClientMaster(db, clienteId, {
                    firstname: nameParts.length > 0 ? nameParts[0] : clienteData.firstname,
                    lastname: nameParts.length > 1 ? nameParts.slice(1).join(' ') : clienteData.lastname,
                    phone: telefonoParaActualizar
                });
            }

            if (nuevoTotalCLP !== undefined) {
                const batch = db.batch();
                let totalActualCLP = 0;
                snapshot.forEach(doc => { totalActualCLP += doc.data().valorCLP; });
                snapshot.forEach(doc => {
                    const docRef = db.collection('reservas').doc(doc.id);
                    const proporcion = totalActualCLP > 0 ? doc.data().valorCLP / totalActualCLP : 1 / snapshot.size;
                    const nuevoValorIndividual = Math.round(nuevoTotalCLP * proporcion);
                    batch.update(docRef, { valorCLP: nuevoValorIndividual, valorManual: true });
                });
                await batch.commit();
            }

            res.status(200).json({ message: `Grupo de reserva ${reservaIdOriginal} actualizado.` });
        } catch (error) {
            console.error("Error al actualizar el grupo de reservas:", error);
            res.status(500).json({ error: 'Error interno del servidor.' });
        }
    });

    // --- OBTENER RESERVAS DE UN CLIENTE (GET) ---
    router.get('/reservas/cliente/:clienteId', async (req, res) => {
        try {
            const { clienteId } = req.params;
            const q = db.collection('reservas').where('clienteId', '==', clienteId).orderBy('fechaLlegada', 'desc');
            const snapshot = await q.get();

            if (snapshot.empty) {
                return res.status(200).json([]);
            }
            const historial = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    llegada: data.fechaLlegada.toDate().toLocaleDateString('es-CL', { timeZone: 'UTC' }),
                    salida: data.fechaSalida.toDate().toLocaleDateString('es-CL', { timeZone: 'UTC' }),
                    alojamiento: data.alojamiento,
                    canal: data.canal,
                    valorCLP: data.valorCLP,
                    estado: data.estado
                };
            });
            res.status(200).json(historial);
        } catch (error) {
            console.error("Error al obtener el historial del cliente:", error);
            res.status(500).json({ error: 'Error interno del servidor.' });
        }
    });

    // --- ENDPOINT PARA EL CALENDARIO (OPTIMIZADO) ---
    router.get('/reservas/calendario', async (req, res) => {
        const { anio, mes } = req.query;
        if (!anio || !mes) {
            return res.status(400).json({ error: 'Se requieren el año y el mes.' });
        }

        try {
            const anioNum = parseInt(anio);
            const mesNum = parseInt(mes) - 1;

            const primerDia = new Date(Date.UTC(anioNum, mesNum, 1));
            const ultimoDia = new Date(Date.UTC(anioNum, mesNum + 1, 0, 23, 59, 59));

            const startTimestamp = admin.firestore.Timestamp.fromDate(primerDia);
            const endTimestamp = admin.firestore.Timestamp.fromDate(ultimoDia);

            const querySnapshot = await db.collection('reservas')
                .where('fechaSalida', '>=', startTimestamp)
                .where('fechaLlegada', '<=', endTimestamp)
                .get();

            const reservasDelMes = [];
            querySnapshot.forEach(doc => {
                const data = doc.data();
                if (data.estado && data.estado.trim().toLowerCase() === 'confirmada') {
                    const uniqueTitle = [...new Set((data.clienteNombre || '').split('\n'))].join(' ').trim();
                    const fechaSalida = data.fechaSalida.toDate();
                    fechaSalida.setDate(fechaSalida.getDate() + 1);

                    reservasDelMes.push({
                        id: doc.id,
                        title: uniqueTitle,
                        start: data.fechaLlegada.toDate().toISOString().split('T')[0],
                        end: fechaSalida.toISOString().split('T')[0],
                        resourceId: data.alojamiento,
                        extendedProps: {
                            canal: data.canal,
                            reservaIdOriginal: data.reservaIdOriginal
                        }
                    });
                }
            });

            res.status(200).json(reservasDelMes);

        } catch (error) {
            console.error("Error al obtener datos para el calendario:", error);
            res.status(500).json({ error: 'Error interno del servidor.' });
        }
    });

    // --- ENDPOINT PARA DISPONIBILIDAD ---
    router.get('/reservas/disponibilidad', async (req, res) => {
        const { fechaDesde } = req.query;
        if (!fechaDesde) {
            return res.status(400).json({ error: 'Se requiere una fecha de inicio.' });
        }

        try {
            const startTimestamp = admin.firestore.Timestamp.fromDate(new Date(fechaDesde + 'T00:00:00Z'));

            const cabanasSnapshot = await db.collection('cabanas').get();
            const cabanasActivas = cabanasSnapshot.docs.map(doc => doc.data().nombre);

            const reservasFuturasSnapshot = await db.collection('reservas')
                .where('fechaLlegada', '>=', startTimestamp)
                .orderBy('fechaLlegada', 'asc')
                .get();

            const proximaReservaPorCabana = new Map();

            reservasFuturasSnapshot.forEach(doc => {
                const reserva = doc.data();
                if (reserva.estado !== 'Cancelada') {
                    if (!proximaReservaPorCabana.has(reserva.alojamiento)) {
                        proximaReservaPorCabana.set(reserva.alojamiento, reserva.fechaLlegada.toDate());
                    }
                }
            });

            const disponibilidad = cabanasActivas.map(nombreCabana => {
                return {
                    cabana: nombreCabana,
                    proximaReserva: proximaReservaPorCabana.get(nombreCabana)?.toISOString().split('T')[0] || null
                };
            });

            res.status(200).json(disponibilidad);

        } catch (error) {
            console.error("Error al calcular la disponibilidad:", error);
            res.status(500).json({ error: 'Error interno del servidor.' });
        }
    });

    // --- ENDPOINT PARA CREAR RESERVA MANUAL ---
    router.post('/reservas/crear-manual', jsonParser, async (req, res) => {
        try {
            const reservaData = req.body;
            const reservaId = await createManualReservation(db, reservaData);
            res.status(201).json({ message: 'Reserva creada exitosamente', reservaIdOriginal: reservaId });
        } catch (error) {
            console.error("Error al crear la reserva manual:", error);
            res.status(500).json({ error: 'Error interno del servidor al crear la reserva.' });
        }
    });

    // --- OBTENER PROPUESTAS PENDIENTES ---
    router.get('/reservas/propuestas', async (req, res) => {
        try {
            const snapshot = await db.collection('reservas')
                .where('estado', '==', 'Pendiente Aprobación')
                .orderBy('fechaReserva', 'desc')
                .get();

            if (snapshot.empty) {
                return res.status(200).json([]);
            }

            const propuestasAgrupadas = {};
            snapshot.forEach(doc => {
                const data = doc.data();
                if (!propuestasAgrupadas[data.reservaIdOriginal]) {
                    propuestasAgrupadas[data.reservaIdOriginal] = {
                        ...data,
                        id: data.reservaIdOriginal,
                        fechaReserva: data.fechaReserva.toDate().toLocaleDateString('es-CL', { timeZone: 'UTC' }),
                        fechaLlegada: data.fechaLlegada.toDate().toLocaleDateString('es-CL', { timeZone: 'UTC' }),
                        fechaSalida: data.fechaSalida.toDate().toLocaleDateString('es-CL', { timeZone: 'UTC' }),
                        valorTotal: 0,
                        cabañas: []
                    };
                }
                propuestasAgrupadas[data.reservaIdOriginal].valorTotal += data.valorCLP;
                propuestasAgrupadas[data.reservaIdOriginal].cabañas.push(data.alojamiento);
            });

            res.status(200).json(Object.values(propuestasAgrupadas));
        } catch (error) {
            console.error("Error al obtener propuestas pendientes:", error);
            res.status(500).json({ error: 'Error interno del servidor.' });
        }
    });

    // --- OBTENER DETALLES DE UNA PROPUESTA PARA REGENERAR TEXTO ---
    router.get('/reservas/propuestas/detalles/:reservaIdOriginal', async (req, res) => {
        const { reservaIdOriginal } = req.params;
        try {
            const q = db.collection('reservas').where('reservaIdOriginal', '==', reservaIdOriginal);
            const snapshot = await q.get();

            if (snapshot.empty) {
                return res.status(404).json({ error: 'No se encontraron reservas para esta propuesta.' });
            }

            const clienteId = snapshot.docs[0].data().clienteId;
            const clienteDoc = await db.collection('clientes').doc(clienteId).get();
            const clienteData = clienteDoc.exists ? clienteDoc.data() : { nombre: 'N/A' };

            const cabanaNombres = snapshot.docs.map(doc => doc.data().alojamiento);
            const cabanasSnapshot = await db.collection('cabanas').where('nombre', 'in', cabanaNombres).get();
            const cabanasMap = new Map(cabanasSnapshot.docs.map(doc => [doc.data().nombre, doc.data()]));

            const primeraReserva = snapshot.docs[0].data();
            const propuesta = {
                reservaIdOriginal,
                cliente: {
                    nombre: primeraReserva.clienteNombre,
                    empresa: clienteData.fuente || ''
                },
                fechaLlegada: primeraReserva.fechaLlegada.toDate().toISOString().split('T')[0],
                fechaSalida: primeraReserva.fechaSalida.toDate().toISOString().split('T')[0],
                personas: primeraReserva.invitados,
                noches: primeraReserva.totalNoches,
                valorTotal: 0,
                valorPotencial: 0,
                detallesAlojamiento: []
            };

            snapshot.forEach(doc => {
                const data = doc.data();
                propuesta.valorTotal += data.valorCLP || 0;
                propuesta.valorPotencial += data.valorPotencialCLP || 0;
                const cabanaInfo = cabanasMap.get(data.alojamiento);
                if (cabanaInfo) {
                    propuesta.detallesAlojamiento.push({
                        nombre: cabanaInfo.nombre,
                        descripcion: cabanaInfo.descripcion || '',
                        linkFotos: cabanaInfo.linkFotos || '',
                        valorPorNoche: (data.valorPotencialCLP || 0) / data.totalNoches,
                        valorTotal: data.valorPotencialCLP || 0
                    });
                }
            });

            res.status(200).json(propuesta);
        } catch (error) {
            console.error("Error al obtener detalles de la propuesta:", error);
            res.status(500).json({ error: 'Error interno del servidor.' });
        }
    });

    // --- ACTUALIZAR ESTADO DE PROPUESTA (CONFIRMAR/CANCELAR) ---
    router.post('/reservas/propuestas/:reservaIdOriginal/estado', jsonParser, async (req, res) => {
        const { reservaIdOriginal } = req.params;
        const { nuevoEstado } = req.body;

        if (!nuevoEstado || !['Confirmada', 'Cancelada'].includes(nuevoEstado)) {
            return res.status(400).json({ error: 'Estado no válido.' });
        }

        try {
            const q = db.collection('reservas').where('reservaIdOriginal', '==', reservaIdOriginal);
            const snapshot = await q.get();

            if (snapshot.empty) {
                return res.status(404).json({ error: 'Propuesta no encontrada.' });
            }

            if (nuevoEstado === 'Confirmada') {
                for (const doc of snapshot.docs) {
                    const propuesta = doc.data();
                    const { availableCabanas } = await getAvailabilityData(db, propuesta.fechaLlegada.toDate(), propuesta.fechaSalida.toDate());
                    const cabanaSigueDisponible = availableCabanas.some(c => c.nombre === propuesta.alojamiento);
                    if (!cabanaSigueDisponible) {
                        return res.status(409).json({ error: `La cabaña ${propuesta.alojamiento} ya no está disponible para las fechas solicitadas.` });
                    }
                }
            }

            const batch = db.batch();
            snapshot.docs.forEach(doc => {
                batch.update(doc.ref, { estado: nuevoEstado });
            });
            await batch.commit();

            res.status(200).json({ message: `La propuesta ${reservaIdOriginal} ha sido actualizada a: ${nuevoEstado}` });
        } catch (error) {
            console.error("Error al actualizar estado de la propuesta:", error);
            res.status(500).json({ error: 'Error interno del servidor.' });
        }
    });

    // --- RECHAZAR PROPUESTA CON MOTIVO ---
    router.post('/reservas/propuestas/:reservaIdOriginal/rechazar', jsonParser, async (req, res) => {
        const { reservaIdOriginal } = req.params;
        const { motivo, nota } = req.body;

        if (!motivo) {
            return res.status(400).json({ error: 'Se requiere un motivo para rechazar la propuesta.' });
        }

        try {
            const q = db.collection('reservas').where('reservaIdOriginal', '==', reservaIdOriginal);
            const snapshot = await q.get();

            if (snapshot.empty) {
                return res.status(404).json({ error: 'Propuesta no encontrada.' });
            }

            const batch = db.batch();
            const rechazoInfo = {
                motivo: motivo,
                nota: nota || '',
                fecha: admin.firestore.FieldValue.serverTimestamp()
            };

            snapshot.docs.forEach(doc => {
                batch.update(doc.ref, {
                    estado: 'Rechazada',
                    rechazoInfo: rechazoInfo
                });
            });
            await batch.commit();

            res.status(200).json({ message: `La propuesta ${reservaIdOriginal} ha sido marcada como Rechazada.` });
        } catch (error) {
            console.error("Error al rechazar la propuesta:", error);
            res.status(500).json({ error: 'Error interno del servidor.' });
        }
    });

    // --- CORREGIDO: CORREGIR IDENTIDAD DE RESERVA (MOVER DATOS) ---
    router.post('/reservas/corregir-identidad', jsonParser, async (req, res) => {
        const { viejoIdCompleto, nuevosDatos } = req.body;

        if (!viejoIdCompleto || !nuevosDatos || !nuevosDatos.reservaIdOriginal || !nuevosDatos.canal) {
            return res.status(400).json({ error: 'Faltan datos para la corrección de identidad.' });
        }

        const viejoReservaRef = db.collection('reservas').doc(viejoIdCompleto);

        try {
            const resultado = await db.runTransaction(async (transaction) => {
                const viejoDoc = await transaction.get(viejoReservaRef);
                if (!viejoDoc.exists) {
                    throw new Error('La reserva original no existe.');
                }

                const datosViejos = viejoDoc.data();
                const datosMezclados = { ...datosViejos, ...nuevosDatos };
                const nuevoIdCompleto = `${nuevosDatos.canal.toUpperCase()}_${nuevosDatos.reservaIdOriginal}_${datosMezclados.alojamiento.replace(/\s+/g, '')}`;

                if (viejoIdCompleto === nuevoIdCompleto) {
                    throw new Error('El nuevo ID es idéntico al antiguo. No se requiere ninguna acción.');
                }

                const nuevoReservaRef = db.collection('reservas').doc(nuevoIdCompleto);
                const nuevoDocCheck = await transaction.get(nuevoReservaRef);
                if (nuevoDocCheck.exists) {
                    throw new Error(`Ya existe una reserva con el nuevo ID (${nuevoIdCompleto}). No se puede combinar.`);
                }

                const viejaTransaccionesRef = viejoReservaRef.collection('transacciones');
                const transaccionesSnapshot = await transaction.get(viejaTransaccionesRef);

                let notasSnapshot = null;
                if (datosViejos.reservaIdOriginal !== nuevosDatos.reservaIdOriginal) {
                    const notasQuery = db.collection('gestion_notas').where('reservaIdOriginal', '==', datosViejos.reservaIdOriginal);
                    notasSnapshot = await transaction.get(notasQuery);
                }

                if (datosMezclados.fechaLlegada && typeof datosMezclados.fechaLlegada === 'string') {
                    datosMezclados.fechaLlegada = admin.firestore.Timestamp.fromDate(new Date(datosMezclados.fechaLlegada + 'T00:00:00Z'));
                }
                if (datosMezclados.fechaSalida && typeof datosMezclados.fechaSalida === 'string') {
                    datosMezclados.fechaSalida = admin.firestore.Timestamp.fromDate(new Date(datosMezclados.fechaSalida + 'T00:00:00Z'));
                }

                let transaccionesMovidas = 0;
                if (!transaccionesSnapshot.empty) {
                    const nuevaTransaccionesRef = nuevoReservaRef.collection('transacciones');
                    transaccionesSnapshot.forEach(doc => {
                        transaction.set(nuevaTransaccionesRef.doc(doc.id), doc.data());
                        transaction.delete(doc.ref);
                        transaccionesMovidas++;
                    });
                }

                let notasActualizadas = 0;
                if (notasSnapshot && !notasSnapshot.empty) {
                    notasSnapshot.forEach(doc => {
                        transaction.update(doc.ref, { reservaIdOriginal: nuevosDatos.reservaIdOriginal });
                        notasActualizadas++;
                    });
                }

                const obsoletoRef = db.collection('reservas_obsoletas').doc(viejoIdCompleto);
                transaction.set(obsoletoRef, {
                    nuevaReservaId: nuevoIdCompleto,
                    motivo: 'Corrección manual de identidad desde la interfaz.',
                    fechaCorreccion: admin.firestore.FieldValue.serverTimestamp()
                });

                transaction.set(nuevoReservaRef, datosMezclados);
                transaction.delete(viejoReservaRef);

                return {
                    viejoId: viejoIdCompleto,
                    nuevoId: nuevoIdCompleto,
                    transaccionesMovidas,
                    notasActualizadas
                };
            });

            res.status(200).json({
                message: 'La reserva ha sido movida y actualizada exitosamente.',
                summary: `Se movió la reserva de ${resultado.viejoId} a ${resultado.nuevoId}. Se migraron ${resultado.transaccionesMovidas} transacciones y se actualizaron ${resultado.notasActualizadas} notas de gestión.`
            });

        } catch (error) {
            console.error("Error al corregir la identidad de la reserva:", error);
            res.status(500).json({ error: error.message || 'Error interno del servidor.' });
        }
    });

    return router;
};