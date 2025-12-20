const fetch = require('node-fetch');

async function testDelete() {
    console.log("Testing DELETE task (Auth Bypassed)...");
    const payload = {
        fecha: '2025-12-26',
        cabanaId: 'Cabaña 1',
        accion: 'delete'
    };

    try {
        const res = await fetch('http://localhost:4001/api/planificador/editar-tarea', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const status = res.status;
        const text = await res.text();
        console.log(`Status: ${status}`);
        console.log(`Response: ${text}`);

    } catch (err) {
        console.error("Fetch failed:", err);
    }
}

testDelete();
