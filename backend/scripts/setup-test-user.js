const admin = require('firebase-admin');
const path = require('path');

// Inicializar Firebase Admin SDK
try {
    const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log('✅ Firebase Admin SDK inicializado');
} catch (error) {
    console.error('❌ Error inicializando Firebase:', error.message);
    process.exit(1);
}

async function createOrUpdateUser() {
    const email = 'pmezavergara@gmail.com';
    const password = 'perfil4422';

    try {
        // Intentar obtener el usuario existente
        let user;
        try {
            user = await admin.auth().getUserByEmail(email);
            console.log(`📌 Usuario encontrado: ${user.uid}`);

            // Actualizar la contraseña
            await admin.auth().updateUser(user.uid, {
                password: password,
                emailVerified: true
            });
            console.log('✅ Contraseña actualizada correctamente');

        } catch (error) {
            if (error.code === 'auth/user-not-found') {
                // Crear nuevo usuario
                console.log('📝 Usuario no existe, creando nuevo...');
                user = await admin.auth().createUser({
                    email: email,
                    password: password,
                    emailVerified: true
                });
                console.log(`✅ Usuario creado con UID: ${user.uid}`);
            } else {
                throw error;
            }
        }

        // Verificar que se puede autenticar
        console.log('\n✅ Usuario configurado correctamente:');
        console.log(`   Email: ${email}`);
        console.log(`   Password: ${password}`);
        console.log(`   UID: ${user.uid}`);
        console.log(`   Email verificado: ${user.emailVerified}`);

        // Ahora necesitamos asegurar que el usuario tenga permisos de vehicleDocs
        console.log('\n📋 Verificando permisos en Firestore...');
        const db = admin.firestore();

        // Buscar el documento del usuario en la colección users
        const userDoc = await db.collection('users').doc(user.uid).get();

        if (!userDoc.exists) {
            console.log('⚠️  Documento de usuario no existe en Firestore');
            console.log('   Creando documento con permisos vehicleDocs...');
            await db.collection('users').doc(user.uid).set({
                email: email,
                permissions: {
                    vehicleDocs: true
                },
                familyGroup: 'meza-vergara',
                createdAt: new Date()
            });
            console.log('✅ Documento de usuario creado con permisos y familyGroup');
        } else {
            const userData = userDoc.data();
            if (!userData.permissions?.vehicleDocs) {
                console.log('⚠️  Usuario no tiene permiso vehicleDocs');
                console.log('   Actualizando permisos...');
                await db.collection('users').doc(user.uid).update({
                    'permissions.vehicleDocs': true
                });
                console.log('✅ Permisos actualizados');
            } else {
                console.log('✅ Usuario ya tiene permiso vehicleDocs');
            }

            // Verificar y agregar familyGroup si no existe
            if (!userData.familyGroup) {
                console.log('⚠️  Usuario no tiene familyGroup');
                console.log('   Agregando familyGroup...');
                await db.collection('users').doc(user.uid).update({
                    familyGroup: 'meza-vergara'
                });
                console.log('✅ FamilyGroup agregado');
            }
        }

        console.log('\n🎉 ¡Listo! Ahora puedes hacer login con:');
        console.log(`   Email: ${email}`);
        console.log(`   Password: ${password}`);

    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }

    process.exit(0);
}

createOrUpdateUser();
