const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function testSimple() {
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
    try {
        console.log("Trying gemini-1.5-flash without schema...");
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent("Hola");
        console.log("Success:", result.response.text());
    } catch (error) {
        console.error("Failed:", error.message);
    }
}

testSimple();
