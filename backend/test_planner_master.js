const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

// Init Firebase
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();

const { generarPropuestaRango } = require('./services/planificadorService');

async function testPlanner() {
    console.log("=== INICIANDO TEST PLANIFICADOR MASTER PROMPT ===");

    // Set range: 1 week from now
    const today = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(today.getDate() + 7);

    const startStr = today.toISOString().split('T')[0];
    const endStr = nextWeek.toISOString().split('T')[0];

    console.log(`Generando propuesta para: ${startStr} a ${endStr}`);

    try {
        const result = await generarPropuestaRango(db, startStr, endStr);

        result.forEach(dia => {
            console.log(`\n📅 FECHA: ${dia.fecha}`);
            console.log(`   Alertas: Refuerzo=${dia.alertas.requiereRefuerzo}, Lunes=${dia.alertas.esLunes}, Conflicto=${dia.alertas.conflictoLunes}`);

            if (dia.propuesta.length === 0) {
                console.log("   (Sin tareas)");
            } else {
                dia.propuesta.forEach(t => {
                    console.log(`   - [${t.horarioInicio}-${t.horarioFin}] ${t.cabanaId}: ${t.tipoAseo} (Refuerzo: ${t.requiereRefuerzo})`);
                });
            }

            // Check Gap Cleaning
            const gapClean = dia.propuesta.find(t => t.tipoAseo === 'Limpieza Profunda');
            if (gapClean) console.log("   ✅ NIVELACIÓN DE CARGA DETECTADA: Limpieza de hueco.");

            // Check Limit
            if (dia.propuesta.length > 4) console.warn("   ⚠️ ALERTA: Límite de 4 tareas superado (Revisar lógica de deferral).");
        });

    } catch (error) {
        console.error("❌ ERROR:", error);
    }
}

testPlanner();
