const admin = require('firebase-admin');

// === CONFIGURACIÓN POR DEFECTO ===
const DEFAULT_TASK_CONFIG = {
    "Cambio": {
        peso: 1.0,
        duracion: 60,
        descripcion: "Limpieza completa entre salida y llegada mismo día",
        tipo: "obligatoria",
        color: "#ef4444"
    },
    "Salida": {
        peso: 1.0,
        duracion: 60,
        descripcion: "Limpieza después de check-out (diferida)",
        tipo: "flexible",
        color: "#f59e0b"
    },
    "Repaso": {
        peso: 0.2,
        duracion: 15,
        descripcion: "Revisión rápida antes de llegada",
        tipo: "obligatoria",
        color: "#10b981"
    },
    "Mantención": {
        peso: 1.0,
        duracion: 60,
        descripcion: "Limpieza durante estadía (cada 3 días)",
        tipo: "obligatoria",
        color: "#3b82f6"
    },
    "Limpieza Profunda": {
        peso: 1.0,
        duracion: 60,
        descripcion: "Limpieza de cabaña sucia sin llegada inmediata",
        tipo: "flexible",
        color: "#8b5cf6"
    },
    "Inventario": {
        peso: 0.3,
        duracion: 20,
        descripcion: "Revisión de inventario para completar jornada",
        tipo: "flexible",
        color: "#6b7280"
    }
};

// === GET CONFIGURACIÓN DE TAREAS ===
async function getTaskConfig(db) {
    try {
        const doc = await db.collection('configuracion').doc('tareas').get();

        if (!doc.exists) {
            // Inicializar con valores por defecto
            await db.collection('configuracion').doc('tareas').set(DEFAULT_TASK_CONFIG);
            return DEFAULT_TASK_CONFIG;
        }

        return doc.data();
    } catch (error) {
        console.error('Error getting task config:', error);
        throw error;
    }
}

// === UPDATE CONFIGURACIÓN DE TAREAS ===
async function updateTaskConfig(db, taskType, config) {
    try {
        const updateData = {};
        updateData[taskType] = config;

        await db.collection('configuracion').doc('tareas').set(updateData, { merge: true });

        return { message: "Configuración actualizada", taskType, config };
    } catch (error) {
        console.error('Error updating task config:', error);
        throw error;
    }
}

// === GET CONFIGURACIÓN DE TRABAJADOR ===
async function getWorkerConfig(db, workerId) {
    try {
        const doc = await db.collection('trabajadores').doc(workerId).get();

        if (!doc.exists) {
            throw new Error('Trabajador no encontrado');
        }

        const data = doc.data();

        return {
            diasLibres: data.diasLibres || [1], // Lunes por defecto
            capacidadDiaria: data.capacidadDiaria || 3.0,
            horarioInicio: data.horarioInicio || "12:00",
            horarioDuracion: data.horarioDuracion || 240
        };
    } catch (error) {
        console.error('Error getting worker config:', error);
        throw error;
    }
}

// === UPDATE CONFIGURACIÓN DE TRABAJADOR ===
async function updateWorkerConfig(db, workerId, config) {
    try {
        const updateData = {};

        if (config.diasLibres !== undefined) updateData.diasLibres = config.diasLibres;
        if (config.capacidadDiaria !== undefined) updateData.capacidadDiaria = config.capacidadDiaria;
        if (config.horarioInicio !== undefined) updateData.horarioInicio = config.horarioInicio;
        if (config.horarioDuracion !== undefined) updateData.horarioDuracion = config.horarioDuracion;

        await db.collection('trabajadores').doc(workerId).update(updateData);

        return { message: "Configuración de trabajador actualizada", workerId, config: updateData };
    } catch (error) {
        console.error('Error updating worker config:', error);
        throw error;
    }
}

module.exports = {
    getTaskConfig,
    updateTaskConfig,
    getWorkerConfig,
    updateWorkerConfig,
    DEFAULT_TASK_CONFIG
};
