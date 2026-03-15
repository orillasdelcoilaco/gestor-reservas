const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

async function listModels() {
    const key = process.env.GEMINI_API_KEY;
    const genAI = new GoogleGenerativeAI(key);
    try {
        // The SDK doesn't have a direct listModels but we can try to use a dummy model name to see error or just try common ones
        const models = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro-vision", "gemini-1.0-pro"];
        for (const m of models) {
            try {
                const model = genAI.getGenerativeModel({ model: m });
                await model.generateContent("test");
                console.log(`Model ${m} is AVAILABLE`);
            } catch (e) {
                console.log(`Model ${m} is NOT available: ${e.message}`);
            }
        }
    } catch (e) {
        console.error("List failed", e);
    }
}
listModels();
