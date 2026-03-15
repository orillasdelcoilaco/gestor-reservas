const http = require('http');

const TOKEN = 'mock-token'; // Using mock token enabled in authMiddleware
const BASE_HOST = 'localhost';
const BASE_PORT = 4001;
const BASE_PATH = '/vehiculos/api';

const request = (method, path, data) => {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: BASE_HOST,
            port: BASE_PORT,
            path: BASE_PATH + path,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${TOKEN}`
            }
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(body);
                    if (res.statusCode >= 400) {
                        reject({ status: res.statusCode, error: json });
                    } else {
                        resolve(json);
                    }
                } catch (e) {
                    reject({ status: res.statusCode, error: body });
                }
            });
        });

        req.on('error', (e) => reject(e));

        if (data) {
            req.write(JSON.stringify(data));
        }
        req.end();
    });
};

async function runTests() {
    try {
        console.log('--- 1. Creating Household ---');
        const household = await request('POST', '/households', {
            name: 'Familia Test'
        });
        console.log('Household Created:', household);

        console.log('\n--- 2. Creating Vehicle ---');
        const vehicle = await request('POST', '/vehicles', {
            patente: 'ABCD12',
            marca: 'Toyota',
            modelo: 'Yaris',
            anio: 2020,
            alias: 'Auto Rojo',
            householdId: household.id
        });
        console.log('Vehicle Created:', vehicle);

        console.log('\n--- 3. Listing Vehicles ---');
        const vehicles = await request('GET', '/vehicles');
        console.log('Vehicles Found:', vehicles);

        if (vehicles.find(v => v.id === vehicle.id)) {
            console.log('\nSUCCESS: Vehicle found in list.');
        } else {
            console.error('\nFAILURE: Vehicle not found.');
            process.exit(1);
        }

    } catch (error) {
        console.error('\nTEST FAILED:', error);
        process.exit(1);
    }
}

runTests();
