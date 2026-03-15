require('dotenv').config();
const fs = require('fs');

async function list() {
    if (!process.env.GEMINI_API_KEY) {
        console.log("No API Key");
        return;
    }

    const key = process.env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;

    try {
        const response = await fetch(url);
        const data = await response.json();
        fs.writeFileSync('models_utf8.json', JSON.stringify(data, null, 2), 'utf8');
        console.log("Written to models_utf8.json");
    } catch (e) {
        console.error(e);
    }
}

list();
