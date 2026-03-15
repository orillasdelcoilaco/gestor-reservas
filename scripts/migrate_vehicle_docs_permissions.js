const admin = require('firebase-admin');

// Inicializar Firebase Admin (ajusta la ruta de la credencial si es necesario)
const serviceAccount = require(require('path').join(__dirname, '../backend/serviceAccountKey.json'));

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function migratePermissions() {
    console.log('Iniciando migración de permisos...');

    try {
        // Obtener todos los usuarios
        const snapshot = await db.collection('users').get();

        if (snapshot.empty) {
            console.log('No se encontraron usuarios.');
            return;
        }

        const batch = db.batch();
        let count = 0;

        snapshot.docs.forEach(doc => {
            const userRef = db.collection('users').doc(doc.id);
            const userData = doc.data();

            // Verificar si ya tiene permisos, si no, crear objeto
            const currentPermissions = userData.permissions || {};

            // SOLO para propósitos de prueba de este prototipo, damos acceso a todos
            // En producción, filtrarías por email o rol
            const updatedPermissions = {
                ...currentPermissions,
                reservas: true, // Mantener o dar acceso por defecto
                vehicleDocs: true // NUEVO PERMISO
            };

            batch.update(userRef, { permissions: updatedPermissions });
            count++;
        });

        await batch.commit();
        console.log(`Migración completada exitosamente. ${count} usuarios actualizados.`);

    } catch (error) {
        console.error('Error durante la migración:', error);
    } finally {
        process.exit();
    }
}

migratePermissions();
