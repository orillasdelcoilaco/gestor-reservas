const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Config
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const FRONT_IMAGE = "C:/Users/pmeza/.gemini/antigravity/brain/61aff9de-f4ed-4447-9b33-fedf3e5e2f80/uploaded_media_1_1769727073230.jpg";
const BACK_IMAGE = "C:/Users/pmeza/.gemini/antigravity/brain/61aff9de-f4ed-4447-9b33-fedf3e5e2f80/uploaded_media_0_1769727073230.jpg";

async function runTest() {
    console.log("Starting Diagnostic Test...");
    if (!GEMINI_API_KEY) {
        console.error("GEMINI_API_KEY not found in .env");
        return;
    }

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    // Explicitly using the most stable model identifier
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
    Analiza este documento de vehículo (Chile). Responde SIEMPRE en JSON puro.
    {
       "type": "PADRON",
       "metadata": {
          "patente": "...",
          "issueDate": "YYYY-MM-DD",
          "ownerName": "...",
          "rut": "...",
          "brand": "...",
          "model": "...",
          "year": "...",
          "vin": "..."
       }
    }
    `;

    async function processImage(filePath) {
        console.log(`Processing: ${path.basename(filePath)}...`);
        try {
            const imageData = fs.readFileSync(filePath);
            const imagePart = {
                inlineData: {
                    data: imageData.toString("base64"),
                    mimeType: "image/jpeg"
                }
            };
            const result = await model.generateContent([prompt, imagePart]);
            const response = await result.response;
            console.log(`SUCCESS for ${path.basename(filePath)}:`);
            console.log(response.text());
        } catch (e) {
            console.error(`FAILED for ${path.basename(filePath)}:`);
            console.error(e.message);
            if (e.status) console.error(`Status: ${e.status}`);
        }
    }

    await processImage(FRONT_IMAGE);
    await processImage(BACK_IMAGE);
}

runTest();
