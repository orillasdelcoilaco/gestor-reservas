const assert = require('assert');
const { validarDocumentoDesdeRezerva } = require('../services/puenteSodc.documento');

const ok = validarDocumentoDesdeRezerva({
    origenId: 'APP_APP-1792411118675_Cabaña7',
    reservaIdOriginal: 'APP-1792411118675',
    campo: 'enlaceBoleta',
    url: 'https://example.com/espejo-boleta-2',
});
assert.strictEqual(ok.campo, 'enlaceBoleta');
assert.strictEqual(ok.url, 'https://example.com/espejo-boleta-2');

const vacia = validarDocumentoDesdeRezerva({
    origenId: 'APP_APP-1792411118675_Cabaña7',
    reservaIdOriginal: 'APP-1792411118675',
    campo: 'enlaceReserva',
    url: '',
});
assert.strictEqual(vacia.url, '');

assert.throws(() => validarDocumentoDesdeRezerva({
    origenId: 'APP_APP-1_Cabaña7',
    reservaIdOriginal: 'APP-1',
    campo: 'otro',
    url: 'https://example.com/x',
}), /datos_invalidos/);

assert.throws(() => validarDocumentoDesdeRezerva({
    origenId: 'APP_APP-1_Cabaña7',
    reservaIdOriginal: 'APP-1',
    campo: 'enlaceBoleta',
    url: 'http://example.com/x',
}), /datos_invalidos/);

assert.throws(() => validarDocumentoDesdeRezerva({
    origenId: 'APP_APP-1_Cabaña7',
    reservaIdOriginal: 'APP-1',
    campo: 'enlaceBoleta',
    url: 'https://example.com/has space',
}), /datos_invalidos/);

console.log('puenteSodc.documento.test ok');
