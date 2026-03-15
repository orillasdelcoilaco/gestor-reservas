const admin = require('firebase-admin');
const path = require('path');

// Inicializar Firebase Admin si no está inicializado
if (!admin.apps.length) {
    const serviceAccount = process.env.RENDER
        ? require('/etc/secrets/serviceAccountKey.json')
        : require(path.join(__dirname, '..', 'serviceAccountKey.json'));

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: 'reservas-sodc'
    });
}

const db = admin.firestore();

async function verifyUserPermissions() {
    try {
        const userEmail = 'pmezavergara@gmail.com';

        console.log('='.repeat(60));
        console.log('Verificando permisos para:', userEmail);
        console.log('='.repeat(60));

        const userDoc = await db.collection('users').doc(userEmail).get();

        if (!userDoc.exists) {
            console.error('\n❌ PROBLEMA: Usuario NO existe en Firestore\n');
            console.log('Solución: Ejecutar setup-test-user.js para crear el usuario');
            return;
        }

        const userData = userDoc.data();

        console.log('\n📋 DATOS DEL USUARIO:');
        console.log('-'.repeat(60));
        console.log('Email:', userEmail);
        console.log('Permissions:', JSON.stringify(userData.permissions, null, 2));
        console.log('Family Group:', userData.familyGroup);
        console.log('Created At:', userData.createdAt?.toDate?.() || 'N/A');

        // Verificar estructura correcta
        const checks = {
            'Tiene permissions object': !!userData.permissions,
            'Tiene vehicleDocs permission': !!userData.permissions?.vehicleDocs,
            'vehicleDocs es true': userData.permissions?.vehicleDocs === true,
            'Tiene familyGroup': !!userData.familyGroup,
            'familyGroup es string': typeof userData.familyGroup === 'string'
        };

        console.log('\n✓ VALIDACIÓN:');
        console.log('-'.repeat(60));
        Object.entries(checks).forEach(([check, passed]) => {
            console.log((passed ? '✅' : '❌'), check);
        });

        const allChecksPassed = Object.values(checks).every(v => v);

        console.log('\n' + '='.repeat(60));
        if (allChecksPassed) {
            console.log('✅ RESULTADO: Usuario correctamente configurado');
            console.log('='.repeat(60));
            console.log('\n✓ El usuario DEBERÍA poder acceder a Vehicle Docs');
            console.log('\nSi aún hay error 403, el problema es:');
            console.log('  1. req.user no está siendo poblado por el middleware de Firebase Auth');
            console.log('  2. express-session no está configurado y req.session es undefined');
            console.log('\nRevisa los logs del servidor cuando hagas login.');
        } else {
            console.log('❌ RESULTADO: Usuario necesita correcciones');
            console.log('='.repeat(60));
            console.log('\nEstructura esperada:');
            console.log(JSON.stringify({
                email: userEmail,
                permissions: {
                    vehicleDocs: true
                },
                familyGroup: 'meza-vergara',
                createdAt: '<timestamp>'
            }, null, 2));
            console.log('\nEjecuta: node scripts/setup-test-user.js');
        }
        console.log('');

    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        console.error(error);
    }
}

verifyUserPermissions().then(() => process.exit(0));
