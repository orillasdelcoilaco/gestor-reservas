const https = require('https');
require('dotenv').config();

const data = JSON.stringify({
    contents: [{ parts: [{ text: "Hola" }] }]
});

const options = {
    hostname: 'generativelanguage.googleapis.com',
    port: 443,
    path: `/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GOOGLE_API_KEY}`,
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

const req = https.request(options, (res) => {
    console.log('StatusCode:', res.statusCode);
    let body = '';
    res.on('data', (d) => { body += d; });
    res.on('end', () => {
        console.log('Body:', body);
    });
});

req.on('error', (e) => {
    console.error('Error:', e);
});

req.write(data);
req.end();
