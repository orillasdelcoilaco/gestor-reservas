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

async function reflejarEstadoEnRezerva(db, reservaIdOriginal, estado) {
    if (!puenteActivo()) return;
    const ref = String(reservaIdOriginal || '');
    const secret = secretoEsperado();
    const origin = origenRezerva();
    if (!ref || secret.length < 16 || !origin) return;
    try {
        const snapshot = await db.collection('reservas').where('reservaIdOriginal', '==', ref).limit(1).get();
        if (snapshot.empty) return;
        const row = snapshot.docs[0].data();
        if (row.puenteSodc !== true || !row.rezervaReservaId || !row.empresaId) return;
        const status = await postJson(`${origin}/api/puente-sodc/estado`, {
            'X-Puente-Secreto': secret,
        }, {
            empresaId: row.empresaId,
            reservaId: row.rezervaReservaId,
            estado,
        });
        if (status < 200 || status >= 300) {
            console.error('puente sodc estado:', ref, status);
        }
    } catch (error) {
        console.error('puente sodc estado:', ref, error.message);
    }
}

module.exports = { reflejarEstadoEnRezerva };
