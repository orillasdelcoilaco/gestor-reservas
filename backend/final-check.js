const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

async function test() {
    const key = process.env.GEMINI_API_KEY;
    const genAI = new GoogleGenerativeAI(key);

    // Most likely identifiers for current SDK
    const models = [
        "gemini-1.5-flash",
        "gemini-1.0-pro",
        "gemini-pro"
    ];

    for (const m of models) {
        try {
            console.log(`Testing: ${m}...`);
            const model = genAI.getGenerativeModel({ model: m });
            const result = await model.generateContent("Say OK");
            const response = await result.response;
            console.log(`SUCCESS with ${m}: ${response.text()}`);
        } catch (e) {
            console.log(`FAILED with ${m}: ${e.message} (Status: ${e.status})`);
        }
    }
}
test();
