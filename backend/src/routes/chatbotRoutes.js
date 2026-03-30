const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const chatbotController = require('../controllers/chatbotController');

// Configure Multer for temp storage - /tmp is required for Vercel/Serverless
const uploadDir = process.env.VERCEL ? '/tmp' : 'uploads/';
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { 
        fileSize: 50 * 1024 * 1024, // 50MB for the file
        fieldSize: 50 * 1024 * 1024  // 50MB for text fields like large thumbnail Base64
    }, 
    fileFilter: (req, file, cb) => {
        const allowedExtensions = ['.pdf', '.png', '.jpg', '.jpeg', '.docx', '.xlsx', '.xls', '.txt'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedExtensions.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error(`Unsupported file type: ${ext}`));
        }
    }
});

// Create uploads directory if it doesn't exist (only locally)
const fs = require('fs');
if (!process.env.VERCEL && !fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// Routes
router.post('/message', chatbotController.handleMessage);
router.post('/message-with-file', upload.single('file'), chatbotController.handleFileMessage);

module.exports = router;
