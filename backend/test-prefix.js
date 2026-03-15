const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

async function test() {
    const key = process.env.GEMINI_API_KEY;
    const genAI = new GoogleGenerativeAI(key);
    try {
        const model = genAI.getGenerativeModel({ model: "models/gemini-1.5-flash" });
        const result = await model.generateContent("test");
        console.log("SUCCESS with models/ prefix");
    } catch (e) {
        console.log(`FAILED with models/ prefix: ${e.message}`);
    }
}
test();
