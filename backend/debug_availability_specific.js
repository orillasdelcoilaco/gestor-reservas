const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: 'reservas-sodc'
    });
}

const db = admin.firestore();

async function checkSpecificCabanas() {
    const targetIds = ['Cabaña 8', 'Cabaña 3'];
    const startDate = new Date('2025-02-07T00:00:00Z');
    const endDate = new Date('2025-02-19T00:00:00Z');

    console.log(`Checking ${targetIds.join(' and ')} for ${startDate.toISOString()} to ${endDate.toISOString()}`);

    for (const id of targetIds) {
        console.log(`\n--- Inspecting ${id} ---`);
        // 1. Get Cabana Data (Capacity)
        // Note: Firestore IDs might not be exactly "Cabaña 8". Searching by name field if ID fails.
        let cabanaDoc = await db.collection('cabanas').doc(id).get();
        if (!cabanaDoc.exists) {
            console.log(`Doc ID '${id}' not found. Searching by 'nombre'...`);
            const q = await db.collection('cabanas').where('nombre', '==', id).get();
            if (q.empty) {
                console.error(`Cabaña '${id}' not found in DB!`);
                continue;
            }
            cabanaDoc = q.docs[0];
        }

        const c = cabanaDoc.data();
        console.log(`Capacity: ${c.capacidad}`);
        console.log(`Status: ${c.estado || 'Activa'}`);

        // 2. Check Reservations Overlap
        const resSnap = await db.collection('reservas')
            .where('alojamiento', '==', c.nombre)
            .where('fechaLlegada', '>=', admin.firestore.Timestamp.fromDate(new Date('2025-02-01')))
            .get();

        let occupied = false;
        resSnap.forEach(rDoc => {
            const r = rDoc.data();
            const rStart = r.fechaLlegada.toDate();
            const rEnd = r.fechaSalida.toDate();

            // Overlap check
            if (rStart < endDate && rEnd > startDate) {
                if (r.estado !== 'Cancelada') {
                    console.log(`[OCCUPIED] ${rStart.toISOString().split('T')[0]} to ${rEnd.toISOString().split('T')[0]} (${r.estado})`);
                    occupied = true;
                }
            }
        });
        if (!occupied) console.log("[FREE] No conflicting reservations found.");

        // 3. Check Tariffs
        const tarifSnap = await db.collection('tarifas')
            .where('nombreCabaña', '==', c.nombre)
            .get();

        let hasTariff = false;
        tarifSnap.forEach(tDoc => {
            const t = tDoc.data();
            const tStart = t.fechaInicio.toDate();
            const tEnd = t.fechaTermino.toDate();

            if (tStart <= startDate && tEnd >= endDate) {
                console.log(`[TARIFF OK] Covers full period: ${tStart.toISOString().split('T')[0]} to ${tEnd.toISOString().split('T')[0]} (${t.tarifasPorCanal?.SODC?.valor || 'N/A'})`);
                hasTariff = true;
            } else if (tEnd > startDate && tStart < endDate) {
                console.log(`[TARIFF PARTIAL] ${tStart.toISOString().split('T')[0]} to ${tEnd.toISOString().split('T')[0]}`);
            }
        });
        if (!hasTariff) console.warn("[WARNING] No single tariff covers the entire range!");
    }
}

checkSpecificCabanas();
