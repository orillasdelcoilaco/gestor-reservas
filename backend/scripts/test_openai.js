require('dotenv').config();
const OpenAI = require('openai');

async function testOpenAI() {
    console.log('--- OpenAI Configuration Test ---');

    // 1. Check API Key presence
    if (!process.env.OPENAI_API_KEY) {
        console.error('❌ FATAL: OPENAI_API_KEY is missing in environment variables.');
        process.exit(1);
    }
    console.log('✅ OPENAI_API_KEY found (length: ' + process.env.OPENAI_API_KEY.length + ')');

    // 2. Test Connection and Quota
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    try {
        console.log('⏳ Testing simple completion with gpt-4o-mini...');
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: "Hello, confirm you are working." }],
        });
        console.log('✅ OpenAI Responded:', completion.choices[0].message.content);
    } catch (error) {
        console.error('❌ OpenAI Request Failed:', error.message);
        if (error.code) console.error('   Code:', error.code);
        if (error.type) console.error('   Type:', error.type);
    }
}

testOpenAI();
