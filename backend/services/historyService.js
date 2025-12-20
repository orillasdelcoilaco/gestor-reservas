// backend/services/historyService.js
const admin = require('firebase-admin');

/**
 * Obtiene historial combinado de Tareas y Incidencias.
 * @param {Object} db Firestore DB instance
 * @param {Object} filters filtros { startDate, endDate, cabanaId, espacio }
 */
async function getHistory(db, filters) {
    const { startDate, endDate, cabanaId, espacio } = filters;
    const events = [];

    // --- 1. Tareas Finalizadas (Plan Aseo) ---
    // Si filtran por "Espacio", las tareas generalemente no tienen campo 'espacio' especifico (es por cabaña).
    // Salvo que busquemos por Cabaña.
    // Si el filtro es "Baño", las tareas de aseo completas (Cambio/Salida) incluyen baño, pero no son especificas.
    // Asumiremos que tareas se muestran si coinciden Cabaña/Fecha, o si no hay filtro de espacio estricto.

    // Query Tareas
    let tasksQuery = db.collection('planAseo').where('estado', '==', 'FINALIZADO');

    if (startDate) tasksQuery = tasksQuery.where('fecha', '>=', admin.firestore.Timestamp.fromDate(new Date(startDate)));
    if (endDate) tasksQuery = tasksQuery.where('fecha', '<=', admin.firestore.Timestamp.fromDate(new Date(endDate)));
    if (cabanaId) tasksQuery = tasksQuery.where('cabanaId', '==', cabanaId);

    // Execute Tasks Query
    const tasksSnap = await tasksQuery.get();
    tasksSnap.forEach(doc => {
        const data = doc.data();
        if (espacio) return; // Skip tasks if filtering by specific space (tasks are general)

        events.push({
            id: doc.id,
            type: 'TAREA',
            subType: data.tipoAseo, // Salida, Cambio
            date: data.completedAt || data.fecha, // Prefer completion time
            cabanaId: data.cabanaId,
            details: `Aseo completado por ${data.asignadoA || 'Personal'}`,
            user: data.asignadoA || 'Desconocido',
            metadata: { peso: data.peso }
        });
    });

    // --- 2. Incidencias ---
    // Incidencias SI tienen espacio especifico.
    let incQuery = db.collection('incidencias');

    if (startDate) incQuery = incQuery.where('fechaReporte', '>=', admin.firestore.Timestamp.fromDate(new Date(startDate)));
    if (endDate) incQuery = incQuery.where('fechaReporte', '<=', admin.firestore.Timestamp.fromDate(new Date(endDate)));
    if (cabanaId) incQuery = incQuery.where('cabanaId', '==', cabanaId);
    if (espacio) incQuery = incQuery.where('espacio', '==', espacio);

    const incSnap = await incQuery.get();
    incSnap.forEach(doc => {
        const data = doc.data();
        events.push({
            id: doc.id,
            type: 'INCIDENCIA',
            subType: data.estado, // PENDIENTE, RESUELTA
            date: data.fechaReporte,
            cabanaId: data.cabanaId,
            espacio: data.espacio,
            details: `${data.descripcion} (${data.prioridad})`,
            user: data.reportadoPor?.nombre || 'Staff',
            metadata: { prioridad: data.prioridad }
        });
    });

    // --- 3. Sort & Join ---
    // Descending order (newest first)
    events.sort((a, b) => b.date.toMillis() - a.date.toMillis());

    return events;
}

module.exports = {
    getHistory
};
