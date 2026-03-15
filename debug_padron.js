require('dotenv').config();
const aiService = require('./apps/vehicle-docs/server/services/aiService');
const fs = require('fs');

async function testExtraction() {
    // Check if API key is loaded
    if (!process.env.GEMINI_API_KEY) {
        console.error("No API Key found!");
        return;
    }

    const imagePath = "C:/Users/pmeza/.gemini/antigravity/brain/2ea1a6d5-728f-42df-821a-6562261ad610/uploaded_media_0_1769650284766.jpg";
    console.log(`Processing: ${imagePath}`);

    try {
        const buffer = fs.readFileSync(imagePath);

        console.log("Calling AI Service...");
        const result = await aiService.extract(buffer, 'image/jpeg');

        console.log("\n--- EXTRACTED DATA ---");
        console.log(JSON.stringify(result, null, 2));

    } catch (error) {
        console.error("Extraction failed:", error);
    }
}

testExtraction();
