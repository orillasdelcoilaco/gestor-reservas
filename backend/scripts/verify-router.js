const http = require('http');

const TOKEN = 'mock-token'; // Using mock token
const BASE_HOST = 'localhost';
const BASE_PORT = 4001;

const request = (path) => {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: BASE_HOST,
            port: BASE_PORT,
            path: '/api' + path,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${TOKEN}`
            }
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(body);
                    resolve({ status: res.statusCode, body: json });
                } catch (e) {
                    resolve({ status: res.statusCode, body: body });
                }
            });
        });

        req.on('error', (e) => reject(e));
        req.end();
    });
};

async function testRouter() {
    console.log('--- Testing Access Router (/api/me) ---');
    try {
        const response = await request('/me');
        console.log('Status:', response.status);
        console.log('Response:', response.body);

        if (response.status === 200 && response.body.defaultApp) {
            console.log('SUCCESS: Router returned defaultApp configuration.');
            // Verify mock user logic
            if (response.body.email === 'mock@test.com') { // Auth middleware mock
                console.log('User identified as Mock User.');
            }
        } else {
            console.error('FAILURE: Invalid response from router.');
            process.exit(1);
        }

    } catch (error) {
        console.error('Test Failed:', error);
        process.exit(1);
    }
}

testRouter();
