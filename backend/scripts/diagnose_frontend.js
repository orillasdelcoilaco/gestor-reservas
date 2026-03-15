const axios = require('axios');

async function runDiagnostics() {
    console.log('[Diagnostics] Starting check...');
    const baseUrl = 'http://localhost:4001';
    const mockToken = 'mock-token';

    // 1. Check if backend is running
    try {
        await axios.get(baseUrl + '/api/vehicle-docs/vehicles', {
            headers: { Authorization: `Bearer ${mockToken}` },
            timeout: 5000
        });
        console.log('✅ Backend is running and Vehicle Docs API is reachable.');
    } catch (e) {
        console.error('❌ Backend check failed:', e.message);
        if (e.response) console.error('   Status:', e.response.status);
        process.exit(1);
    }

    // 2. Check the problematic "households" route behavior
    try {
        const res = await axios.get(baseUrl + '/vehiculos/api/households', {
            headers: { Authorization: `Bearer ${mockToken}` },
            validateStatus: () => true // Don't throw on 404
        });

        console.log(`[Check] /vehiculos/api/households returned status: ${res.status}`);
        const contentType = res.headers['content-type'];
        console.log(`[Check] Content-Type: ${contentType}`);

        if (res.status === 200 && contentType && contentType.includes('text/html')) {
            console.log('⚠️  Confirmed: The API returns 200 OK with HTML for missing routes!');
            console.log('   This confirms the hypothesis: Frontend "fetchHousehold" does not fail, but receives HTML, causing the hang.');
        } else if (res.status === 404) {
            console.log('✅ Route returns 404. This should trigger the catch block in frontend.');
        } else {
            console.log(`ℹ️ Unexpected response: ${res.status}`);
        }

    } catch (e) {
        console.error('Error checking households route:', e.message);
    }

    console.log('[Diagnostics] Finished.');
}

runDiagnostics();
