const fileParser = require('../services/fileParser');
const huggingfaceService = require('../services/huggingfaceService');
const fs = require('fs');
const path = require('path');

/**
 * Controller for chatbot interactions
 */
class ChatbotController {
    /**
     * Handle text-only messages
     */
    handleMessage = async (req, res) => {
        try {
            const { message, history } = req.body;

            if (!message) {
                return res.status(400).json({ success: false, message: 'Message is required' });
            }

            const messages = [
                { role: "system", content: "You are KodBank's helpful AI Assistant." },
                ...(history || []),
                { role: "user", content: message }
            ];

            const reply = await huggingfaceService.chat(messages);
            res.json({ success: true, reply });
        } catch (error) {
            console.error('Chatbot Controller Error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    /**
     * Handle file uploads and chat
     */
    handleFileMessage = async (req, res) => {
        try {
            const { message, history } = req.body;
            const file = req.file;

            if (!file) {
                return res.status(400).json({ success: false, message: 'No file uploaded' });
            }

            console.log(`[Chatbot] Processing file: ${file.originalname} (${file.mimetype})`);

            // 1. Extract text from file
            let extractedText = "";
            try {
                extractedText = await fileParser.extractText(file);
            } catch (parseErr) {
                console.error('File parsing error:', parseErr);
                // Clean up file if parsing fails safely
                if (file) this._cleanupFile(file.path);
                return res.status(422).json({ success: false, message: `Could not read file: ${parseErr.message}` });
            }

            // 2. Chat with HF service using extracted text (and thumbnail for visual fallback)
            const reply = await huggingfaceService.chatWithFile(
                message,
                extractedText,
                file.originalname,
                file.mimetype,
                history ? JSON.parse(history) : [],
                req.body.thumbnail // Pass thumbnail for visual fallback
            );

            // 3. Clean up temp file safely
            this._cleanupFile(file.path);

            res.json({
                success: true,
                reply,
                extractedPreview: extractedText.substring(0, 500) + (extractedText.length > 500 ? "..." : "")
            });
        } catch (error) {
            console.error('Chatbot Controller File Error:', error);
            // Clean up temp file on error safely
            if (req.file) this._cleanupFile(req.file.path);
            
            res.status(500).json({ 
                success: false, 
                message: error.message || 'AI processing failed',
                errorType: error.name
            });
        }
    }

    /**
     * Safely delete a file without crashing the server if it's busy
     */
    _cleanupFile = (filePath) => {
        if (!filePath || !fs.existsSync(filePath)) return;
        
        // Use a small delay for Windows to release handles
        setTimeout(() => {
            try {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                    console.log(`[Chatbot] Cleaned up file: ${path.basename(filePath)}`);
                }
            } catch (err) {
                console.warn(`[Chatbot] Non-critical: Could not delete temp file ${filePath}: ${err.message}`);
            }
        }, 1000);
    }
}

module.exports = new ChatbotController();
