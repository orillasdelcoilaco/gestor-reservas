require('dotenv').config();
const aiService = require('../apps/vehicle-docs/server/services/aiService');
const fs = require('fs');

async function debug() {
    console.log("Starting Debug...");
    try {
        // Use one of the uploaded images
        const imagePath = "C:/Users/pmeza/.gemini/antigravity/brain/2ea1a6d5-728f-42df-821a-6562261ad610/uploaded_media_1_1769650284766.jpg";
        if (!fs.existsSync(imagePath)) {
            console.error("Image not found");
            return;
        }
        const buffer = fs.readFileSync(imagePath);

        console.log("Calling extract...");
        const result = await aiService.extract(buffer, 'image/jpeg');
        console.log("Success:", result);
    } catch (e) {
        console.error("CAUGHT ERROR:", e);
    }
}

debug();
