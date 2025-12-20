// backend/services/incidentsService.js
const admin = require('firebase-admin');
const { ESPACIOS_DISPONIBLES } = require('../config/constantes');

/**
 * Crea una nueva incidencia.
 * @param {Object} db Firestore DB instance
 * @param {Object} data Datos de la incidencia
 */
async function createIncident(db, data) {
    const { cabanaId, espacio, descripcion, prioridad, reportadoPor, tareaId, reservaId } = data;

    // Validación de Espacio
    if (!ESPACIOS_DISPONIBLES.includes(espacio)) {
        throw new Error(`Espacio inválido. Permitidos: ${ESPACIOS_DISPONIBLES.join(', ')}`);
    }

    const newIncident = {
        cabanaId,
        espacio,
        descripcion,
        prioridad: prioridad || 'URGENTE',
        estado: 'PENDIENTE',
        reportadoPor: reportadoPor || { nombre: 'Desconocido', id: null },
        tareaId: tareaId || null,
        reservaId: reservaId || null,
        fechaReporte: admin.firestore.FieldValue.serverTimestamp(),
        // Para agregaciones/debounce simples
        fechaReporteStr: new Date().toISOString()
    };

    const docRef = await db.collection('incidencias').add(newIncident);
    return { id: docRef.id, ...newIncident };
}

/**
 * Obtiene incidencias pendientes.
 */
async function getPendingIncidents(db) {
    const snapshot = await db.collection('incidencias')
        .where('estado', '==', 'PENDIENTE')
        // .orderBy('fechaReporte', 'desc') // Removed to avoid composite index requirement in test env
        .get();

    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Busca incidencias recientes (últimos X minutos) para una cabaña específica.
 * Útil para lógica de debounce/agregación.
 */
async function getRecentIncidentsForCabin(db, cabanaId, minutes = 5) {
    const now = new Date();
    const timeAgo = new Date(now.getTime() - minutes * 60000);
    const timestampAgo = admin.firestore.Timestamp.fromDate(timeAgo);

    const snapshot = await db.collection('incidencias')
        .where('cabanaId', '==', cabanaId)
        .where('fechaReporte', '>=', timestampAgo)
        .get();

    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

module.exports = {
    createIncident,
    getPendingIncidents,
    getRecentIncidentsForCabin
};
