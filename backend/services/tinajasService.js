const admin = require('firebase-admin');

function getTodayUTC() {
    const today = new Date();
    return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
}

async function getTinajasDiarias(db) {
    const todayUTC = getTodayUTC();
    // Helper to get start/end of day for queries effectively
    const startOfDay = new Date(todayUTC);
    const endOfDay = new Date(todayUTC);
    endOfDay.setUTCDate(todayUTC.getUTCDate() + 1);

    // 1. Fetch relevant reservations: Check-ins (Arriving today) and Check-outs (Leaving today)
    // We need Check-outs to detect the "Change" (Limpieza Obligatoria)
    // We need Check-ins and Stay-overs to show in the list of "Tinajas del día"

    // Note: To simplify and avoid complex indexes, we might fetch active 'Confirmada' reservations 
    // and filter in memory, assuming the volume allows it (which seems true for this system).
    const snapshot = await db.collection('reservas')
        .where('estado', '==', 'Confirmada')
        .get();

    const checkIns = [];
    const checkOuts = [];
    const stayOvers = [];

    snapshot.forEach(doc => {
        const data = doc.data();
        const llegada = data.fechaLlegada.toDate();
        const salida = data.fechaSalida.toDate();

        // Normalize to UTC Date for comparison
        const llegadaUTC = new Date(Date.UTC(llegada.getUTCFullYear(), llegada.getUTCMonth(), llegada.getUTCDate()));
        const salidaUTC = new Date(Date.UTC(salida.getUTCFullYear(), salida.getUTCMonth(), salida.getUTCDate()));

        if (llegadaUTC.getTime() === todayUTC.getTime()) {
            checkIns.push({ id: doc.id, ...data });
        } else if (salidaUTC.getTime() === todayUTC.getTime()) {
            checkOuts.push({ id: doc.id, ...data });
        } else if (llegadaUTC < todayUTC && salidaUTC > todayUTC) {
            stayOvers.push({ id: doc.id, ...data });
        }
    });

    // 2. Fetch Persistence Data (gestion_tinajas_diaria)
    const dateStr = todayUTC.toISOString().split('T')[0]; // YYYY-MM-DD
    const persistenceSnapshot = await db.collection('gestion_tinajas_diaria')
        .where('fecha', '==', dateStr)
        .get();

    const persistenceMap = new Map();
    persistenceSnapshot.forEach(doc => {
        persistenceMap.set(doc.data().reservaId, doc.data());
    });

    // 3. Build Result List
    // Target list: Check-ins AND Stay-overs
    const targetReservas = [...checkIns, ...stayOvers];

    const result = targetReservas.map(reserva => {
        // Cleaning Detection: Is there a checkout for this cabin today?
        // Note: 'alojamiento' might be array or string depending on schema version, assume string per cabin for simplicity or handle array.
        // Based on previous code, 'alojamiento' seems to be per-reservation. 
        // If it's a multi-cabin booking, 'reservas' collection usually holds individual or logic handles it. 
        // Looking at gestionService.js, 'alojamiento' is on the doc.

        const isChange = checkOuts.some(out => out.alojamiento === reserva.alojamiento);

        const persistentData = persistenceMap.get(reserva.reservaIdOriginal) || {}; // stored by ID Original

        // Note: persistence might utilize doc ID or field. Let's assume we store by reservaIdOriginal to be safe across re-fetches.
        // Actually, let's check if the ID in loop is the document ID or data.reservaIdOriginal.
        // checkIns push { id: doc.id, ...data }. data has reservaIdOriginal.

        return {
            id: reserva.reservaIdOriginal, // Use this as stable key
            reservaId: reserva.reservaIdOriginal,
            cabana: reserva.alojamiento,
            clienteNombre: reserva.clienteNombre,
            telefono: reserva.telefono,
            limpiezaObligatoria: isChange && reserva.fechaLlegada.toDate().getTime() === todayUTC.getTime(), // Only for the arriving party
            enviado: persistentData.enviado || false,
            respuestaSi: persistentData.respuestaSi || false
        };
    });

    return result;
}

async function updateTinajaStatus(db, { id, field, value }) {
    const todayUTC = getTodayUTC();
    const dateStr = todayUTC.toISOString().split('T')[0];

    // Key: YYYY-MM-DD_ReservaID
    const docId = `${dateStr}_${id}`;
    const docRef = db.collection('gestion_tinajas_diaria').doc(docId);

    const doc = await docRef.get();

    if (doc.exists) {
        await docRef.update({
            [field]: value
        });
    } else {
        await docRef.set({
            fecha: dateStr,
            reservaId: id,
            [field]: value,
            enviado: field === 'enviado' ? value : false,
            respuestaSi: field === 'respuestaSi' ? value : false
        });
    }
    return { success: true };
}

module.exports = {
    getTinajasDiarias,
    updateTinajaStatus
};
