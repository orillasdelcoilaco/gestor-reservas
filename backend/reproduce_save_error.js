const fetch = require('node-fetch');

async function testSaveConfig() {
    try {
        console.log('Testing save task config...');
        const response = await fetch('http://localhost:4001/api/planificador/configuracion/tareas', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer mock-token'
            },
            body: JSON.stringify({
                taskType: 'Salida',
                config: {
                    peso: 1,
                    duracion: 60,
                    color: '#f59e0b',
                    descripcion: 'Test Description'
                }
            })
        });

        console.log('Status:', response.status);
        const data = await response.json();
        console.log('Body:', data);
    } catch (error) {
        console.error('Error:', error);
    }
}

testSaveConfig();
