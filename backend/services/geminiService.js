const { GoogleGenerativeAI } = require("@google/generative-ai");

// Initialize Gemini with API Key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Select model (can be configured)
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

/**
 * Generate text from a prompt using Gemini
 * @param {string} prompt - The input text for the AI
 * @returns {Promise<string>} - The generated response text
 */
async function generateText(prompt) {
    try {
        if (!process.env.GEMINI_API_KEY) {
            throw new Error("GEMINI_API_KEY no está configurada en .env");
        }

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        return text;
    } catch (error) {
        console.error("Error al generar texto con Gemini:", error);
        throw error;
    }
}

module.exports = {
    generateText
};
