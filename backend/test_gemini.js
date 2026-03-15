const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

async function test() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("No API key found");
        return;
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    try {
        console.log("Listing available models...");
        // In @google/generative-ai, you might need to use a different way to list models
        // depending on the version. Usually it's not directly on genAI.
        // Let's try to just guess a few common ones or check docs.

        const models = ["gemini-1.5-flash", "gemini-2.0-flash", "gemini-2.0-flash-exp", "gemini-pro-vision", "gemini-2.5-flash"];
        for (const m of models) {
            try {
                const model = genAI.getGenerativeModel({ model: m });
                const result = await model.generateContent("test");
                console.log(`Model ${m} is working!`);
            } catch (e) {
                console.log(`Model ${m} failed: ${e.status || e.message}`);
            }
        }
    } catch (e) {
        console.error("Error listing models:", e);
    }
}

test();
