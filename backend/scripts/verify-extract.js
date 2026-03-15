const http = require('http');
const fs = require('fs');
const path = require('path');

// Mock file creation for test
const TEST_FILE_PATH = path.join(__dirname, 'test-doc.txt');
fs.writeFileSync(TEST_FILE_PATH, 'Dummy PDF content');

const boundary = '--------------------------398939220867882956972688';

const postDataHead =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="document"; filename="test-doc.txt"\r\n` +
    `Content-Type: text/plain\r\n\r\n`;

const postDataTail = `\r\n--${boundary}--`;

const fileContent = fs.readFileSync(TEST_FILE_PATH);

const request = http.request({
    method: 'POST',
    host: 'localhost',
    port: 4001,
    path: '/vehiculos/api/extract',
    headers: {
        'Content-Type': 'multipart/form-data; boundary=' + boundary,
        'Authorization': 'Bearer mock-token'
    }
}, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    res.on('data', (d) => {
        process.stdout.write(d);
    });
    res.on('end', () => {
        // Cleanup
        if (fs.existsSync(TEST_FILE_PATH)) fs.unlinkSync(TEST_FILE_PATH);
    });
});

request.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
    if (fs.existsSync(TEST_FILE_PATH)) fs.unlinkSync(TEST_FILE_PATH);
});

request.write(postDataHead);
request.write(fileContent);
request.write(postDataTail);
request.end();
