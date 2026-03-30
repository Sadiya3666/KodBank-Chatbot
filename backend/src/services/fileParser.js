const pdf = require('pdf-parse');
const PDFParser = require('pdf2json');
const mammoth = require('mammoth');
const xlsx = require('xlsx');
const Tesseract = require('tesseract.js');
const fs = require('fs');
const path = require('path');

/**
 * Service to parse different file types and extract text content
 */
class FileParser {
    /**
     * Parse PDF file using primary and secondary extractors
     * @param {string} filePath 
     * @returns {Promise<string>}
     */
    async parsePDF(filePath) {
        try {
            console.log(`[FileParser] Starting PDF parse for: ${path.basename(filePath)}`);
            const dataBuffer = fs.readFileSync(filePath);

            // Try primary parser (pdf-parse)
            console.log(`[FileParser] Attempting primary (pdf-parse)...`);
            let result = await pdf(dataBuffer);
            let text = result.text || "";
            console.log(`[FileParser] Primary text length: ${text.length}`);

            // If empty, try secondary parser (pdf2json)
            if (!text || text.trim().length < 20) {
                console.log("[FileParser] Primary PDF parser returned empty. Trying secondary parser...");
                text = await this.parseWithPDF2JSON(filePath);
                console.log(`[FileParser] Secondary text length: ${text.length}`);
            }

            // If still empty, it might be a scanned document. Attempt a basic OCR on the first page if possible.
            if (!text || text.trim().length < 10) {
                console.log("[FileParser] PDF appears to be scanned. Attempting basic OCR fallback...");
                try {
                    // Signal to HF service that we need visual/OCR fallback
                    text = "[SYSTEM_NOTICE: NO_TEXT_FOUND_IN_PARSE] This PDF has no digital text layer.";
                } catch (ocrErr) {
                    console.warn("[FileParser] OCR Fallback failed:", ocrErr.message);
                }
            }

            return text;
        } catch (error) {
            console.error('PDF parsing error:', error);
            throw new Error(`Failed to parse PDF: ${error.message}`);
        }
    }

    /**
     * Fallback parser using pdf2json
     */
    async parseWithPDF2JSON(filePath) {
        return new Promise((resolve) => {
            console.log(`[FileParser] Initializing PDF2JSON for fallback...`);
            const pdfParser = new PDFParser(this, 1);
            pdfParser.on("pdfParser_dataError", (err) => {
                console.error("PDF2JSON Error:", err);
                resolve("");
            });
            pdfParser.on("pdfParser_dataReady", (pdfData) => {
                console.log(`[FileParser] PDF2JSON extraction ready.`);
                let text = pdfParser.getRawTextContent();
                // Clean up boilerplate breaks
                text = text.replace(/-+Page \(\d+\) Break-+/g, '\n');
                resolve(text);
            });
            pdfParser.loadPDF(filePath);
        });
    }

    /**
     * Parse Word file (.docx)
     * @param {string} filePath 
     * @returns {Promise<string>}
     */
    async parseWord(filePath) {
        try {
            const result = await mammoth.extractRawText({ path: filePath });
            return result.value;
        } catch (error) {
            console.error('Word parsing error:', error);
            throw new Error(`Failed to parse Word document: ${error.message}`);
        }
    }

    /**
     * Parse Excel file (.xlsx, .xls)
     * @param {string} filePath 
     * @returns {Promise<string>}
     */
    async parseExcel(filePath) {
        try {
            const workbook = xlsx.readFile(filePath);
            let text = '';
            workbook.SheetNames.forEach(sheetName => {
                const worksheet = workbook.Sheets[sheetName];
                text += `Sheet: ${sheetName}\n`;
                text += xlsx.utils.sheet_to_txt(worksheet);
                text += '\n\n';
            });
            return text;
        } catch (error) {
            console.error('Excel parsing error:', error);
            throw new Error(`Failed to parse Excel file: ${error.message}`);
        }
    }

    /**
     * Parse Image using OCR
     * @param {string} filePath 
     * @returns {Promise<string>}
     */
    async parseImage(filePath) {
        try {
            const result = await Tesseract.recognize(
                filePath,
                'eng',
                { logger: m => console.log(m) }
            );
            return result.data.text;
        } catch (error) {
            console.error('OCR error:', error);
            throw new Error(`Failed to perform OCR on image: ${error.message}`);
        }
    }

    /**
     * Parse plain text file
     * @param {string} filePath 
     * @returns {Promise<string>}
     */
    async parseText(filePath) {
        try {
            return fs.readFileSync(filePath, 'utf8');
        } catch (error) {
            console.error('Text file read error:', error);
            throw new Error(`Failed to read text file: ${error.message}`);
        }
    }

    /**
     * Main entry point for parsing any supported file
     * @param {Object} file Multer file object
     * @returns {Promise<string>} Extracted text
     */
    async extractText(file) {
        const { path, mimetype, originalname } = file;
        const extension = originalname.split('.').pop().toLowerCase();

        if (mimetype === 'application/pdf' || extension === 'pdf') {
            return this.parsePDF(path);
        } else if (mimetype.includes('wordprocessingml') || extension === 'docx') {
            return this.parseWord(path);
        } else if (mimetype.includes('spreadsheetml') || extension === 'xlsx' || extension === 'xls') {
            return this.parseExcel(path);
        } else if (mimetype.startsWith('image/')) {
            return this.parseImage(path);
        } else if (mimetype === 'text/plain' || extension === 'txt') {
            return this.parseText(path);
        } else {
            throw new Error(`Unsupported file type: ${mimetype}`);
        }
    }
}

module.exports = new FileParser();
