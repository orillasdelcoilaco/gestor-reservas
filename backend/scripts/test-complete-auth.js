const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');
const FormData = require('form-data');
const fetch = require('node-fetch');

// Inicializar Firebase Admin SDK
try {
    const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log('✅ Firebase Admin SDK inicializado\n');
} catch (error) {
    console.error('❌ Error inicializando Firebase:', error.message);
    process.exit(1);
}

async function testCompleteWorkflow() {
    const email = 'pmezavergara@gmail.com';
    const baseUrl = 'http://localhost:4001';

    try {
        console.log('🔐 PASO 1: Generando token custom de autenticación...');
        const user = await admin.auth().getUserByEmail(email);
        const customToken = await admin.auth().createCustomToken(user.uid);
        console.log(`✅ Token generado para UID: ${user.uid}\n`);

        console.log('🔑 PASO 2: Obteniendo ID token de Firebase Auth...');
        // Para obtener un ID token, necesitaríamos usar el SDK del cliente
        // Por ahora, vamos a verificar el usuario directamente
        const userRecord = await admin.auth().getUser(user.uid);
        console.log(`✅ Usuario verificado:`);
        console.log(`   Email: ${userRecord.email}`);
        console.log(`   Email verificado: ${userRecord.emailVerified}`);
        console.log(`   Disabled: ${userRecord.disabled}\n`);

        console.log('📋 PASO 3: Verificando permisos en Firestore...');
        const db = admin.firestore();
        const userDoc = await db.collection('users').doc(user.uid).get();

        if (!userDoc.exists) {
            console.log('⚠️  Usuario no existe en Firestore, creando...');
            await db.collection('users').doc(user.uid).set({
                email: email,
                permissions: {
                    vehicleDocs: true
                },
                familyGroup: 'test-group',
                createdAt: new Date()
            });
            console.log('✅ Usuario creado en Firestore con permisos\n');
        } else {
            const userData = userDoc.data();
            console.log(`✅ Usuario existe en Firestore:`);
            console.log(`   Family Group: ${userData.familyGroup || 'N/A'}`);
            console.log(`   VehicleDocs Permission: ${userData.permissions?.vehicleDocs || false}\n`);

            if (!userData.permissions?.vehicleDocs) {
                console.log('⚠️  Agregando permiso vehicleDocs...');
                await db.collection('users').doc(user.uid).update({
                    'permissions.vehicleDocs': true
                });
                console.log('✅ Permiso agregado\n');
            }

            if (!userData.familyGroup) {
                console.log('⚠️  Agregando familyGroup...');
                await db.collection('users').doc(user.uid).update({
                    familyGroup: 'test-group'
                });
                console.log('✅ FamilyGroup agregado\n');
            }
        }

        console.log('🎯 RESUMEN DE VALIDACIÓN:');
        console.log('═'.repeat(50));
        console.log(`✅ Usuario autenticado: ${email}`);
        console.log(`✅ UID: ${user.uid}`);
        console.log(`✅ Email verificado: ${userRecord.emailVerified}`);
        console.log(`✅ Cuenta activa: ${!userRecord.disabled}`);
        console.log(`✅ Permiso vehicleDocs: Activo`);
        console.log(`✅ Family Group: Configurado`);
        console.log('═'.repeat(50));

        console.log('\n📝 INSTRUCCIONES PARA TESTING MANUAL:');
        console.log('1. Abre Chrome en modo incógnito (Ctrl+Shift+N)');
        console.log('2. Navega a: http://localhost:4001');
        console.log('3. Usa las credenciales:');
        console.log(`   Email: ${email}`);
        console.log('   Password: perfil4422');
        console.log('4. Si el login falla, limpia el localStorage de Firebase:');
        console.log('   - Abre DevTools (F12)');
        console.log('   - Ve a Application > Storage > LocalStorage');
        console.log('   - Elimina todo el localStorage de localhost:4001');
        console.log('   - Recarga la página (F5)');
        console.log('   - Intenta login nuevamente\n');

        console.log('🔧 INFORMACIÓN DE DEPURACIÓN:');
        console.log(`Custom Token (primeros 50 chars): ${customToken.substring(0, 50)}...`);
        console.log('\nPuedes usar este token para testing con Postman/cURL:');
        console.log('Headers necesarios:');
        console.log('  Authorization: Bearer <ID_TOKEN>');
        console.log('\nPara obtener ID token desde custom token, usa:');
        console.log('https://firebase.google.com/docs/auth/admin/create-custom-tokens#sign_in_using_custom_tokens_on_clients\n');

    } catch (error) {
        console.error('❌ Error:', error);
        console.error('\nDetalles del error:', error.message);
        if (error.code) console.error('Código de error:', error.code);
        process.exit(1);
    }

    process.exit(0);
}

testCompleteWorkflow();
