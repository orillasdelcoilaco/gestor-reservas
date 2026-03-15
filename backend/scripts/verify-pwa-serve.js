const http = require('http');

const options = {
    hostname: 'localhost',
    port: 4001,
    path: '/vehiculos/app/index.html',
    method: 'GET'
};

const req = http.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    let body = '';
    res.on('data', (chunk) => {
        body += chunk;
    });
    res.on('end', () => {
        if (body.includes('<div id="root"></div>')) {
            console.log('SUCCESS: PWA index.html served correctly.');
        } else {
            console.log('FAILURE: Response does not look like PWA index.html');
            console.log(body.substring(0, 200));
        }
    });
});

req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
});

req.end();
