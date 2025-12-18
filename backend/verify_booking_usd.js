const http = require('http');

const data = JSON.stringify({
    fechaLlegada: "2026-02-07",
    fechaSalida: "2026-02-19",
    personas: "12",
    permitirCambios: true,
    canal: "Booking", // <--- Testing Booking logic
    cliente: { nombre: "Test User", email: "test@example.com" } // Needed for mock? Maybe not for generating budget but for context
});

const options = {
    hostname: 'localhost',
    port: 4002,
    path: '/api/presupuestos/generar',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        'Authorization': 'Bearer dummy-token'
    }
};

console.log("Testing Booking USD Logic...");
const req = http.request(options, res => {
    let body = '';
    res.on('data', d => body += d);
    res.on('end', () => {
        console.log(`Status: ${res.statusCode}`);
        if (res.statusCode === 200) {
            const json = JSON.parse(body);
            // Even if suggestion is empty (due to capacity), we check if the error/response mentions USD/Booking processing were attempted
            // OR if we get a suggestion, check for USD fields.
            // Since availability failed before, we might get 'No hay suficientes...'. 
            // BUT, the user wants to test the *logic*. 
            // If I can't find a cabin, I can't verify the price.
            // So if this fails to find cabins, checking USD is hard.
            // However, let's see what it returns.
            console.log("Response:", JSON.stringify(json, null, 2));
        } else {
            console.log("ERROR Body:", body);
        }
    });
});

req.on('error', error => {
    console.error(error);
});

req.write(data);
req.end();
