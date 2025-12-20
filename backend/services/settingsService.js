// backend/services/settingsService.js
const admin = require('firebase-admin');

/**
 * Obtiene la configuración de la empresa.
 * @param {Object} db - Instancia de Firestore.
 * @returns {Promise<Object>} Datos de configuración.
 */
async function getSettings(db) {
    try {
        const doc = await db.collection('settings').doc('empresa').get();
        if (!doc.exists) {
            // Default settings fallback
            return {
                nombreEmpresa: 'Cabañas Zacatines',
                adminNombre: '',
                adminEmail: '',
                telefonoContacto: '',
                telegramChatId: ''
            };
        }
        return doc.data();
    } catch (error) {
        throw new Error(`Error al obtener configuración: ${error.message}`);
    }
}

/**
 * Actualiza la configuración de la empresa.
 * @param {Object} db - Instancia de Firestore.
 * @param {Object} data - Datos a actualizar.
 * @returns {Promise<Object>} Resultado de la operación.
 */
async function updateSettings(db, data) {
    try {
        await db.collection('settings').doc('empresa').set({
            ...data,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        return { message: 'Configuración actualizada correctamente' };
    } catch (error) {
        throw new Error(`Error al actualizar configuración: ${error.message}`);
    }
}

module.exports = {
    getSettings,
    updateSettings
};
