const { Timestamp } = require('firebase-admin/firestore');

/**
 * Controller for managing Task Types configuration
 */
const taskController = (db) => {

    /**
     * GET /api/task-types
     * List all configured task types
     */
    const getTaskTypes = async (req, res) => {
        try {
            const snapshot = await db.collection('taskTypes').get();
            const types = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            res.json(types);
        } catch (error) {
            console.error('Error fetching task types:', error);
            res.status(500).json({ error: 'Error al obtener tipos de tarea' });
        }
    };

    /**
     * POST /api/task-types
     * Create or Update a task type
     * Body: { id (optional), nombre, descripcion, peso, duracion, color, checklist, ... }
     * If ID provided, updates. If not, creates (using nombre as ID if possible or auto-gen).
     * Strategy: Use 'nombre' as ID to ensure uniqueness and simplify lookups!
     */
    const saveTaskType = async (req, res) => {
        try {
            const data = req.body;

            // Validate required fields
            if (!data.nombre) {
                return res.status(400).json({ error: 'El nombre es obligatorio' });
            }

            // Use the name as the ID (normalized) to ensure uniqueness and easy lookup by 'tipoAseo'
            // e.g. "Limpieza Profunda" -> "Limpieza Profunda" (Case sensitive or not? Let's keep original string but maybe trim)
            // Actually, user wants 'tipoAseo' key. Let's use the provided name as the document ID directly.
            const docId = data.nombre.trim();

            const taskTypeData = {
                nombre: data.nombre,
                descripcion: data.descripcion || '',
                peso: Number(data.peso) || 1,
                duracion: Number(data.duracion) || 30,
                color: data.color || '#3B82F6', // Default blue
                checklist: data.checklist || [], // Array of strings
                updatedAt: Timestamp.now()
            };

            await db.collection('taskTypes').doc(docId).set(taskTypeData, { merge: true });

            res.json({ success: true, id: docId, ...taskTypeData });
        } catch (error) {
            console.error('Error saving task type:', error);
            res.status(500).json({ error: 'Error al guardar tipo de tarea' });
        }
    };

    /**
     * DELETE /api/task-types/:id
     * Remove a task type
     */
    const deleteTaskType = async (req, res) => {
        try {
            const { id } = req.params;
            await db.collection('taskTypes').doc(id).delete();
            res.json({ success: true, message: 'Tipo de tarea eliminado' });
        } catch (error) {
            console.error('Error deleting task type:', error);
            res.status(500).json({ error: 'Error al eliminar tipo de tarea' });
        }
    };

    return {
        getTaskTypes,
        saveTaskType,
        deleteTaskType
    };
};

module.exports = taskController;
