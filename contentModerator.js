const { OpenAI } = require('openai');
const fs = require('fs');

// Default ayarlar
const DEFAULT_SETTINGS = {
    checkText: true,
    checkImage: true,
    model: 'gemini-3-flash',
    strictness: 'normal'
};

function buildTextPrompt(strictness) {
    const strict = strictness === 'strict';
    const lenient = strictness === 'lenient';

    const base = `You are a content moderator for "Iyilik Kumbarasi" (Kindness Jar), a children's wishing event. Only kind, positive content is allowed.`;

    const rules = strict
        ? `REJECT if the text contains ANY of the following:
- Profanity, swear words, insults (Turkish or English)
- Sexual content, violence, hate speech
- Spam or meaningless characters (aaaa, 1234, !!!! etc.)
- Personal info (phone number, address)
- NEGATIVE WISHES or CURSES: "may X fail/die/suffer/go bankrupt", "I hate X", anything wishing harm or misfortune
- Complaints, anger, frustration about companies, people, or situations
- Sarcasm or passive-aggressive negative sentiments
- Anything that is NOT a positive, kind wish or a child's name

ALLOW only if:
- A genuine kind, positive wish (e.g. "herkese saglik", "dunyada baris olsun")
- A simple child name
- Clearly wholesome content`
        : lenient
        ? `REJECT ONLY if the text contains EXPLICIT:
- Obvious profanity or swear words
- Sexual content
- Direct violence threats
- Clear spam (aaaa, 1234...)

ALLOW everything else including mildly negative comments or complaints.`
        : `REJECT if the text contains ANY of the following:
- Profanity, swear words, insults (Turkish or English)
- Sexual content, violence, hate speech
- Spam or meaningless characters (aaaa, 1234, !!!! etc.)
- Personal info (phone number, address)
- NEGATIVE WISHES or CURSES: "may X fail/die/suffer/go bankrupt", "I hate X", anything wishing harm or misfortune on anyone/anything (e.g. "Turk Telekom iflas etsin", "ogretmenim berbat")
- Complaints, anger, or frustration about companies or people

ALLOW only if:
- A genuine kind, positive, or neutral wish
- A simple child name or harmless word
- Wholesome and appropriate for a public children's event`;

    return `${base}\n\n${rules}\n\nReply with ONLY ONE WORD: ALLOW or REJECT`;
}

function buildImagePrompt(strictness) {
    const strict = strictness === 'strict';
    const lenient = strictness === 'lenient';

    const base = `You are a content moderator for "Iyilik Kumbarasi" (Kindness Jar), a children's wishing event. Only kind, positive content is allowed.

Analyze the photo by checking BOTH:
1. VISUAL CONTENT of the image
2. ANY TEXT IN THE IMAGE: read ALL handwritten, printed, or typed text visible in the photo`;

    const rules = strict
        ? `REJECT if EITHER:
- Visual: nudity, sexual content, violence, hate symbols, personal documents (ID, credit card)
- Text: profanity, insults, negative wishes, complaints, inappropriate language in any language

ALLOW only if image and any text are genuinely kind and child-appropriate.`
        : lenient
        ? `REJECT ONLY if:
- Visual: explicit nudity or sexual content
- Text: obvious profanity or direct threats

ALLOW everything else.`
        : `REJECT if EITHER the visual content OR any written text is inappropriate or negative.
- Visual: nudity, sexual content, extreme violence, hate symbols, personal documents
- Text: profanity, sexual language, insults, negative wishes (X iflas etsin, I hate X)

ALLOW if both image and visible text are clean, positive, and child-appropriate.`;

    return `${base}\n\n${rules}\n\nReply with ONLY ONE WORD: ALLOW or REJECT`;
}

/**
 * Metni moderasyondan geçirir
 * @param {string} text
 * @param {object} settings
 */
async function moderateText(text, settings = {}) {
    const { model, strictness } = { ...DEFAULT_SETTINGS, ...settings };

    const client = new OpenAI({
        baseURL: process.env.ANTIGRAVITY_BASE_URL || 'https://antigravity.mindops.net/v1',
        apiKey: process.env.ANTIGRAVITY_API_KEY || 'sk-antigravity-lejyon-2026',
        timeout: 60000,
    });

    try {
        const response = await client.chat.completions.create({
            model,
            messages: [
                { role: 'system', content: buildTextPrompt(strictness) },
                { role: 'user', content: `Moderate this text: "${text}"` }
            ],
            temperature: 0,
        });

        const raw = response.choices[0].message.content.trim().toUpperCase();
        console.log(`   📝 Metin AI (${strictness}): "${raw}"`);

        const allowed = !raw.includes('REJECT');
        return { allowed, reason: allowed ? 'İçerik uygun' : 'Uygunsuz veya olumsuz içerik tespit edildi' };

    } catch (error) {
        console.error('⚠️ Moderasyon API hatası:', error.message);
        return { allowed: true, reason: 'Servis hatası - geçiriliyor' };
    }
}

/**
 * Görseli moderasyondan geçirir
 * @param {string} filePath
 * @param {object} settings
 */
async function moderateImage(filePath, settings = {}) {
    const { model, strictness } = { ...DEFAULT_SETTINGS, ...settings };

    const client = new OpenAI({
        baseURL: process.env.ANTIGRAVITY_BASE_URL || 'https://antigravity.mindops.net/v1',
        apiKey: process.env.ANTIGRAVITY_API_KEY || 'sk-antigravity-lejyon-2026',
        timeout: 60000,
    });

    try {
        const imageBuffer = fs.readFileSync(filePath);
        const base64Image = imageBuffer.toString('base64');
        const ext = filePath.split('.').pop().toLowerCase();
        const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';

        const response = await client.chat.completions.create({
            model,
            messages: [
                { role: 'system', content: buildImagePrompt(strictness) },
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: 'Moderate this image and read any text written in it:' },
                        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}` } }
                    ]
                }
            ],
            temperature: 0,
        });

        const raw = response.choices[0].message.content.trim().toUpperCase();
        console.log(`   🖼️  Görsel AI (${strictness}): "${raw}"`);

        const allowed = !raw.includes('REJECT');
        return { allowed, reason: allowed ? 'Görsel uygun' : 'Uygunsuz veya olumsuz görsel/yazı tespit edildi' };

    } catch (error) {
        console.error('⚠️ Görsel moderasyon API hatası:', error.message);
        return { allowed: true, reason: 'Servis hatası - geçiriliyor' };
    }
}

/**
 * Ana moderasyon fonksiyonu
 * @param {string} name
 * @param {string} filePath
 * @param {object} settings
 */
async function moderate(name, filePath, settings = {}) {
    const s = { ...DEFAULT_SETTINGS, ...settings };
    console.log(`🔍 Moderasyon: "${name}" | model:${s.model} | hassasiyet:${s.strictness} | metin:${s.checkText} | görsel:${s.checkImage}`);

    const tasks = [];
    if (s.checkText) tasks.push(moderateText(name, s));
    else tasks.push(Promise.resolve({ allowed: true, reason: 'Metin kontrolü kapalı' }));

    if (s.checkImage && filePath) tasks.push(moderateImage(filePath, s));
    else tasks.push(Promise.resolve({ allowed: true, reason: 'Görsel kontrolü kapalı' }));

    const [textResult, imageResult] = await Promise.all(tasks);

    console.log(`📝 Metin: ${textResult.allowed ? '✅' : '❌'} ${textResult.reason}`);
    console.log(`🖼️  Görsel: ${imageResult.allowed ? '✅' : '❌'} ${imageResult.reason}`);

    if (!textResult.allowed) return { allowed: false, reason: `İsim/metin uygunsuz: ${textResult.reason}` };
    if (!imageResult.allowed) return { allowed: false, reason: `Görsel uygunsuz: ${imageResult.reason}` };

    return { allowed: true, reason: 'İçerik onaylandı' };
}

module.exports = { moderate, moderateText, moderateImage };
