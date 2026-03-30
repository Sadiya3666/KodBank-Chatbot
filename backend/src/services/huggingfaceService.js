const logger = require('../utils/logger');
const Tesseract = require('tesseract.js');

/**
 * Service to interact with Hugging Face API
 */
class HuggingFaceService {
    constructor() {
        this.token = (process.env.HF_TOKEN || 'your_huggingface_token_here').trim();
        this.defaultModel = "meta-llama/Llama-3.3-70B-Instruct";
        this.visionModel = "meta-llama/Llama-3.2-11B-Vision-Instruct";
    }

    /**
     * Generic chat completion
     */
    async chat(messages, model = this.defaultModel) {
        try {
            console.log(`[HF Service] Requesting completion from model: ${model}`);
            
            // Try the router first (standard)
            const routerUrl = 'https://router.huggingface.co/v1/chat/completions';
            const directUrl = `https://api-inference.huggingface.co/v1/chat/completions`; // Direct fallback
            
            let response = await fetch(routerUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: model,
                    messages: messages,
                    max_tokens: 1000,
                    temperature: 0.7
                })
            });

            // If router fails, try direct API (sometimes router is flaky)
            if (response.status === 404 || response.status === 502) {
                console.warn(`[HF Service] Router returned ${response.status}. Trying direct Inference API...`);
                response = await fetch(directUrl, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: model,
                        messages: messages,
                        max_tokens: 1000
                    })
                });
            }

            const data = await response.json();
            
            if (!response.ok) {
                const errorMsg = data.error?.message || data.error || `Status ${response.status}`;
                console.error(`[HF Service] API Error Details:`, JSON.stringify(data));
                throw new Error(`Hugging Face API error (${model}): ${errorMsg}`);
            }

            return data.choices?.[0]?.message?.content || data.generated_text;
        } catch (error) {
            console.error('HuggingFace Service Detail Error:', error);
            throw error;
        }
    }

    /**
     * Chat using extracted text from a file
     */
    async chatWithFile(userMessage, extractedText, fileName, fileType, history = [], thumbnail = null) {
        let isNoTextFound = extractedText.includes("[SYSTEM_NOTICE: NO_TEXT_FOUND_IN_PARSE]");
        
        // Check if text is mostly boilerplate (like just page breaks from pdf2json)
        const isBoilerplate = !isNoTextFound && extractedText.length < 2000 && 
                            (extractedText.includes("Page (0) Break") || extractedText.match(/-+Page \(\d+\) Break-+/g)?.length > 5);

        console.log(`[HF Service] Chatting with file: ${fileName}, Extracted length: ${extractedText.length}, Boilerplate: ${isBoilerplate}`);

        let visualDescription = "";
        let ocrText = "";

        if ((isNoTextFound || isBoilerplate) && thumbnail) {
            console.log(`[HF Service] Text extraction failed or yielded boilerplate. Using OCR and Visual fallbacks for ${fileName}...`);
            
            // 1. Try OCR first for "Extractions"
            try {
                ocrText = await this.performOCR(thumbnail);
                if (ocrText) {
                    extractedText = `[OCR_TEXT_EXTRACTION_FROM_FIRST_PAGE]:\n${ocrText}\n\n${extractedText}`;
                    isNoTextFound = false; // We have text now!
                }
            } catch (ocrErr) {
                console.warn(`[HF Service] OCR failed: ${ocrErr.message}`);
            }

            // 2. Try Visual Description for general context
            try {
                visualDescription = await this.describeImage(thumbnail);
                extractedText = `[VISUAL_DESCRIPTION]:\n${visualDescription}\n\n${extractedText}`;
                isNoTextFound = false; 
            } catch (visionErr) {
                console.warn(`[HF Service] Vision fallback failed: ${visionErr.message}`);
                if (isNoTextFound) {
                    extractedText += "\n[SYSTEM_NOTICE: ALL_ANALYSIS_FAILED] Could not read document text or visuals.";
                }
            }
        }

        const systemPrompt = `You are KodBank's Specialized AI Assistant. A user has uploaded a ${fileType} file named "${fileName}".
    
${isNoTextFound ? "⚠️ NOTICE: Text extraction failed." : "📄 DOCUMENT CONTENT:"}
---
${extractedText.substring(0, 20000)}
---

USER REQUEST: "${userMessage || "Please help me understand this document."}"

IMPORTANT RULES:
1. If text extraction contains [OCR_TEXT_EXTRACTION], treat it as the primary content from the document and provide a detailed analysis.
2. If there is a [VISUAL_DESCRIPTION] above, use it to bolster your understanding of the document's structure.
3. Provide a professional, banking-grade summary. If it's a module, break down the key concepts.
4. NEVER say you cannot read the document if there is any text or visual description provided in the CONTENT section above.
5. Maintain a proactive and helpful tone.`;

        const messages = [
            { role: "system", content: systemPrompt },
            ...history.slice(-10),
            { role: "user", content: userMessage || `Please explain the contents of ${fileName}` }
        ];

        return this.chat(messages);
    }

    /**
     * Analyze an image using Vision model
     * @param {string} base64Data Base64 string (including data prefix)
     * @returns {Promise<string>}
     */
    async describeImage(base64Data) {
        let currentModel = this.visionModel;
        try {
            console.log(`[HF Service] Analyzing image with model: ${currentModel}`);
            const messages = [
                {
                    role: "user",
                    content: [
                        { type: "text", text: "Describe this image in detail. Extract any important text, names, dates, or numbers you see." },
                        { type: "image_url", image_url: { url: base64Data } }
                    ]
                }
            ];

            return await this.chat(messages, currentModel);
        } catch (error) {
            console.warn(`[HF Service] Primary vision model (${currentModel}) failed: ${error.message}`);
            
            // Fallback to a simpler, highly available model
            const fallbackModel = "Salesforce/blip-image-captioning-large";
            console.log(`[HF Service] Attempting fallback with: ${fallbackModel}`);
            
            try {
                // BLIP model doesn't support chat messages format, use direct text prompt
                const response = await fetch(`https://api-inference.huggingface.co/models/${fallbackModel}`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        inputs: base64Data.replace(/^data:image\/\w+;base64,/, "")
                    })
                });

                const data = await response.json();
                if (Array.isArray(data) && data[0]?.generated_text) {
                    return `[FALLBACK_DESCRIPTION]: ${data[0].generated_text}`;
                }
                throw new Error(data.error || "Unknown fallback error");
            } catch (fallbackErr) {
                console.error('[HF Service] All vision models failed:', fallbackErr);
                return `[Vision Error: Document text could not be extracted or analyzed visually.]`;
            }
        }
    }
    /**
     * Perform local OCR on an image
     * @param {string} base64Data Base64 string
     * @returns {Promise<string>}
     */
    async performOCR(base64Data) {
        try {
            console.log(`[HF Service] Running local Tesseract OCR...`);
            // Clean base64 if needed
            const imageBuffer = Buffer.from(base64Data.replace(/^data:image\/\w+;base64,/, ""), 'base64');
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
