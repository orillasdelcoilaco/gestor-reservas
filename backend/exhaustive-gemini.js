const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

async function test() {
    const key = process.env.GEMINI_API_KEY;
    const genAI = new GoogleGenerativeAI(key);

    // Most likely identifiers
    const models = [
        "gemini-1.5-flash-8b",
        "gemini-1.5-flash",
        "gemini-1.5-pro",
        "gemini-1.0-pro-vision-latest"
    ];

    for (const m of models) {
        try {
            console.log(`Testing: ${m}...`);
            const model = genAI.getGenerativeModel({ model: m });
            const result = await model.generateContent("Respond 'OK'");
            const response = await result.response;
            console.log(`SUCCESS ${m}: ${response.text()}`);
            return;
        } catch (e) {
            console.log(`FAILED ${m}: ${e.message}`);
        }
    }
}
test();
