require('dotenv').config();
const aiService = require('../apps/vehicle-docs/server/services/aiService');
const fs = require('fs');

async function debug() {
    const imagePath = "C:/Users/pmeza/.gemini/antigravity/brain/2ea1a6d5-728f-42df-821a-6562261ad610/uploaded_media_0_1769653596050.jpg";
    console.log(`Processing: ${imagePath}`);

    if (!fs.existsSync(imagePath)) {
        console.error("File not found!");
        return;
    }

    try {
        const buffer = fs.readFileSync(imagePath);
        console.log("Calling AI Service...");
        const result = await aiService.extract(buffer, 'image/png');

        console.log("\n--- RESULT ---");
        console.log(JSON.stringify(result, null, 2));

    } catch (error) {
        console.error("Extraction failed:", error);
    }
}

debug();
