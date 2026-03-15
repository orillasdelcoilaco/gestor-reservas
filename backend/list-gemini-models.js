const https = require('https');
require('dotenv').config();

const key = process.env.GEMINI_API_KEY;

const options = {
    hostname: 'generativelanguage.googleapis.com',
    port: 443,
    path: `/v1beta/models?key=${key}`,
    method: 'GET'
};

const req = https.request(options, (res) => {
    console.log('STATUS:', res.statusCode);
    res.on('data', (d) => {
        process.stdout.write(d);
    });
});

req.on('error', (e) => {
    console.error(e);
});

req.end();
