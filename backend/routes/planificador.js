const express = require('express');
const admin = require('firebase-admin');
const router = express.Router();
const jsonParser = express.json();
const {
    getTrabajadores,
    saveTrabajador,
    deleteTrabajador,
    generarPropuestaRango,
    savePlan,
    getPlan,
    updateCabinState,
    resetCabinStates
} = require('../services/planificadorService');

const {
    getTaskConfig,
    updateTaskConfig,
    getWorkerConfig,
    updateWorkerConfig
} = require('../services/configService');

module.exports = (db) => {

    // --- TRABAJADORES ---

    router.get('/planificador/trabajadores', async (req, res) => {
        try {
            const trabajadores = await getTrabajadores(db);
            res.status(200).json(trabajadores);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    router.post('/planificador/trabajadores', jsonParser, async (req, res) => {
        try {
            const result = await saveTrabajador(db, req.body);
            res.status(200).json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    router.delete('/planificador/trabajadores/:id', async (req, res) => {
        try {
            const result = await deleteTrabajador(db, req.params.id);
            res.status(200).json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // --- PLANIFICACIÓN ---

    router.get('/planificador/propuesta', async (req, res) => {
        try {
            const { fecha, fechaInicio, fechaFin } = req.query;

            // Soporte para rango o fecha única (como fallback)
            let start = fechaInicio || fecha;
            let end = fechaFin || fecha;

            if (!start) return res.status(400).json({ error: 'Fecha requerida' });

            // Llamar al servicio de rango
            const dias = await generarPropuestaRango(db, start, end);

            console.log(`[API] Enviando respuesta propuesta (${dias.dias.length} dias). Tamaño estimado JSON: ${JSON.stringify(dias).length}`);
            res.status(200).json(dias);
            console.log('[API] Respuesta enviada correctamente.');
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    router.post('/planificador/guardar', jsonParser, async (req, res) => {
        try {
            // req.body: { fecha: 'YYYY-MM-DD', tareas: [...] }
            await savePlan(db, req.body);
            res.status(200).json({ message: 'Plan guardado correctamente' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    router.post('/planificador/estado', jsonParser, async (req, res) => {
        try {
            const { cabana, estado } = req.body;
            const result = await updateCabinState(db, cabana, estado);
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    router.post('/planificador/reset-estados', async (req, res) => {
        try {
            const { forceFullReset } = req.body;

            console.log('[Reset] forceFullReset:', forceFullReset);

            // Always reset cabin states
            const result = await resetCabinStates(db);

            // If force reset, delete ALL planAseo documents
            if (forceFullReset) {
                console.log('[Reset] Deleting ALL planAseo documents...');
                const allPlan = await db.collection('planAseo').get();
                console.log(`[Reset] Found ${allPlan.size} plan documents to delete`);

                const batch = db.batch();
                allPlan.forEach(doc => batch.delete(doc.ref));
                await batch.commit();

                console.log('[Reset] All planAseo documents deleted');
                return res.json({
                    ...result,
                    deletedTasks: allPlan.size,
                    message: 'Reset total completado - todas las tareas eliminadas'
                });
            }

            // If not force reset, only delete AUTO-generated tasks, preserve MANUAL
            console.log('[Reset] Deleting only AUTO tasks, preserving MANUAL edits...');
            const autoTasks = await db.collection('planAseo')
                .where('origen', '==', 'auto')
                .get();
            console.log(`[Reset] Found ${autoTasks.size} auto tasks to delete`);

            const batch = db.batch();
            autoTasks.forEach(doc => batch.delete(doc.ref));
            await batch.commit();

            console.log('[Reset] Auto tasks deleted, manual tasks preserved');
            res.json({
                ...result,
                deletedTasks: autoTasks.size,
                message: 'Estados reseteados - modificaciones manuales preservadas'
            });
        } catch (error) {
            console.error('[Reset] Error:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // --- CONFIGURACIÓN ---

    router.post('/planificador/send-summary', jsonParser, async (req, res) => {
        try {
            const { workerId } = req.body;
            // Logic to send summary
            const planificadorService = require('../services/planificadorService');
            await planificadorService.sendWorkerDailySummary(db, workerId);
            res.json({ message: 'Resumen enviado correctamente' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: error.message });
        }
    });

    router.get('/planificador/configuracion/tareas', async (req, res) => {
        try {
            const config = await getTaskConfig(db);
            res.json(config);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    router.put('/planificador/configuracion/tareas', jsonParser, async (req, res) => {
        try {
            const { taskType, config } = req.body;
            const result = await updateTaskConfig(db, taskType, config);
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    router.get('/trabajadores/:id/configuracion', async (req, res) => {
        try {
            const config = await getWorkerConfig(db, req.params.id);
            res.json(config);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    router.put('/trabajadores/:id/configuracion', jsonParser, async (req, res) => {
        try {
            const result = await updateWorkerConfig(db, req.params.id, req.body);
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // === EDICIÓN MANUAL DE TAREAS ===
    router.post('/planificador/editar-tarea', jsonParser, async (req, res) => {
        try {
            let { fecha, cabanaId, tipoAseo, accion, horarioInicio, horarioFin, trabajadorId } = req.body;

            console.log('[EditTask] Request:', { fecha, cabanaId, tipoAseo, accion });

            if (!fecha || !accion) {
                console.log('[EditTask] Missing required params');
                return res.status(400).json({ error: "Faltan parámetros requeridos" });
            }

            const fechaDate = new Date(fecha + 'T00:00:00Z');
            const startDay = admin.firestore.Timestamp.fromDate(new Date(fecha + 'T00:00:00Z'));
            startDay.toDate().setUTCHours(0, 0, 0, 0);
            const endDay = admin.firestore.Timestamp.fromDate(new Date(fecha + 'T23:59:59Z'));


            // Normalize action
            if (accion) accion = accion.trim().toLowerCase();

            console.log(`[EditTask] Processing: Action="${accion}", Cab="${cabanaId}", Date="${fecha}"`);

            if (accion === 'delete') {
                // Eliminar tarea
                console.log(`[EditTask] Deleting task for cab: ${cabanaId} on date: ${fecha}`);

                // Prevent accidentally deleting EVERYTHING if cabanaId is missing (Safety)
                if (!cabanaId) {
                    return res.status(400).json({ error: "Falta cabanaId para eliminar" });
                }

                const snapshot = await db.collection('planAseo')
                    .where('fecha', '>=', startDay)
                    .where('fecha', '<=', endDay)
                    .where('cabanaId', '==', cabanaId)
                    .get();

                console.log(`[EditTask] Found ${snapshot.size} tasks to delete.`);

                const batch = db.batch();
                snapshot.forEach(doc => batch.delete(doc.ref));
                await batch.commit();

                // Regenerate plan for this day ONLY to get fresh state (refill gaps, recalc alerts)
                const freshPlanResult = await generarPropuestaRango(db, fecha, fecha);
                const updatedDay = freshPlanResult && freshPlanResult.dias && freshPlanResult.dias.length > 0 ? freshPlanResult.dias[0] : null;

                return res.json({ message: "Tarea eliminada", fecha, cabanaId, updatedDay });

            } else if (accion === 'add' || accion === 'edit') {
                if (!cabanaId || !tipoAseo) {
                    console.log('[EditTask] Missing cabanaId or tipoAseo');
                    return res.status(400).json({ error: "Faltan parámetros para agregar/editar tarea" });
                }

                // Validaciones
                const taskConfig = await getTaskConfig(db);
                console.log('[EditTask] Task config loaded, checking tipoAseo:', tipoAseo);

                if (!taskConfig[tipoAseo]) {
                    console.log('[EditTask] Invalid task type:', tipoAseo, 'Available:', Object.keys(taskConfig));
                    return res.status(400).json({ error: "Tipo de tarea inválido: " + tipoAseo });
                }

                // Verificar si la cabaña ya tiene una tarea ese día
                const existingSnapshot = await db.collection('planAseo')
                    .where('fecha', '>=', startDay)
                    .where('fecha', '<=', endDay)
                    .where('cabanaId', '==', cabanaId)
                    .get();

                console.log(`[EditTask] Found ${existingSnapshot.size} existing task(s) for ${cabanaId} on ${fecha}`);

                if (!existingSnapshot.empty && accion === 'add') {
                    return res.status(400).json({ error: "La cabaña ya tiene una tarea asignada este día" });
                }

                // Calcular esfuerzo del día
                const allTasksSnapshot = await db.collection('planAseo')
                    .where('fecha', '>=', startDay)
                    .where('fecha', '<=', endDay)
                    .get();

                console.log(`[EditTask] Total tasks in day: ${allTasksSnapshot.size}`);

                let currentEffort = 0;
                allTasksSnapshot.forEach(doc => {
                    const taskData = doc.data();
                    if (taskData.cabanaId !== cabanaId || accion === 'add') { // No contar la tarea existente si es edit
                        const taskType = taskData.tipoAseo;
                        currentEffort += taskConfig[taskType]?.peso || 1.0;
                    }
                });

                const newTaskWeight = taskConfig[tipoAseo].peso;
                const totalEffort = currentEffort + newTaskWeight;

                // Obtener capacidad del trabajador
                const workerConfig = trabajadorId
                    ? await getWorkerConfig(db, trabajadorId)
                    : { capacidadDiaria: 3.0, diasLibres: [1] };

                // Validar día libre
                const dayOfWeek = fechaDate.getUTCDay();
                if (workerConfig.diasLibres.includes(dayOfWeek) && tipoAseo !== 'Cambio') {
                    return res.status(400).json({
                        error: "No se pueden asignar tareas en día libre (excepto Cambios obligatorios)"
                    });
                }

                // Guardar/actualizar tarea
                const batch = db.batch();

                // Si es edit, eliminar SOLO la tarea de esta cabaña
                if (accion === 'edit') {
                    console.log(`[Edit-Debug] Processing edit for Cabana: "${cabanaId}" on ${fecha}`);

                    if (existingSnapshot.empty) {
                        console.log(`[Edit-Debug] WARNING: No existing tasks found for Cabana ${cabanaId} to replace! This will act as ADD.`);
                    } else {
                        // SAFETY CHECK: If we match more tasks than reasonable (e.g. > 1 for single cabin), abort
                        if (existingSnapshot.size > 1) {
                            console.error(`[Edit-CRITICAL] SAFETY ABORT: Found ${existingSnapshot.size} tasks for SINGLE cabin ${cabanaId}. Refusing to delete potentially unrelated tasks.`);
                            existingSnapshot.forEach(doc => console.error(`  -> Would have deleted: ${doc.id} | Cab:${doc.data().cabanaId}`));
                            return res.status(500).json({ error: "INTEGRITY ERROR: Multiple tasks found for this cabin. Aborting edit to protect data." });
                        }

                        console.log(`[Edit-Debug] Found ${existingSnapshot.size} EXISTING tasks for Cabana ${cabanaId}`);
                        existingSnapshot.forEach(doc => {
                            const d = doc.data();
                            console.log(`  -> Will DELETE: ID:${doc.id} | Cab:${d.cabanaId} | Tipo:${d.tipoAseo} | Fecha:${d.fecha.toDate().toISOString()}`);
                            batch.delete(doc.ref);
                        });
                    }
                }

                // Crear nueva tarea con los datos actualizados
                const newTaskRef = db.collection('planAseo').doc();
                const newTaskData = {
                    cabanaId,
                    tipoAseo,
                    fecha: admin.firestore.Timestamp.fromDate(fechaDate),
                    horarioInicio: horarioInicio || '',
                    horarioFin: horarioFin || '',
                    trabajadorId: trabajadorId || null,
                    origen: 'manual',
                    weight: newTaskWeight,
                    created_at: admin.firestore.FieldValue.serverTimestamp()
                };

                console.log('[SaveTask] Creating task:', newTaskData);
                batch.set(newTaskRef, newTaskData);

                await batch.commit();

                console.log('[SaveTask] Task saved successfully');

                // Regenerate plan for this day ONLY
                // Regenerate plan for this day ONLY
                const freshPlanResult = await generarPropuestaRango(db, fecha, fecha);
                const updatedDay = freshPlanResult && freshPlanResult.dias && freshPlanResult.dias.length > 0 ? freshPlanResult.dias[0] : null;

                return res.json({
                    message: accion === 'add' ? "Tarea agregada" : "Tarea actualizada",
                    fecha,
                    cabanaId,
                    tipoAseo,
                    warning: totalEffort > workerConfig.capacidadDiaria
                        ? `Sobrepasa capacidad: ${totalEffort.toFixed(1)} / ${workerConfig.capacidadDiaria}`
                        : null,
                    esfuerzoTotal: totalEffort.toFixed(1),
                    updatedDay // Return regenerated day
                });
            }

            return res.status(400).json({ error: "Acción inválida" });

        } catch (error) {
            console.error('Error editando tarea:', error);
            res.status(500).json({ error: error.message });
        }
    });

    return router;
};
