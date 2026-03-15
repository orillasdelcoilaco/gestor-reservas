const http = require('http');
const fs = require('fs');
const path = require('path');

const boundary = '--------------------------398939220867882956972688';
const frontPath = 'C:\\Users\\pmeza\\.gemini\\antigravity\\brain\\f2bd2dad-24cc-4fda-a0f3-a7aefca10f33\\uploaded_media_0_1769820747573.jpg';

if (!fs.existsSync(frontPath)) {
    console.error('File not found:', frontPath);
    process.exit(1);
}

const fileStats = fs.statSync(frontPath);
const fileName = path.basename(frontPath);

const postDataHead =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="document"; filename="${fileName}"\r\n` +
    `Content-Type: image/jpeg\r\n\r\n`;

const postDataTail =
    `\r\n--${boundary}\r\n` +
    `Content-Disposition: form-data; name="expectedDocType"\r\n\r\n` +
    `PADRON\r\n` +
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="vehicleId"\r\n\r\n` +
    `test-auto-001\r\n` +
    `--${boundary}--`;

const contentLength = Buffer.byteLength(postDataHead) + fileStats.size + Buffer.byteLength(postDataTail);

const options = {
    hostname: 'localhost',
    port: 4001,
    path: '/api/vehicle-docs/test-extract',
    method: 'POST',
    headers: {
        'Content-Type': 'multipart/form-data; boundary=' + boundary,
        'Content-Length': contentLength
        // No auth header initially, seeing if it passes or 403s
    }
};

console.log(`Sending ${fileName} (${fileStats.size} bytes) to ${options.hostname}:${options.port}${options.path}...`);

const req = http.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    let data = '';

    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            console.log('RESPONSE:', JSON.stringify(json, null, 2));
        } catch (e) {
            console.log('RESPONSE (Raw):', data);
        }
    });
});

req.on('error', (e) => {
    console.error(`Problem with request: ${e.message}`);
});

// Write data
req.write(postDataHead);
const fileStream = fs.createReadStream(frontPath);
fileStream.pipe(req, { end: false });
fileStream.on('end', () => {
    req.write(postDataTail);
    req.end();
});
