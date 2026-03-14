const logger = require('../utils/logger');

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
            const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
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

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error?.message || data.error || `HF API Error: ${response.status}`);
            }

            return data.choices?.[0]?.message?.content || data.generated_text;
        } catch (error) {
            console.error('HuggingFace Service Error:', error);
            throw error;
        }
    }

    /**
     * Chat using extracted text from a file
     */
    async chatWithFile(userMessage, extractedText, fileName, fileType, history = []) {
        const isNoTextFound = extractedText.includes("[SYSTEM_NOTICE: NO_TEXT_FOUND]");

        const systemPrompt = `You are KodBank's Specialized AI Assistant. A user has uploaded a ${fileType} file named "${fileName}".
    
${isNoTextFound ? "NOTICE: This file appears to be scanned or image-based. I have provided a visual description/OCR of the first page instead." : "EXTRACTED CONTENT FROM FILE:"}
---
${extractedText.substring(0, 15000)}
---

Use the extracted content above to answer the user's question. If the content isn't relevant to their question, mention it, but still try to be helpful based on the file content.`;

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
        try {
            const messages = [
                {
                    role: "user",
                    content: [
                        { type: "text", text: "Describe this image in detail. Extract any important text, names, dates, or numbers you see." },
                        { type: "image_url", image_url: { url: base64Data } }
                    ]
                }
            ];

            return this.chat(messages, this.visionModel);
        } catch (error) {
            console.error('Vision API Error:', error);
            return `[Vision Error: ${error.message}]`;
        }
    }
}

module.exports = new HuggingFaceService();
