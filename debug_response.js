require('dotenv').config();
const { OpenAI } = require('openai');

const client = new OpenAI({
    baseURL: process.env.ANTIGRAVITY_BASE_URL,
    apiKey: process.env.ANTIGRAVITY_API_KEY,
    timeout: 60000,
});

async function debugResponse() {
    const response = await client.chat.completions.create({
        model: 'gemini-3-flash',
        messages: [
            {
                role: 'system',
                content: 'Reply only with JSON: {"allowed": true or false, "reason": "short explanation"}'
            },
            {
                role: 'user',
                content: 'Moderate this text: "siktir" (Turkish profanity)'
            }
        ],
        max_tokens: 200,
        temperature: 0.1,
    });

    const choice = response.choices[0];
    const raw = choice.message.content;
    console.log('finish_reason:', choice.finish_reason);
    console.log('usage:', JSON.stringify(response.usage));
    console.log('=== RAW (JSON.stringify) ===');
    console.log(JSON.stringify(raw));
    console.log('\n=== DISPLAY ===');
    console.log(raw);
}

debugResponse().catch(console.error);
