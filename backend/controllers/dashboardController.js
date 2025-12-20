// backend/controllers/dashboardController.js
const { getSettings } = require('../services/settingsService');
// const incidentService = require('../services/incidentService'); 
// TODO: Importar servicios reales de incidencias cuando existan

/**
 * Obtiene estadísticas agregadas para el dashboard.
 * Evita enviar datos crudos al cliente.
 */
async function getDashboardStats(req, res, db) {
    try {
        // En Fase 1, devolvemos estructura vacía/mock hasta tener incidencias reales
        // En Fase 2+, aquí se harán las queries 'count' o snapshots calculados

        const admin = require('firebase-admin');

        // 1. Incidencias Pendientes
        const incidentsPendingSnapshot = await db.collection('incidencias')
            .where('estado', '==', 'PENDIENTE')
            .get();
        const pendingCount = incidentsPendingSnapshot.size;

        // 2. Actividades de Hoy Pendientes
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const startOfDay = admin.firestore.Timestamp.fromDate(today);
        const endOfDay = admin.firestore.Timestamp.fromDate(new Date(today.getTime() + 86400000));

        const tasksSnapshot = await db.collection('planAseo')
            .where('fecha', '>=', startOfDay)
            .where('fecha', '<', endOfDay)
            .get();

        const tasksTotal = tasksSnapshot.size;
        const tasksPending = tasksSnapshot.docs.filter(d => d.data().estado !== 'FINALIZADO').length;

        const stats = {
            incidencias: {
                pendientes: pendingCount,
                urgentes: 0
            },
            actividades: {
                hoyTotal: tasksTotal,
                hoyPendientes: tasksPending
            },
            ocupacion: {
                porcentaje: 0
            }
        };

        // Ejemplo futuro:
        // const pendingCount = await db.collection('incidencias').where('estado', '==', 'PENDIENTE').count().get();
        // stats.incidencias.pendientes = pendingCount.data().count;

        res.json(stats);
    } catch (error) {
        console.error('Error obteniendo stats:', error);
        res.status(500).json({ error: 'Error calculando estadísticas del dashboard' });
    }
}

module.exports = {
    getDashboardStats
};
