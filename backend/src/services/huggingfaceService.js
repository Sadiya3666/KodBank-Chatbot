const logger = require('../utils/logger');
const Tesseract = require('tesseract.js');

/**
 * Service to interact with Hugging Face API via Cerebras provider (free tier, confirmed working)
 */
class HuggingFaceService {
    constructor() {
        this.token = (process.env.HF_TOKEN || '').trim();
        this.routerUrl = 'https://router.huggingface.co/v1/chat/completions';

        // Confirmed working (FREE) via Cerebras provider on HF router
        this.chatConfigs = [
            { provider: 'cerebras', model: 'meta-llama/Llama-3.1-8B-Instruct' },
            { provider: 'cerebras', model: 'meta-llama/Llama-3.3-70B-Instruct' },
            { provider: 'featherless-ai', model: 'meta-llama/Meta-Llama-3.1-8B-Instruct' },
        ];

        // Vision model config (cerebras doesn't support vision, use novita)
        this.visionModel = 'meta-llama/Llama-3.2-11B-Vision-Instruct';
        this.visionProvider = 'novita';
    }

    /**
     * Generic chat completion — tries all providers in order until one succeeds
     */
    async chat(messages, forceModel = null, forceProvider = null) {
        if (!this.token) {
            throw new Error('HF_TOKEN is not configured. Please set it in your environment variables on Render.');
        }

        // If a specific model/provider is forced (e.g. for vision), try only that
        const configs = (forceModel && forceProvider)
            ? [{ model: forceModel, provider: forceProvider }]
            : this.chatConfigs;

        let lastError = null;

        for (const { model, provider } of configs) {
            try {
                console.log(`[HF Service] Trying provider=${provider} model=${model}`);
                const response = await fetch(this.routerUrl, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        provider,
                        model,
                        messages,
                        max_tokens: 1000,
                        temperature: 0.7
                    })
                });

                const data = await response.json();

                if (!response.ok) {
                    const errorMsg = data.error?.message || data.error || `HTTP ${response.status}`;
                    console.warn(`[HF Service] ${provider}/${model} failed: ${errorMsg}`);
                    lastError = new Error(`AI API error (${provider}/${model.split('/')[1]}): ${errorMsg}`);
                    // Stop retrying on auth errors
                    if (response.status === 401 || response.status === 403) {
                        throw lastError;
                    }
                    continue; // try next config
                }

                const reply = data.choices?.[0]?.message?.content;
                if (!reply) throw new Error('Empty response from AI model.');

                console.log(`[HF Service] Success via ${provider}/${model.split('/')[1]}`);
                return reply;

            } catch (err) {
                lastError = err;
                // Stop on auth errors — won't work with any provider
                if (err.message.includes('401') || err.message.includes('403') || err.message.includes('Unauthorized')) {
                    console.error(`[HF Service] Auth error — check your HF_TOKEN on Render.`);
                    throw err;
                }
                console.warn(`[HF Service] Provider ${provider} error: ${err.message}. Trying next...`);
            }
        }

        throw lastError || new Error('All AI providers failed. Please try again later.');
    }

    /**
     * Chat using extracted text from a file
     */
    async chatWithFile(userMessage, extractedText, fileName, fileType, history = [], thumbnail = null) {
        let isNoTextFound = extractedText.includes('[SYSTEM_NOTICE: NO_TEXT_FOUND_IN_PARSE]');

        // Check if text is mostly boilerplate (like just page breaks from pdf2json)
        const isBoilerplate = !isNoTextFound && extractedText.length < 2000 &&
                            (extractedText.includes('Page (0) Break') || extractedText.match(/-+Page \(\d+\) Break-+/g)?.length > 5);

        console.log(`[HF Service] Chatting with file: ${fileName}, Extracted length: ${extractedText.length}, Boilerplate: ${isBoilerplate}`);

        let visualDescription = '';
        let ocrText = '';

        if ((isNoTextFound || isBoilerplate) && thumbnail) {
            console.log(`[HF Service] Text extraction failed or yielded boilerplate. Using OCR and Visual fallbacks for ${fileName}...`);

            // 1. Try OCR first
            try {
                ocrText = await this.performOCR(thumbnail);
                if (ocrText) {
                    extractedText = `[OCR_TEXT_EXTRACTION_FROM_FIRST_PAGE]:\n${ocrText}\n\n${extractedText}`;
                    isNoTextFound = false;
                }
            } catch (ocrErr) {
                console.warn(`[HF Service] OCR failed: ${ocrErr.message}`);
            }

            // 2. Try Visual Description
            try {
                visualDescription = await this.describeImage(thumbnail);
                extractedText = `[VISUAL_DESCRIPTION]:\n${visualDescription}\n\n${extractedText}`;
                isNoTextFound = false;
            } catch (visionErr) {
                console.warn(`[HF Service] Vision fallback failed: ${visionErr.message}`);
                if (isNoTextFound) {
                    extractedText += '\n[SYSTEM_NOTICE: ALL_ANALYSIS_FAILED] Could not read document text or visuals.';
                }
            }
        }

        const systemPrompt = `You are KodBank's Specialized AI Assistant. A user has uploaded a ${fileType} file named "${fileName}".

${isNoTextFound ? '⚠️ NOTICE: Text extraction failed.' : '📄 DOCUMENT CONTENT:'}
---
${extractedText.substring(0, 20000)}
---

USER REQUEST: "${userMessage || 'Please help me understand this document.'}"

IMPORTANT RULES:
1. If text extraction contains [OCR_TEXT_EXTRACTION], treat it as the primary content from the document and provide a detailed analysis.
2. If there is a [VISUAL_DESCRIPTION] above, use it to bolster your understanding of the document's structure.
3. Provide a professional, banking-grade summary. If it's a module, break down the key concepts.
4. NEVER say you cannot read the document if there is any text or visual description provided in the CONTENT section above.
5. Maintain a proactive and helpful tone.`;

        const messages = [
            { role: 'system', content: systemPrompt },
            ...history.slice(-10),
            { role: 'user', content: userMessage || `Please explain the contents of ${fileName}` }
        ];

        return this.chat(messages);
    }

    /**
     * Analyze an image using Vision model
     */
    async describeImage(base64Data) {
        try {
            console.log(`[HF Service] Analyzing image with vision model: ${this.visionModel}`);
            const messages = [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: 'Describe this image in detail. Extract any important text, names, dates, or numbers you see.' },
                        { type: 'image_url', image_url: { url: base64Data } }
                    ]
                }
            ];

            return await this.chat(messages, this.visionModel, this.visionProvider);
        } catch (error) {
            console.warn(`[HF Service] Vision model failed: ${error.message}`);

            // Fallback to BLIP captioning
            const fallbackModel = 'Salesforce/blip-image-captioning-large';
            console.log(`[HF Service] Attempting BLIP fallback: ${fallbackModel}`);
            try {
                const response = await fetch(`https://api-inference.huggingface.co/models/${fallbackModel}`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        inputs: base64Data.replace(/^data:image\/\w+;base64,/, '')
                    })
                });

                const data = await response.json();
                if (Array.isArray(data) && data[0]?.generated_text) {
                    return `[FALLBACK_DESCRIPTION]: ${data[0].generated_text}`;
                }
                throw new Error(data.error || 'Unknown BLIP error');
            } catch (fallbackErr) {
                console.error('[HF Service] All vision models failed:', fallbackErr);
                return '[Vision Error: Document text could not be extracted or analyzed visually.]';
            }
        }
    }

    /**
     * Perform local OCR on an image
     */
    async performOCR(base64Data) {
        try {
            console.log(`[HF Service] Running local Tesseract OCR...`);
            const imageBuffer = Buffer.from(base64Data.replace(/^data:image\/\w+;base64,/, ''), 'base64');
            const { data: { text } } = await Tesseract.recognize(imageBuffer, 'eng');
            console.log(`[HF Service] OCR completed. Extracted ${text.length} chars.`);
            return text;
        } catch (error) {
            console.error('OCR Error:', error);
            throw error;
        }
    }
}

module.exports = new HuggingFaceService();
