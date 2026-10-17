const {
    listoParaReintento,
    enviarAltaGestor,
    enviarPagoGestor,
    debeOmitirAlta,
} = require('./puenteSodc.outbound');
const { puenteActivo } = require('./puenteSodc.auth');

const INTERVALO_MS = 60 * 1000;
const LOTE = 25;

let timer = null;
let corriendo = false;

async function reintentarReservas(db) {
    const snap = await db.collection('reservas')
        .where('rezervaSync.ok', '==', false)
        .limit(LOTE)
        .get();

    for (const doc of snap.docs) {
        const data = doc.data() || {};
        if (debeOmitirAlta(doc.id, data)) continue;
        if (!listoParaReintento(data.rezervaSync)) continue;
        await enviarAltaGestor(db, doc.id);
    }
}

async function reintentarPagos(db) {
    let snap;
    try {
        snap = await db.collectionGroup('transacciones')
            .where('rezervaSync.ok', '==', false)
            .limit(LOTE)
            .get();
    } catch (error) {
        console.error('puente retry pagos (índice?):', error.message);
        return;
    }

    for (const doc of snap.docs) {
        const parent = doc.ref.parent && doc.ref.parent.parent;
        if (!parent) continue;
        const reservaId = parent.id;
        const reservaSnap = await parent.get();
        if (!reservaSnap.exists) continue;
        const reservaData = reservaSnap.data() || {};
        if (debeOmitirAlta(reservaId, reservaData)) continue;
        if (!listoParaReintento(doc.data().rezervaSync)) continue;
        await enviarPagoGestor(db, reservaId, doc.id);
    }
}

async function tick(db) {
    if (!puenteActivo() || corriendo) return;
    corriendo = true;
    try {
        await reintentarReservas(db);
        await reintentarPagos(db);
    } catch (error) {
        console.error('puente retry:', error.message);
    } finally {
        corriendo = false;
    }
}

function startRezervaSyncRetryJob(db) {
    if (timer) return;
    timer = setInterval(() => {
        tick(db).catch((error) => console.error('puente retry tick:', error.message));
    }, INTERVALO_MS);
    if (typeof timer.unref === 'function') timer.unref();
    console.log('Job de reintentos Rezerva (alta/pago gestor) iniciado.');
}

module.exports = {
    startRezervaSyncRetryJob,
    tick,
};
