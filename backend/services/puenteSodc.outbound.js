const https = require('https');
const { puenteActivo, secretoEsperado, origenRezerva } = require('./puenteSodc.auth');
const { cleanCabanaName } = require('../utils/helpers');

const EXCLUIDAS_ALTA = new Set([
    'APP_APP-1792024232886_Cabaña10',
]);

const BACKOFF_MS = [
    60 * 1000,
    5 * 60 * 1000,
    15 * 60 * 1000,
    60 * 60 * 1000,
    6 * 60 * 60 * 1000,
    24 * 60 * 60 * 1000,
];

function origenOutbound() {
    const fromEnv = String(process.env.PUENTE_SODC_GESTOR_ORIGIN || '').trim().replace(/\/$/, '');
    if (fromEnv && /^https:\/\/[a-z0-9.-]+$/.test(fromEnv)) return fromEnv;
    const shared = origenRezerva();
    if (shared) return shared;
    return 'https://rezerva.cl';
}

function propiedadIdDesdeReserva(data) {
    const guardado = String(data && data.propiedadId || '').trim();
    if (/^[a-z0-9-]{1,64}$/.test(guardado)) return guardado;
    const nombre = cleanCabanaName(String(data && data.alojamiento || ''));
    const match = nombre.match(/^cabaña\s+(\d+)$/i);
    if (!match) return '';
    return `cabana${Number(match[1])}`;
}

function diaUtc(value) {
    if (!value) return '';
    if (typeof value.toDate === 'function') return value.toDate().toISOString().slice(0, 10);
    if (value instanceof Date && !isNaN(value)) return value.toISOString().slice(0, 10);
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
    return '';
}

function syncPendienteInicial() {
    return {
        ok: false,
        at: new Date().toISOString(),
        error: null,
        intentos: 0,
    };
}

function debeOmitirAlta(reservaId, data) {
    if (!reservaId || EXCLUIDAS_ALTA.has(reservaId)) return true;
    if (data && data.puenteSodc === true) return true;
    return false;
}

function delayParaIntento(intentos) {
    const idx = Math.min(Math.max((Number(intentos) || 1) - 1, 0), BACKOFF_MS.length - 1);
    return BACKOFF_MS[idx];
}

function listoParaReintento(sync) {
    if (!sync || sync.ok === true) return false;
    const intentos = Number(sync.intentos) || 0;
    if (intentos <= 0) return true;
    const at = Date.parse(sync.at || 0);
    if (!Number.isFinite(at)) return true;
    return Date.now() >= at + delayParaIntento(intentos);
}

function postJson(urlString, headers, body) {
    const url = new URL(urlString);
    const payload = JSON.stringify(body);
    return new Promise((resolve, reject) => {
        const req = https.request({
            method: 'POST',
            hostname: url.hostname,
            path: `${url.pathname}${url.search}`,
            headers: {
                ...headers,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
            },
            timeout: 8000,
        }, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                resolve({
                    status: res.statusCode || 0,
                    body: Buffer.concat(chunks).toString('utf8').slice(0, 500),
                });
            });
        });
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('timeout'));
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

async function marcarSync(ref, prev, ok, error) {
    const intentos = (Number(prev && prev.intentos) || 0) + 1;
    await ref.set({
        rezervaSync: {
            ok: !!ok,
            at: new Date().toISOString(),
            error: ok ? null : String(error || 'error').slice(0, 300),
            intentos,
        },
    }, { merge: true });
}

function payloadAlta(reservaId, data) {
    const propiedadId = propiedadIdDesdeReserva(data);
    const total = Math.round(Number(data.valorCLP) || 0);
    const abono = Math.round(Number(data.abono) || 0);
    return {
        origenId: reservaId,
        reservaIdOriginal: data.reservaIdOriginal || reservaId,
        propiedadId,
        llegada: diaUtc(data.fechaLlegada),
        salida: diaUtc(data.fechaSalida),
        noches: Number(data.totalNoches) || 0,
        personas: Number(data.invitados) || 1,
        total,
        abono,
        pendiente: Math.round(Number(data.pendiente) || Math.max(total - abono, 0)),
        estado: data.estado || '',
        estadoGestion: data.estadoGestion || '',
        pagado: !!data.pagado,
        canal: data.canal || '',
        huesped: {
            nombre: data.clienteNombre || '',
            email: data.correo || '',
            telefono: data.telefono || '',
        },
    };
}

function payloadPago(reservaId, txId, reservaData, txData) {
    return {
        origenId: txId,
        reservaOrigenId: reservaId,
        reservaIdOriginal: reservaData.reservaIdOriginal || reservaId,
        propiedadId: propiedadIdDesdeReserva(reservaData),
        monto: Math.round(Number(txData.monto) || 0),
        medioDePago: txData.medioDePago || '',
        tipo: txData.tipo || '',
        fecha: diaUtc(txData.fecha) || new Date().toISOString().slice(0, 10),
        enlaceComprobante: txData.enlaceComprobante || null,
        estado: reservaData.estado || '',
        estadoGestion: reservaData.estadoGestion || '',
        abono: Math.round(Number(reservaData.abono) || 0),
        pagado: !!reservaData.pagado,
    };
}

async function enviarAltaGestor(db, reservaId) {
    if (!puenteActivo()) return;
    const ref = db.collection('reservas').doc(reservaId);
    const snap = await ref.get();
    if (!snap.exists) return;
    const data = snap.data() || {};
    if (debeOmitirAlta(reservaId, data)) return;

    const prev = data.rezervaSync || syncPendienteInicial();
    const secret = secretoEsperado();
    const origin = origenOutbound();
    if (secret.length < 16 || !origin) {
        await marcarSync(ref, prev, false, 'config_incompleta');
        return;
    }

    const body = payloadAlta(reservaId, data);
    if (!body.propiedadId || !body.llegada || !body.salida) {
        await marcarSync(ref, prev, false, 'payload_invalido');
        return;
    }

    try {
        const result = await postJson(`${origin}/api/puente-sodc/alta-gestor`, {
            'X-Puente-Secreto': secret,
        }, body);
        if (result.status >= 200 && result.status < 300) {
            await marcarSync(ref, prev, true, null);
            return;
        }
        await marcarSync(ref, prev, false, `http_${result.status}${result.body ? `:${result.body}` : ''}`);
    } catch (error) {
        await marcarSync(ref, prev, false, error.message || 'red');
    }
}

async function enviarPagoGestor(db, reservaId, txId) {
    if (!puenteActivo()) return;
    const reservaRef = db.collection('reservas').doc(reservaId);
    const txRef = reservaRef.collection('transacciones').doc(txId);
    const [reservaSnap, txSnap] = await Promise.all([reservaRef.get(), txRef.get()]);
    if (!reservaSnap.exists || !txSnap.exists) return;

    const reservaData = reservaSnap.data() || {};
    const txData = txSnap.data() || {};
    if (debeOmitirAlta(reservaId, reservaData)) return;

    const prev = txData.rezervaSync || syncPendienteInicial();
    const secret = secretoEsperado();
    const origin = origenOutbound();
    if (secret.length < 16 || !origin) {
        await marcarSync(txRef, prev, false, 'config_incompleta');
        return;
    }

    const body = payloadPago(reservaId, txId, reservaData, txData);
    if (!body.propiedadId || !body.monto) {
        await marcarSync(txRef, prev, false, 'payload_invalido');
        return;
    }

    try {
        const result = await postJson(`${origin}/api/puente-sodc/pago-gestor`, {
            'X-Puente-Secreto': secret,
        }, body);
        if (result.status >= 200 && result.status < 300) {
            await marcarSync(txRef, prev, true, null);
            return;
        }
        await marcarSync(txRef, prev, false, `http_${result.status}${result.body ? `:${result.body}` : ''}`);
    } catch (error) {
        await marcarSync(txRef, prev, false, error.message || 'red');
    }
}

function avisarAltaGestor(db, reservaId) {
    Promise.resolve()
        .then(() => enviarAltaGestor(db, reservaId))
        .catch((error) => console.error('puente alta-gestor:', reservaId, error.message));
}

function avisarPagoGestor(db, reservaId, txId) {
    Promise.resolve()
        .then(() => enviarPagoGestor(db, reservaId, txId))
        .catch((error) => console.error('puente pago-gestor:', reservaId, txId, error.message));
}

function avisarAltasGestor(db, reservaIds) {
    const unicos = [...new Set((reservaIds || []).filter(Boolean))];
    unicos.forEach((id) => avisarAltaGestor(db, id));
}

module.exports = {
    EXCLUIDAS_ALTA,
    propiedadIdDesdeReserva,
    syncPendienteInicial,
    debeOmitirAlta,
    listoParaReintento,
    enviarAltaGestor,
    enviarPagoGestor,
    avisarAltaGestor,
    avisarPagoGestor,
    avisarAltasGestor,
};
