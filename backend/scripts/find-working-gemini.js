const { GoogleGenerativeAI } = require('@google/generative-ai');
const https = require('https');
require('dotenv').config();

async function findWorkingModel() {
    const key = process.env.GOOGLE_API_KEY;
    const options = {
        hostname: 'generativelanguage.googleapis.com',
        port: 443,
        path: `/v1beta/models?key=${key}`,
        method: 'GET'
    };

    let models = [];
    await new Promise((resolve) => {
        https.request(options, (res) => {
            let body = '';
            res.on('data', (d) => { body += d; });
            res.on('end', () => {
                try {
                    const json = JSON.parse(body);
                    models = json.models.map(m => m.name);
                    resolve();
                } catch (e) { resolve(); }
            });
        }).end();
    });

    console.log('Detected models:', models);
    const genAI = new GoogleGenerativeAI(key);

    for (const m of models) {
        // Skip chat-only or non-text models if we can distinguish, or just try
        try {
            console.log(`Testing ${m}...`);
            const model = genAI.getGenerativeModel({ model: m });
            const result = await model.generateContent("Say hi");
            console.log(`SUCCESS: ${m} works!`);
            console.log('Response:', result.response.text());
            return m;
        } catch (e) {
            console.error(`FAIL: ${m} - ${e.message}`);
        }
    }
}

findWorkingModel();
