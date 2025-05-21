import express from 'express';
import cors from 'cors';
import multer from 'multer';
import mammoth from 'mammoth';
import dotenv from 'dotenv';
import { createRequire } from 'module';
import Groq from 'groq-sdk';
import fs from 'fs'; // Import file system module
import path from 'path'; // Import path module
import { fileURLToPath } from 'url'; // For __dirname equivalent in ES Modules

// Get __dirname equivalent in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure the uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

// Configure multer for disk storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir); // Files will be saved in the 'uploads' directory
    },
    filename: (req, file, cb) => {
        // Create a unique filename to prevent overwrites
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const fileExtension = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + fileExtension);
    }
});

const upload = multer({ storage: storage });



// Initialize the Groq client
const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

/**
 * Extracts text content from a PDF file located at a given path.
 * @param {string} filePath - The full path to the PDF file.
 * @returns {Promise<string>} - The extracted text.
 */
async function extractTextFromPDF(filePath) {
    try {
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdfParse(dataBuffer);
        return data.text;
    } catch (error) {
        console.error('Error extracting text from PDF:', error);
        throw new Error('Failed to parse PDF file.');
    }
}

/**
 * Extracts raw text content from a DOCX file located at a given path.
 * @param {string} filePath - The full path to the DOCX file.
 * @returns {Promise<string>} - The extracted text.
 */
async function extractTextFromDOCX(filePath) {
    try {
        const dataBuffer = fs.readFileSync(filePath);
        const result = await mammoth.extractRawText({ buffer: dataBuffer });
        return result.value;
    } catch (error) {
        console.error('Error extracting text from DOCX:', error);
        throw new Error('Failed to parse DOCX file.');
    }
}

/**
 * Scores a resume against a job description using the Groq API.
 * Returns a JSON object with score, good points, and bad points.
 * @param {string} resumeText - The extracted text from the resume.
 * @param {string} jobDescription - The job description text.
 * @returns {Promise<object>} - An object containing score, goodPoints, and badPoints.
 */
async function scoreResume(resumeText, jobDescription) {
    const prompt = `You are a helpful assistant that scores resumes against a job description. Your response MUST be ONLY a JSON object with the following keys: "score" (a number from 0-100), "goodPoints" (a string detailing strengths), and "badPoints" (a string detailing weaknesses). Do NOT include any other text or commentary outside the JSON.

Job Description:
${jobDescription}

Resume:
${resumeText}

JSON Response:`; // This prompt guides the model to output JSON

    if (!process.env.GROQ_API_KEY) {
        console.error('Groq API key is not set. Please set GROQ_API_KEY in your .env file.');
        return {
            score: 0,
            goodPoints: 'API key not configured.',
            badPoints: 'Cannot evaluate resume without a Groq API key.'
        };
    }

    try {
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                {
                    role: "user",
                    content: prompt,
                },
            ],
            model: "llama3-8b-8192", // You can choose other models like "mixtral-8x7b-32768" or "llama3-70b-8192"
            temperature: 0.5, // Controls randomness: lower values are more deterministic
            max_tokens: 500, // Max tokens for the model's response
        });

        const textResponse = chatCompletion.choices[0]?.message?.content.trim();
        console.log('Groq raw response:', textResponse);

        let parsedResult;
        try {
            // Attempt to parse JSON safely, even if there's surrounding text
            const jsonStart = textResponse.indexOf('{');
            const jsonEnd = textResponse.lastIndexOf('}');
            if (jsonStart === -1 || jsonEnd === -1) {
                throw new Error('JSON object not found in AI response.');
            }
            const jsonString = textResponse.substring(jsonStart, jsonEnd + 1);
            parsedResult = JSON.parse(jsonString);
        } catch (jsonError) {
            console.error('Failed to parse JSON from Groq response:', jsonError);
            console.error('Problematic response text:', textResponse);
            // Fallback if parsing fails, trying to extract common keys if possible
            const scoreMatch = textResponse.match(/"score":\s*(\d+)/);
            const goodPointsMatch = textResponse.match(/"goodPoints":\s*"(.*?)"/);
            const badPointsMatch = textResponse.match(/"badPoints":\s*"(.*?)"/);

            parsedResult = {
                score: scoreMatch ? parseInt(scoreMatch[1]) : 0,
                goodPoints: goodPointsMatch ? goodPointsMatch[1] : 'AI response format issue.',
                badPoints: badPointsMatch ? badPointsMatch[1] : 'AI response format issue.'
            };
        }

        // Validate the structure of the parsed result
        if (typeof parsedResult.score !== 'number' ||
            typeof parsedResult.goodPoints !== 'string' ||
            typeof parsedResult.badPoints !== 'string') {
            throw new Error('AI response did not return expected JSON structure.');
        }

        return parsedResult;
    } catch (error) {
        console.error('Groq API or processing error:', error);
        return {
            score: 0,
            goodPoints: 'An error occurred during evaluation.',
            badPoints: `Evaluation failed due to an internal error: ${error.message}. Please ensure your API key is valid and the model is accessible.`
        };
    }
}

// --- API Endpoint for Resume Analysis ---
app.post('/analyze', upload.array('resumes'), async (req, res) => {
    try {
        const jobDescription = req.body.jobDescription;
        if (!jobDescription) {
            return res.status(400).json({ error: 'Job description is required.' });
        }

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No resume files uploaded.' });
        }

        const results = await Promise.all(
            req.files.map(async (file) => {
                const fileExt = path.extname(file.originalname).toLowerCase();
                let resumeText = '';
                let analysis = {}; // Initialize analysis object

                try {
                    // Files are already saved to disk by multer
                    const filePath = file.path; // Get the temporary path where multer saved the file

                    if (fileExt === '.pdf') {
                        resumeText = await extractTextFromPDF(filePath);
                    } else if (fileExt === '.docx') {
                        resumeText = await extractTextFromDOCX(filePath);
                    } else {
                        // Delete unsupported file after processing
                        fs.unlinkSync(filePath);
                        return {
                            filename: file.originalname,
                            error: 'Unsupported file type. Only PDF and DOCX are allowed.',
                        };
                    }

                    analysis = await scoreResume(resumeText, jobDescription);

                    return {
                        filename: file.originalname,
                        savedFilename: path.basename(filePath), // Store the saved unique filename
                        ...analysis,
                    };
                } catch (fileProcessingError) {
                    console.error(`Error processing file ${file.originalname}:`, fileProcessingError);
                    // Ensure the file is deleted if processing fails
                    if (file.path && fs.existsSync(file.path)) {
                        fs.unlinkSync(file.path);
                    }
                    return {
                        filename: file.originalname,
                        error: `Failed to process: ${fileProcessingError.message}`,
                    };
                }
                // Important: Files will remain in 'uploads' after processing for potential download.
                // You'll need a separate cleanup mechanism (e.g., a scheduled task) for production.
            })
        );

        res.json(results);
    } catch (err) {
        console.error('Error in /analyze endpoint:', err);
        res.status(500).json({ error: 'Internal server error during analysis.' });
    }
});

// --- API Endpoint for Downloading Files ---
app.get('/download/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(uploadsDir, filename);

    // Basic security: prevent directory traversal
    if (!filename || filename.includes('..') || !fs.existsSync(filePath)) {
        return res.status(404).send('File not found.');
    }

    res.download(filePath, (err) => {
        if (err) {
            console.error('Error downloading file:', err);
            // If download fails (e.g., file doesn't exist, permissions), send error
            if (err.code === 'ENOENT') {
                return res.status(404).send('File not found on server.');
            }
            res.status(500).send('Could not download the file.');
        }
        // Optional: delete the file after download (use with caution in multi-user environments)
        // fs.unlink(filePath, (unlinkErr) => {
        //     if (unlinkErr) console.error('Error deleting file after download:', unlinkErr);
        // });
    });
});


// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
