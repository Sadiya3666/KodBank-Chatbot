# Chatbot File Upload Testing Guide

This guide explains how to test the new file upload features in the KodBank Chatbot.

## 1. Prerequisites
Ensure both servers are running:
- **Backend (Port 5001)**: `cd backend && npm run dev`
- **Frontend (Port 3001)**: `cd frontend && npm start`

## 2. Testing Scenarios

### A. PDF Analysis
1. Open the Chatbot.
2. Click the 📎 icon.
3. Select a **PDF** file (e.g., a bank statement or a tutorial).
4. Type "Summarize this PDF" and send.
5. **Expected**: The AI should respond with a summary of the PDF content.

### B. Image OCR (Text from Image)
1. Click the 📷 icon.
2. Select an image containing text (like a screenshot of a transaction).
3. Type "What does this text say?" or "Explain this screenshot".
4. **Expected**: The backend will use Tesseract.js to extract text, and the AI will analyze it.

### C. Word document (.docx)
1. Upload a **.docx** file using the 📎 icon.
2. Type "Tell me about this document".
3. **Expected**: The AI should explain the content extracted by Mammoth.

### D. Excel Data Analysis
1. Upload an **.xlsx** file using the 📎 icon.
2. Ask "What is the total balance in this sheet?" or "Analyze these numbers".
3. **Expected**: The AI will receive the data in a text format and perform analysis.

### E. Error Handling (File Size)
1. Try to upload a file larger than **10MB**.
2. **Expected**: The frontend should immediately block it and show "File size exceeds 10MB limit."

### F. Error Handling (Unsupported Type)
1. Rename a random file to `.zip` or `.exe` and try to upload it.
2. **Expected**: The file picker should filter these, but if bypassed, the backend will return an "Unsupported file type" error.

## 3. API Monitoring
You can monitor the requests in the **Browser DevTools (F12) -> Network Tab**:
- **Requests**: Look for calls to `POST /api/chatbot/message-with-file`.
- **Payload**: It should be `multipart/form-data` containing the `file` and `message` fields.
- **Response**: Should look like:
```json
{
  "success": true,
  "reply": "The AI response text...",
  "extractedPreview": "Snippet of text found in file..."
}
```
