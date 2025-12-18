const http = require('http');

const data = JSON.stringify({
    fechaLlegada: "2025-02-07",
    fechaSalida: "2025-02-19",
    personas: "12",
    permitirCambios: true
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

const req = http.request(options, res => {
    let body = '';
    res.on('data', d => body += d);
    res.on('end', () => {
        console.log(`Status: ${res.statusCode}`);
        if (res.statusCode === 200) {
            const json = JSON.parse(body);
            if (json.suggestion) {
                console.log("SUCCESS!");
            } else {
                console.log("Msg:", json.message);
                console.log("Avail Count:", json.availableCabanas.length);
                console.log("Avail Names:", json.availableCabanas.map(c => c.nombre).join(', '));
                // console.log("All Cabanas:", json.allCabanas.map(c => c.nombre).join(', '));
            }
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
