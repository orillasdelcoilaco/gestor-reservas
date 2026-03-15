const OpenAI = require("openai");
const fs = require('fs');
require('dotenv').config();

const apiKey = process.env.OPENAI_API_KEY;
const frontPath = "C:/Users/pmeza/.gemini/antigravity/brain/61aff9de-f4ed-4447-9b33-fedf3e5e2f80/uploaded_media_1_1769727073230.jpg";
const backPath = "C:/Users/pmeza/.gemini/antigravity/brain/61aff9de-f4ed-4447-9b33-fedf3e5e2f80/uploaded_media_0_1769727073230.jpg";

async function testExtraction(filePath, side) {
    console.log(`\n--- Testing ${side} ---`);
    if (!apiKey) {
        console.error("No OPENAI_API_KEY found in .env");
        return;
    }

    const openai = new OpenAI({ apiKey });
    const buffer = fs.readFileSync(filePath);
    const base64Image = buffer.toString("base64");

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: "Analiza este documento de vehículo (Chile). Responde SOLO en JSON puro siguiendo esta estructura: { type: 'PADRON', hasMultipleCopies: boolean, mainCopyBox: [ymin, xmin, ymax, xmax], suggestedRotation: 0, metadata: { patente, issueDate (YYYY-MM-DD), ownerName, rut, color, marca, modelo, anio, engineNum, chassisNum, vin }, raw_text: string }" },
                        {
                            type: "image_url",
                            image_url: { url: `data:image/jpeg;base64,${base64Image}` }
                        }
                    ]
                }
            ],
            response_format: { type: "json_object" }
        });

        console.log(`SUCCESS for ${side}:`);
        console.log(response.choices[0].message.content);
    } catch (error) {
        console.error(`FAILED for ${side}:`, error.message);
        if (error.response) console.error(JSON.stringify(error.response.data, null, 2));
    }
}

async function run() {
    await testExtraction(frontPath, "FRONT");
    await testExtraction(backPath, "BACK");
}

run();
