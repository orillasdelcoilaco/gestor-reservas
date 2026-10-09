const crypto = require('crypto');

function puenteActivo() {
    const flag = String(process.env.PUENTE_SODC_ENABLED ?? '1').trim().toLowerCase();
    return flag !== '0' && flag !== 'false' && flag !== 'off';
}

function secretoEsperado() {
    return String(process.env.PUENTE_SODC_SECRET || '');
}

function secretoCoincide(recibido) {
    const expected = secretoEsperado();
    const got = String(recibido || '');
    if (expected.length < 16 || expected.length > 200 || expected.length !== got.length) {
        return false;
    }
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(got));
}

function origenRezerva() {
    const raw = String(process.env.PUENTE_SODC_REZERVA_ORIGIN || 'https://orillasdelcoilaco.rezerva.cl').trim().replace(/\/$/, '');
    if (!/^https:\/\/[a-z0-9.-]+$/.test(raw)) return '';
    return raw;
}

module.exports = {
    puenteActivo,
    secretoCoincide,
    origenRezerva,
};
