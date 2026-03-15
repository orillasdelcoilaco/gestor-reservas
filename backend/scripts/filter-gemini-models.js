const https = require('https');
require('dotenv').config();

const options = {
    hostname: 'generativelanguage.googleapis.com',
    port: 443,
    path: `/v1beta/models?key=${process.env.GOOGLE_API_KEY}`,
    method: 'GET'
};

const req = https.request(options, (res) => {
    let body = '';
    res.on('data', (d) => { body += d; });
    res.on('end', () => {
        try {
            const json = JSON.parse(body);
            const flashModels = json.models.filter(m => m.name.includes('flash')).map(m => m.name);
            console.log('Available Flash Models:', flashModels);
            const allModels = json.models.map(m => m.name);
            console.log('All Models:', allModels);
        } catch (e) {
            console.log('Error parsing JSON:', e.message);
            console.log('Body start:', body.substring(0, 1000));
        }
    });
});
req.end();
