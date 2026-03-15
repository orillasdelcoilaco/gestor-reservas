const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

async function test() {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
        console.error("No API Key found");
        return;
    }
    const genAI = new GoogleGenerativeAI(key);

    const models = ["gemini-1.5-flash", "gemini-1.5-flash-latest", "gemini-2.0-flash-exp"];

    for (const modelName of models) {
        try {
            console.log(`Testing model: ${modelName}...`);
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent("Respond with 'OK'");
            const response = await result.response;
            console.log(`Model ${modelName} works: ${response.text()}`);
            return; // Stop at first working model
        } catch (e) {
            console.error(`Model ${modelName} failed: ${e.message}`);
        }
    }
}

test();
