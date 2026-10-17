const https = require('https');
const { puenteActivo, secretoEsperado, origenRezerva } = require('./puenteSodc.auth');

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
            timeout: 4000,
        }, (res) => {
            res.resume();
            res.on('end', () => resolve(res.statusCode || 0));
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

/**
 * Espejo gestor → Rezerva para reservas nacidas en Rezerva (puenteSodc).
 * Envía estado de reserva y estado de gestión.
 */
async function reflejarEstadoEnRezerva(db, reservaIdOriginal, estado, estadoGestion) {
    if (!puenteActivo()) return;
    const ref = String(reservaIdOriginal || '');
    try {
        const secret = secretoEsperado();
        const origin = origenRezerva();
        if (!ref || secret.length < 16 || !origin) return;

        const snapshot = await db.collection('reservas').where('reservaIdOriginal', '==', ref).get();
        if (snapshot.empty) return;

        for (const doc of snapshot.docs) {
            const row = doc.data() || {};
            if (row.puenteSodc !== true || !row.rezervaReservaId || !row.empresaId) continue;

            const body = {
                empresaId: row.empresaId,
                reservaId: row.rezervaReservaId,
                origenId: doc.id,
                estado: estado || row.estado || '',
                estadoGestion: estadoGestion || row.estadoGestion || '',
            };
            if (!body.estado && !body.estadoGestion) continue;

            const status = await postJson(`${origin}/api/puente-sodc/estado`, {
                'X-Puente-Secreto': secret,
            }, body);
            if (status < 200 || status >= 300) {
                console.error('puente sodc estado:', ref, doc.id, status);
            }
        }
    } catch (error) {
        console.error('puente sodc estado:', ref, error.message);
    }
}

module.exports = { reflejarEstadoEnRezerva };
