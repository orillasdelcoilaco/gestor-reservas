require('dotenv').config();
const aiService = require('../apps/vehicle-docs/server/services/aiService');
const fs = require('fs');

async function testExtraction() {
    if (!process.env.GEMINI_API_KEY) {
        fs.writeFileSync('padron_result.json', JSON.stringify({ error: "No API Key" }));
        return;
    }

    const imagePath = "C:/Users/pmeza/.gemini/antigravity/brain/2ea1a6d5-728f-42df-821a-6562261ad610/uploaded_media_1_1769650284766.jpg";
    console.log(`Processing: ${imagePath}`);

    try {
        const buffer = fs.readFileSync(imagePath);

        console.log("Calling AI Service...");
        const result = await aiService.extract(buffer, 'image/jpeg');

        fs.writeFileSync('padron_result.json', JSON.stringify(result, null, 2));

    } catch (error) {
        console.error("Extraction failed:", error);
        fs.writeFileSync('padron_result.json', JSON.stringify({ error: error.message, stack: error.stack }));
    }
}

testExtraction();
