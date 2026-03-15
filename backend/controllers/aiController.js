const geminiService = require('../services/geminiService');

/**
 * Handle generic AI text generation request
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function handleAiRequest(req, res) {
    try {
        const { prompt } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: 'El campo "prompt" es requerido.' });
        }

        const text = await geminiService.generateText(prompt);
        res.json({ result: text });
    } catch (error) {
        console.error("Error en handleAiRequest:", error);
        res.status(500).json({ error: 'Error al procesar la solicitud de IA.' });
    }
}

module.exports = {
    handleAiRequest
};
