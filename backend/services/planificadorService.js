const admin = require('firebase-admin');
const { createGoogleContact, updateContact, findContactByName } = require('./googleContactsService');
const fs = require('fs');
const path = require('path');

// === LOGGING SYSTEM ===
const LOG_FILE = path.join(__dirname, '..', 'planner_debug.log');

function log(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;

    // Write to console (MUST use console directly to avoid recursion)
    process.stdout.write(message + '\n');

    // Append to file
    try {
        fs.appendFileSync(LOG_FILE, logMessage, 'utf8');
    } catch (err) {
        process.stderr.write('Error writing to log file: ' + err + '\n');
    }
}

function clearLog() {
    try {
        fs.writeFileSync(LOG_FILE, '', 'utf8');
        process.stdout.write(`Log file cleared: ${LOG_FILE}\n`);
    } catch (err) {
        process.stderr.write('Error clearing log file: ' + err + '\n');
    }
}

// --- HELPERS ---
function getStartOfDayUTC(date) {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    return d;
}

function getEndOfDayUTC(date) {
    const d = new Date(date);
    d.setUTCHours(23, 59, 59, 999);
    return d;
}

function addMinutes(timeStr, minutes) {
    const [hours, mins] = timeStr.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, mins, 0, 0);
    date.setMinutes(date.getMinutes() + minutes);
    return date.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false }).slice(0, 5);
}

// --- TRABAJADORES ---
async function getTrabajadores(db) {
    try {
        const snapshot = await db.collection('trabajadores').where('activo', '==', true).get();
        if (snapshot.empty) return [];
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        throw new Error("Error al obtener trabajadores");
    }
}

async function saveTrabajador(db, trabajadorData) {
    try {
        console.log('[DEBUG] saveTrabajador payload:', JSON.stringify(trabajadorData));
        const { id, nombre, apellido, telefono, email, esPrincipal, telegramChatId } = trabajadorData;
        const nombreCompleto = `${nombre} ${apellido}`.trim();
        let googleContactId = trabajadorData.googleContactId;

        if (!googleContactId) {
            try {
                const existingContact = await findContactByName(db, nombreCompleto);
                if (existingContact) {
                    googleContactId = existingContact.resourceName;
                } else {
                    const created = await createGoogleContact(db, { name: nombreCompleto, phone: telefono, email });
                    if (created) {
                        const newContact = await findContactByName(db, nombreCompleto);
                        if (newContact) googleContactId = newContact.resourceName;
                    }
                }
            } catch (err) {
                console.warn("Advertencia: No se pudo sincronizar con Google Contacts.", err.message);
            }
        }

        const dataToSave = {
            nombre,
            apellido,
            telefono,
            email: email || null,
            telegramChatId: telegramChatId || null,
            googleContactId: googleContactId || null,
            esPrincipal: !!esPrincipal,
            activo: true
        };

        if (id) {
            await db.collection('trabajadores').doc(id).update(dataToSave);
            return { id, ...dataToSave };
        } else {
            const ref = await db.collection('trabajadores').add(dataToSave);
            return { id: ref.id, ...dataToSave };
        }
    } catch (error) {
        throw error;
    }
}

async function deleteTrabajador(db, id) {
    try {
        await db.collection('trabajadores').doc(id).update({ activo: false });
        return { message: "Trabajador desactivado" };
    } catch (error) {
        throw error;
    }
}

// --- CRUD ESTADOS ---
async function getInitialCabinStates(db) {
    try {
        const snapshot = await db.collection('cabanas').get();
        const states = {};
        snapshot.forEach(doc => {
            const data = doc.data();
            states[data.nombre] = data.estadoLimpieza || 'LISTA';
        });
        return states;
    } catch (error) {
        return {};
    }
}

async function updateCabinState(db, cabanaNombre, newState) {
    try {
        const snapshot = await db.collection('cabanas').where('nombre', '==', cabanaNombre).get();
        if (snapshot.empty) throw new Error("Cabaña no encontrada");

        const batch = db.batch();
        snapshot.forEach(doc => {
            batch.update(doc.ref, { estadoLimpieza: newState });
        });
        await batch.commit();
        return { message: "Estado actualizado" };
    } catch (err) {
        throw err;
    }
}

async function resetCabinStates(db) {
    try {
        const snapshot = await db.collection('cabanas').get();
        const batch = db.batch();
        snapshot.forEach(doc => {
            batch.update(doc.ref, { estadoLimpieza: 'LISTA' });
        });
        await batch.commit();
        return { message: "Todos los estados reseteados a LISTA" };
    } catch (err) {
        throw err;
    }
}

// === ALGORITMO SECUENCIAL SIMPLE ===
async function generarPropuestaRango(db, fechaInicioStr, fechaFinStr) {
    try {
        clearLog();

        // HELPER: Fetch last task before start date for a cabin
        const fetchLastTask = async (cabanaId, dateLimit) => {
            const snap = await db.collection('planAseo')
                .where('cabanaId', '==', cabanaId)
                .where('fecha', '<', admin.firestore.Timestamp.fromDate(dateLimit))
                .orderBy('fecha', 'desc')
                .limit(1)
                .get();
            if (snap.empty) return null;
            const d = snap.docs[0].data();
            return { tipo: d.tipoAseo, fecha: d.fecha.toDate().toISOString().split('T')[0] };
        };

        log('\n=== GENERACIÓN DE PLAN (Algoritmo Secuencial Simple) ===');
        log(`Rango: ${fechaInicioStr} a ${fechaFinStr}`);

        const inicio = new Date(fechaInicioStr + 'T00:00:00Z');
        const fin = new Date(fechaFinStr + 'T00:00:00Z');

        const PESO_PESADO = 1.0;
        const PESO_LEVE = 0.2;
        const PESO_INVENTARIO = 0.3;
        const CAPACIDAD_OBJETIVO = 3.0;

        function getWeight(type, savedWeight) {
            // FORCE standardized weights for known types to correct legacy data (e.g. Inventario = 1.0)
            // Only use savedWeight if it's likely a custom value (not matching any standard)
            // But for stability, let's strictly prefer the constants for these types.
            switch (type) {
                case 'Mantención': return PESO_PESADO;
                case 'Cambio': return PESO_PESADO;
                case 'Limpieza Profunda': return PESO_PESADO;
                case 'Salida': return PESO_PESADO;
                case 'Repaso': return PESO_LEVE;
                case 'Inventario': return PESO_INVENTARIO;
                case 'Limpieza': return 0.5;
                default:
                    return savedWeight !== undefined && savedWeight !== null ? Number(savedWeight) : 1.0;
            }
        }

        // Get worker
        let trabajadorPrincipalId = null;
        const workersSnapshot = await db.collection('trabajadores').where('esPrincipal', '==', true).limit(1).get();
        if (!workersSnapshot.empty) trabajadorPrincipalId = workersSnapshot.docs[0].id;

        // Get cabins
        const cabanasSnapshot = await db.collection('cabanas').get();
        const todasLasCabanas = cabanasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Get all reservations
        const reservasSnapshot = await db.collection('reservas')
            //.where('estado', '==', 'Confirmada') // Removed logic to allow robust filtering
            .get();

        // Filter manually to be robust against "Confirmada " and case sensitivity
        // Also include "Pendiente Aprobación" if that's what user considers valid, but user said "solo confirmadas".
        // However, user complained about losing reservation visibility. Maybe they accidentally set it to something else?
        // Let's stick to strict Confirmada but case insensitive.
        const reservasConfirmadas = reservasSnapshot.docs.filter(doc => {
            const st = doc.data().estado;
            return st && st.trim().toLowerCase() === 'confirmada';
        });

        const reservasPorCabana = {};
        reservasConfirmadas.forEach(doc => {
            const r = doc.data();
            const cab = r.alojamiento;
            if (!reservasPorCabana[cab]) reservasPorCabana[cab] = [];
            // Store FULL info
            reservasPorCabana[cab].push({
                id: r.reservaId || doc.id, // Ensure we have an ID
                llegada: r.fechaLlegada.toDate(),
                salida: r.fechaSalida.toDate(),
                cliente: r.cliente || 'Cliente'
            });
        });

        // === CONTEXT STATE INITIALIZATION ===
        const contextMap = {}; // { cabanaId: { lastTask: {tipo, fecha}, stats: { mantenciones: 0, repasos: 0 } } }

        // 1. Initialize History (Async wait for all cabins)
        await Promise.all(todasLasCabanas.map(async (cab) => {
            const last = await fetchLastTask(cab.nombre, inicio);
            contextMap[cab.nombre] = {
                lastTask: last,
                stats: {} // Dynamic stats object (e.g. { Mantención: 1, Repaso: 2 })
            };
        }));

        let estadosTemporales = await getInitialCabinStates(db);
        const diasResult = [];

        // BUCLE DIARIO SECUENCIAL
        for (let d = new Date(inicio); d <= fin; d.setUTCDate(d.getUTCDate() + 1)) {
            const fechaStr = d.toISOString().split('T')[0];
            const dayOfWeek = d.getUTCDay();
            const isMonday = dayOfWeek === 1;

            log(`\n>>> Día ${fechaStr} (${isMonday ? 'LUNES' : 'día normal'})`);

            // --- SMART REGENERATION LOGIC START ---
            // 1. Cargar Plan Guardado (si existe) -> Separar Tareas MANUALES
            const savedPlan = await getPlan(db, fechaStr);
            const manualTasks = savedPlan ? savedPlan.filter(t => t.origen === 'manual') : [];

            const dailyTasksMap = new Map();
            let conflictMonday = false;
            let currentEffort = 0;

            // 2. Pre-cargar tareas MANUALES
            if (manualTasks.length > 0) {
                log(`  Regeneración Inteligente: Preservando ${manualTasks.length} tareas manuales.`);
                manualTasks.forEach(t => {
                    dailyTasksMap.set(t.cabanaId, t);
                    // Actualizar estado 'LISTA' para tareas que implican limpieza completa
                    if (['Salida', 'Cambio', 'Limpieza Profunda'].includes(t.tipoAseo)) {
                        estadosTemporales[t.cabanaId] = 'LISTA';
                    }
                    // Sumar al esfuerzo inicial
                    const w = getWeight(t.tipoAseo, t.weight);
                    t.weight = w;
                    currentEffort += w;
                });
            } else if (savedPlan && savedPlan.length > 0) {
                // Modo Persistencia: Cargar TODO el plan guardado (Manual + Auto)
                // Esto permite que 'Generar' funcione como 'Ver' si ya existe data.
                // Si el usuario borró una tarea Auto, aquí no se cargará, y el Paso 4 rellenará el hueco.
                log(`  Cargando plan existente (${savedPlan.length} tareas) desde BD...`);
                savedPlan.forEach(t => {
                    dailyTasksMap.set(t.cabanaId, t);
                    // Actualizar estados si corresponde
                    if (['Salida', 'Cambio', 'Limpieza Profunda'].includes(t.tipoAseo)) {
                        estadosTemporales[t.cabanaId] = 'LISTA';
                    }
                    const w = getWeight(t.tipoAseo, t.weight);
                    t.weight = w; // Ensure weight is set on the task object for future calculations
                    currentEffort += w;
                });
            }

            // 3. Aplicar eventos naturales (Llegada/Salida) para actualizar estadosTemporales
            todasLasCabanas.forEach(cab => {
                const reservas = reservasPorCabana[cab.nombre] || [];
                const isArriving = reservas.some(r => r.llegada.toISOString().split('T')[0] === fechaStr);
                const isLeaving = reservas.some(r => r.salida.toISOString().split('T')[0] === fechaStr);

                if (isArriving) estadosTemporales[cab.nombre] = 'OCUPADA';
                if (isLeaving && !dailyTasksMap.has(cab.nombre)) estadosTemporales[cab.nombre] = 'SUCIA';
            });

            // 4. GENERACIÓN AUTOMÁTICA (Rellenar huecos)
            log(`  Generación automática (rellenando huecos)...`);

            // PASO 1: Cambios (Salida + Llegada mismo día) - INAMOVIBLE
            todasLasCabanas.forEach(cab => {
                // Si la cabaña YA tiene tarea manual, saltar generación para ella
                if (dailyTasksMap.has(cab.nombre)) return;

                const reservas = reservasPorCabana[cab.nombre] || [];
                const isArriving = reservas.some(r => r.llegada.toISOString().split('T')[0] === fechaStr);
                const isLeaving = reservas.some(r => r.salida.toISOString().split('T')[0] === fechaStr);

                if (isLeaving && isArriving) {
                    dailyTasksMap.set(cab.nombre, {
                        cabanaId: cab.nombre,
                        tipoAseo: 'Cambio',
                        priority: 1,
                        weight: PESO_PESADO,
                        horarioInicio: '',
                        horarioFin: '',
                        origen: 'auto',
                        trabajadorId: trabajadorPrincipalId
                    });
                    estadosTemporales[cab.nombre] = 'OCUPADA';
                    currentEffort += PESO_PESADO;
                    log(`    ${cab.nombre}: Cambio (Salida+Llegada)`);

                    if (isMonday) conflictMonday = true;
                } else if (isLeaving) {
                    estadosTemporales[cab.nombre] = 'SUCIA';
                    log(`    ${cab.nombre}: Salida → SUCIA`);
                } else if (isArriving) {
                    if (estadosTemporales[cab.nombre] === 'LISTA') {
                        dailyTasksMap.set(cab.nombre, {
                            cabanaId: cab.nombre,
                            tipoAseo: 'Repaso', // Repaso LIGERO
                            priority: 2,
                            weight: PESO_LEVE,
                            horarioInicio: '',
                            horarioFin: '',
                            origen: 'auto',
                            trabajadorId: trabajadorPrincipalId
                        });
                        estadosTemporales[cab.nombre] = 'OCUPADA';
                        currentEffort += PESO_LEVE;
                        log(`    ${cab.nombre}: Repaso`);
                    } else {
                        // EMERGENCIA
                        dailyTasksMap.set(cab.nombre, {
                            cabanaId: cab.nombre,
                            tipoAseo: 'Cambio', // Cambio de Emergencia
                            priority: 1,
                            weight: PESO_PESADO,
                            horarioInicio: '',
                            horarioFin: '',
                            origen: 'auto',
                            trabajadorId: trabajadorPrincipalId
                        });
                        estadosTemporales[cab.nombre] = 'OCUPADA';
                        currentEffort += PESO_PESADO;
                        log(`    ${cab.nombre}: Cambio EMERGENCIA (llegada a sucia)`);
                        if (isMonday) conflictMonday = true;
                    }
                }
            });

            // Si es Lunes y tenemos Cambios, parar aqui (o seguir si hay capacidad?) 
            // Original logic stopped here if Monday only allows changes. 
            // Let's iterate:
            if (!isMonday) {
                // PASO 2: Mantenciones
                // PASO 2: Mantenciones Generales (Relleno Prioritario para Ocupadas)
                // User Request: Si está ocupada y hay espacio, poner Mantención.
                // Prioridad sobre Inventario.
                const ocupadasSinTarea = todasLasCabanas.filter(cab => {
                    if (dailyTasksMap.has(cab.nombre)) return false;
                    const reservas = reservasPorCabana[cab.nombre] || [];
                    const currentStay = reservas.find(r => {
                        const start = getStartOfDayUTC(r.llegada).getTime();
                        const end = getStartOfDayUTC(r.salida).getTime();
                        const today = d.getTime();
                        // Active stay (middle days)
                        return today > start && today < end;
                    });
                    return !!currentStay;
                });

                for (const cab of ocupadasSinTarea) {
                    if (currentEffort + PESO_PESADO > CAPACIDAD_OBJETIVO) {
                        log(`    ${cab.nombre}: Ocupada, pero sin cupo para Mantención (${currentEffort} + ${PESO_PESADO} > ${CAPACIDAD_OBJETIVO})`);
                        continue;
                    }

                    dailyTasksMap.set(cab.nombre, {
                        cabanaId: cab.nombre,
                        tipoAseo: 'Mantención',
                        priority: 3,
                        weight: PESO_PESADO,
                        horarioInicio: '',
                        horarioFin: '',
                        origen: 'auto',
                        trabajadorId: trabajadorPrincipalId
                    });
                    currentEffort += PESO_PESADO;
                    log(`    ${cab.nombre}: Mantención (Relleno Ocupada) - peso ${PESO_PESADO}`);
                }

                // PASO 3: Limpiezas Profundas
                if (currentEffort < CAPACIDAD_OBJETIVO) {
                    const sucias = todasLasCabanas.filter(c =>
                        estadosTemporales[c.nombre] === 'SUCIA' &&
                        !dailyTasksMap.has(c.nombre)
                    );

                    for (const cab of sucias) {
                        if (currentEffort >= CAPACIDAD_OBJETIVO) break;

                        dailyTasksMap.set(cab.nombre, {
                            cabanaId: cab.nombre,
                            tipoAseo: 'Limpieza Profunda',
                            priority: 4,
                            weight: PESO_PESADO,
                            horarioInicio: '',
                            horarioFin: '',
                            origen: 'auto',
                            trabajadorId: trabajadorPrincipalId
                        });
                        estadosTemporales[cab.nombre] = 'LISTA';
                        currentEffort += PESO_PESADO;
                        log(`    ${cab.nombre}: Limpieza Profunda - Esfuerzo: ${currentEffort.toFixed(1)}`);
                    }
                }

                // PASO 4: Inventarios (Relleno)
                if (currentEffort < CAPACIDAD_OBJETIVO) {
                    log(`  Esfuerzo: ${currentEffort.toFixed(1)}, rellenando con Inventarios hasta 3.0...`);
                    const disponibles = todasLasCabanas.filter(c => !dailyTasksMap.has(c.nombre));

                    for (const cab of disponibles) {
                        // User Constraint: NO SOBREPASAR 3.0 (Evitar Refuerzos Innecesarios)
                        const PESO_INVENTARIO = 0.3;
                        if (currentEffort + PESO_INVENTARIO > CAPACIDAD_OBJETIVO) {
                            log(`  Límite alcanzado (${currentEffort.toFixed(1)} + ${PESO_INVENTARIO} > 3.0). Deteniendo relleno.`);
                            break;
                        }

                        dailyTasksMap.set(cab.nombre, {
                            cabanaId: cab.nombre,
                            tipoAseo: 'Inventario',
                            priority: 5,
                            weight: PESO_INVENTARIO,
                            horarioInicio: '',
                            horarioFin: '',
                            origen: 'auto',
                            trabajadorId: trabajadorPrincipalId
                        });

                        currentEffort += PESO_INVENTARIO;
                        log(`    ${cab.nombre}: Inventario - Esfuerzo: ${currentEffort.toFixed(1)}`);
                    }
                }
            }

            // Convert to array
            const dailyTasks = Array.from(dailyTasksMap.values());
            dailyTasks.sort((a, b) => a.priority - b.priority);

            // --- CALCULATE TOTALS FOR ALERTS ---
            // Fix: Variables were undefined
            const totalTareasDia = dailyTasks.length;
            const totalCambiosDia = dailyTasks.filter(t => t.tipoAseo === 'Cambio').length;
            const totalSalidasDia = dailyTasks.filter(t => t.tipoAseo === 'Salida').length;
            const effortSum = dailyTasks.reduce((sum, t) => sum + (t.weight || 0), 0);
            const requiereRefuerzo = effortSum > CAPACIDAD_OBJETIVO;

            // Schedule (NOW BEFORE PERSISTENCE)
            const hasHeavy = dailyTasks.some(t => t.weight >= PESO_PESADO);
            const startHour = hasHeavy ? 12 : 13;
            const minutesPerTask = totalTareasDia > 0 ? Math.floor(240 / totalTareasDia) : 60;
            let currentTime = `${startHour}:00`;
            dailyTasks.forEach(t => {
                t.horarioInicio = currentTime;
                t.horarioFin = addMinutes(currentTime, minutesPerTask);
                currentTime = t.horarioFin;

                // ATTACH CONTEXT TO TASK FOR UI
                const ctx = contextMap[t.cabanaId];
                if (ctx) {
                    // Find active reservation
                    const reservas = reservasPorCabana[t.cabanaId] || [];
                    const activeRes = reservas.find(r => {
                        const dDate = new Date(fechaStr);
                        // Active if d between llegada and salida (inclusive-ish)
                        // Simple check: start <= d < end
                        return dDate >= r.llegada && dDate <= r.salida;
                    });

                    t.context = {
                        reserva: activeRes ? {
                            id: activeRes.id,
                            desde: activeRes.llegada.toISOString().split('T')[0],
                            hasta: activeRes.salida.toISOString().split('T')[0],
                            cliente: activeRes.cliente // Ensure client name is visible
                        } : null,
                        ultimaTarea: ctx.lastTask, // The task BEFORE this one
                        stats: { ...ctx.stats } // Snapshot of stats at start of day
                    };
                }
            });

            // --- PERSISTENCE LAYER (MOVED AFTER SCHEDULE) ---
            log(`  Persisting generated plan to DB (${dailyTasks.length} tasks)...`);

            const batchSave = db.batch();
            const startDaySave = admin.firestore.Timestamp.fromDate(getStartOfDayUTC(new Date(fechaStr + 'T00:00:00Z')));
            const endDaySave = admin.firestore.Timestamp.fromDate(getEndOfDayUTC(new Date(fechaStr + 'T00:00:00Z')));
            const fechaTimestamp = admin.firestore.Timestamp.fromDate(new Date(fechaStr + 'T12:00:00Z'));

            const snapshotToDelete = await db.collection('planAseo')
                .where('fecha', '>=', startDaySave)
                .where('fecha', '<=', endDaySave)
                .get();

            snapshotToDelete.forEach(doc => batchSave.delete(doc.ref));

            dailyTasks.forEach(t => {
                const ref = db.collection('planAseo').doc();
                // Save task WITH calculated schedule
                // Exclude full context if it's too heavy? No, user might want it.
                // But Firestore limit is 1MB. Context is small.
                // However, context relies on dynamic reservation data. If we save it, it might become stale.
                // UI usually recalculates context on load?
                // `dailyTasks` right now has `t.context`.
                // If we save it, we save space.
                // Let's remove context for persistence to keep DB clean and rely on live generation for context.
                // BUT `activePlan` returned needs context.
                // So let's clone for save.
                const taskToSave = { ...t };
                delete taskToSave.context;

                batchSave.set(ref, {
                    ...taskToSave,
                    fecha: fechaTimestamp,
                    created_at: admin.firestore.FieldValue.serverTimestamp()
                });
            });
            await batchSave.commit();
            log(`  Plan persisted successfully.`);

            diasResult.push({
                fecha: fechaStr,
                propuesta: dailyTasks,
                savedPlan: savedPlan || [],
                activePlan: dailyTasks,
                alertas: {
                    requiereRefuerzo,
                    esLunes: isMonday,
                    conflictoLunes: conflictMonday,
                    totalCambios: totalCambiosDia,
                    totalSalidas: totalSalidasDia,
                    totalTareas: totalTareasDia,
                    esfuerzoTotal: effortSum.toFixed(1)
                }
            });

        } // Closes FOR loop

        // Calculate final totals
        log('\n=== TOTALES FINALES ===');
        let finalTotalTareas = 0;
        let finalTotalCambios = 0;
        let finalTotalSalidas = 0;
        let finalDiasCriticos = 0;
        diasResult.forEach(dia => {
            finalTotalTareas += dia.alertas.totalTareas;
            finalTotalCambios += dia.alertas.totalCambios;
            finalTotalSalidas += dia.alertas.totalSalidas;
            if (dia.alertas.requiereRefuerzo) finalDiasCriticos++;
        });

        log(`Total Tareas: ${finalTotalTareas}`);
        log(`Total Cambios: ${finalTotalCambios}`);
        log(`Total Salidas: ${finalTotalSalidas}`);
        log(`Días Críticos: ${finalDiasCriticos}`);
        log('\n=== FIN GENERACIÓN ===\n');

        return {
            dias: diasResult,
            totales: {
                totalTareas: finalTotalTareas,
                totalCambios: finalTotalCambios,
                totalSalidas: finalTotalSalidas,
                diasCriticos: finalDiasCriticos
            }
        };

    } catch (error) {
        log('ERROR: ' + error.message);
        throw error;
    }
}

async function savePlan(db, planData) {
    try {
        const { fecha, tareas } = planData;
        const batch = db.batch();

        const startDay = admin.firestore.Timestamp.fromDate(getStartOfDayUTC(new Date(fecha + 'T00:00:00Z')));
        const endDay = admin.firestore.Timestamp.fromDate(getEndOfDayUTC(new Date(fecha + 'T00:00:00Z')));

        const existingSnapshot = await db.collection('planAseo')
            .where('fecha', '>=', startDay)
            .where('fecha', '<=', endDay)
            .get();

        existingSnapshot.forEach(doc => batch.delete(doc.ref));

        const fechaTimestamp = admin.firestore.Timestamp.fromDate(new Date(fecha + 'T00:00:00Z'));
        const cabanaUpdates = {};

        tareas.forEach(tarea => {
            const ref = db.collection('planAseo').doc();
            batch.set(ref, {
                ...tarea,
                fecha: fechaTimestamp,
                created_at: admin.firestore.FieldValue.serverTimestamp()
            });

            if (['Salida', 'Cambio', 'Aseo Tardío', 'Limpieza Profunda'].includes(tarea.tipoAseo)) {
                cabanaUpdates[tarea.cabanaId] = 'LISTA';
            }
        });

        await batch.commit();

        if (Object.keys(cabanaUpdates).length > 0) {
            const snap = await db.collection('cabanas').get();
            const batch2 = db.batch();
            snap.forEach(doc => {
                const name = doc.data().nombre;
                if (cabanaUpdates[name]) {
                    batch2.update(doc.ref, { estadoLimpieza: 'LISTA' });
                }
            });
            await batch2.commit();
        }

        return { message: "Plan guardado exitosamente" };

    } catch (error) {
        throw error;
    }
}

async function getPlan(db, fechaStr) {
    try {
        const startDay = admin.firestore.Timestamp.fromDate(getStartOfDayUTC(new Date(fechaStr + 'T00:00:00Z')));
        const endDay = admin.firestore.Timestamp.fromDate(getEndOfDayUTC(new Date(fechaStr + 'T00:00:00Z')));

        const snapshot = await db.collection('planAseo')
            .where('fecha', '>=', startDay)
            .where('fecha', '<=', endDay)
            .get();

        if (snapshot.empty) return null;

        return snapshot.docs.map(doc => doc.data());
    } catch (error) {
        throw error;
    }
}

const { sendDirectMessage } = require('./notificationService');

async function sendWorkerDailySummary(db, workerId) {
    try {
        // 1. Get Worker
        const workerSnap = await db.collection('trabajadores').doc(workerId).get();
        if (!workerSnap.exists) throw new Error('Trabajador no encontrado');
        const worker = { id: workerSnap.id, ...workerSnap.data() };

        if (!worker.telegramChatId) throw new Error('Trabajador no tiene Telegram ID configurado');

        // 2. Get Plan for Today
        const todayStr = new Date().toISOString().split('T')[0];
        const propuesta = await generarPropuestaRango(db, todayStr, todayStr);

        if (!propuesta.dias || propuesta.dias.length === 0) {
            console.log('[DEBUG] No proposal found for today.');
            await sendDirectMessage(db, worker.telegramChatId, `📅 *Plan ${todayStr}*\nNo hay tareas registradas para hoy.`);
            return;
        }

        const dia = propuesta.dias[0];
        console.log(`[DEBUG] Analyzing Day: ${todayStr}, WorkerTarget: ${workerId}`);
        console.log(`[DEBUG] Tasks found in plan: ${dia.activePlan.length}`);

        // Log all worker IDs in the plan to see mismatch
        const workerIdsInPlan = [...new Set(dia.activePlan.map(t => t.trabajadorId))];
        console.log('[DEBUG] Worker IDs present in plan:', workerIdsInPlan);

        const tareas = dia.activePlan.filter(t => t.trabajadorId === workerId);
        console.log(`[DEBUG] Tasks matching target: ${tareas.length}`);

        if (tareas.length === 0) {
            await sendDirectMessage(db, worker.telegramChatId, `📅 *Plan ${todayStr}*\nHola ${worker.nombre}, hoy tienes día libre o sin asignaciones.`);
            return;
        }

        // DEBUG: Step 1 - Connection Probe
        console.log(`[DEBUG] Step 1: Sending probe to ${worker.telegramChatId}`);
        const probeRes = await sendDirectMessage(db, worker.telegramChatId, "🔍 *Iniciando prueba de conexión...*");
        if (!probeRes.sent) throw new Error(`Step 1 Probe Failed: ${probeRes.error || probeRes.reason}`);

        // 3. Format Message
        // Escape special chars to avoid Markdown errors
        const escapeMd = (text) => (text || '').toString().replace(/([_*[`])/g, '\\$1');

        let msg = `📅 *Plan de Trabajo - ${todayStr}*\nHola ${escapeMd(worker.nombre)}, aquí están tus tareas de hoy:\n\n`;

        tareas.forEach((t, index) => {
            msg += `${index + 1}. *${escapeMd(t.cabanaId)}*: ${escapeMd(t.tipoAseo)} (${t.duracion} min)\n   ⏰ Inicio aprox: ${t.horarioInicio}\n`;
        });

        const totalMin = tareas.reduce((sum, t) => sum + t.duracion, 0);
        const hours = Math.floor(totalMin / 60);
        const mins = totalMin % 60;

        msg += `\n⏱ Total: ${hours}h ${mins}m\n`;
        msg += `[Ver Dashboard](https://gestor-reservas.onrender.com/planificador.html)`;

        // 4. Send Summary
        console.log(`[DEBUG] Step 2: Sending summary content...`);
        const result = await sendDirectMessage(db, worker.telegramChatId, msg);
        if (!result.sent) {
            console.error('[DEBUG] Step 2 Failed:', result.error);
            // Don't throw immediately, try Step 3 to confirm partial success
            await sendDirectMessage(db, worker.telegramChatId, `❌ Error enviando resumen completo. Revisa formato. Log: ${result.error}`);
            throw new Error(`Telegram Step 2 Error: ${result.error || result.reason}`);
        }

        // DEBUG: Step 3 - Final Confirmation
        console.log(`[DEBUG] Step 3: Sending final confirmation...`);
        await sendDirectMessage(db, worker.telegramChatId, "✅ *Resumen entregado correctamente.*");

    } catch (error) {
        console.error('Error sendWorkerDailySummary:', error);
        throw error;
    }
}

module.exports = {
    getTrabajadores,
    saveTrabajador,
    deleteTrabajador,
    generarPropuestaRango,
    savePlan,
    getPlan,
    updateCabinState,
    resetCabinStates,
    sendWorkerDailySummary
};
