const OpenAI = require("openai");
const fs = require('fs');
require('dotenv').config();

const apiKey = process.env.OPENAI_API_KEY;
const filePath = "C:/Users/pmeza/.gemini/antigravity/brain/61aff9de-f4ed-4447-9b33-fedf3e5e2f80/uploaded_media_1_1769727073230.jpg";

async function run() {
    const openai = new OpenAI({ apiKey });
    const buffer = fs.readFileSync(filePath);
    const base64Image = buffer.toString("base64");
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{
                role: "user",
                content: [
                    { type: "text", text: "Test. Respond with JSON {ok: true}" },
                    { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
                ]
            }],
            response_format: { type: "json_object" }
        });
        console.log("OK:", response.choices[0].message.content);
    } catch (e) {
        console.error("ERROR_MSG:", e.message);
        if (e.response) console.error("BODY:", JSON.stringify(e.response.data));
    }
}
run();
