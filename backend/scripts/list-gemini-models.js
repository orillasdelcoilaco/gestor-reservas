const https = require('https');
require('dotenv').config();

const options = {
    hostname: 'generativelanguage.googleapis.com',
    port: 443,
    path: `/v1beta/models?key=${process.env.GOOGLE_API_KEY}`,
    method: 'GET'
};

const req = https.request(options, (res) => {
    console.log('StatusCode:', res.statusCode);
    let body = '';
    res.on('data', (d) => { body += d; });
    res.on('end', () => {
        try {
            const json = JSON.parse(body);
            console.log('Models:', JSON.stringify(json, null, 2));
        } catch (e) {
            console.log('Body:', body);
        }
    });
});

req.on('error', (e) => {
    console.error('Error:', e);
});

req.end();
