import express from 'express';
import cors from 'cors';
import multer from 'multer';
import mammoth from 'mammoth'; // For .docx files
import dotenv from 'dotenv'; // For environment variables
import { createRequire } from 'module'; // To use require in ES Modules for pdf-parse
import Groq from 'groq-sdk'; // Groq AI SDK
import fs from 'fs'; // Node.js File System module
import path from 'path'; // Node.js Path module
import { fileURLToPath } from 'url'; // For __dirname equivalent in ES Modules

// --- Configuration and Setup ---

// Get __dirname equivalent in ES Modules for consistent path handling
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize require for modules that are not yet pure ES Modules (like pdf-parse)
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse'); // For .pdf files

// Load environment variables from .env file (e.g., GROQ_API_KEY)
dotenv.config();

// Initialize Express application
const app = express();
const port = process.env.PORT || 5000; // Use port from .env or default to 5000

// --- Middleware ---

// Enable Cross-Origin Resource Sharing for all origins (adjust for production)
app.use(cors());
// Parse JSON bodies for incoming requests
app.use(express.json());
// Parse URL-encoded bodies for incoming requests (e.g., from form submissions)
app.use(express.urlencoded({ extended: true }));

// --- File Uploads Configuration ---

// Define the directory for storing uploaded files
const uploadsDir = path.join(__dirname, 'uploads');
// Create the 'uploads' directory if it doesn't exist
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
    console.log(`'uploads' directory created at: ${uploadsDir}`);
}

// Configure multer for disk storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir); // Files will be saved in the 'uploads' directory
    },
    filename: (req, file, cb) => {
        // Create a unique filename to prevent overwrites and keep original extension
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const fileExtension = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + fileExtension);
    }
});

const upload = multer({ storage: storage });

// --- Groq API Initialization ---

// Initialize the Groq client with API key from environment variables
const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

// --- Helper Functions for Text Extraction ---

/**
 * Extracts text content from a PDF file located at a given path.
 * @param {string} filePath - The full path to the PDF file.
 * @returns {Promise<string>} - The extracted text.
 * @throws {Error} If the PDF parsing fails.
 */
async function extractTextFromPDF(filePath) {
    try {
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdfParse(dataBuffer);
        return data.text;
    } catch (error) {
        console.error(`[PDF Extraction Error] Failed to extract text from ${filePath}:`, error);
        throw new Error('Failed to parse PDF file. It might be corrupted or malformed.');
    }
}

/**
 * Extracts raw text content from a DOCX file located at a given path.
 * @param {string} filePath - The full path to the DOCX file.
 * @returns {Promise<string>} - The extracted text.
 * @throws {Error} If the DOCX parsing fails.
 */
async function extractTextFromDOCX(filePath) {
    try {
        const dataBuffer = fs.readFileSync(filePath);
        const result = await mammoth.extractRawText({ buffer: dataBuffer });
        return result.value;
    } catch (error) {
        console.error(`[DOCX Extraction Error] Failed to extract text from ${filePath}:`, error);
        throw new Error('Failed to parse DOCX file. It might be corrupted or malformed.');
    }
}

/**
 * Scores a resume against a job description using the Groq API.
 * Returns a JSON object with score, good points, and bad points.
 * @param {string} resumeText - The extracted text from the resume.
 * @param {string} jobDescription - The job description text.
 * @returns {Promise<object>} - An object containing score, goodPoints, and badPoints.
 * @throws {Error} If Groq API key is missing, API call fails, or response parsing fails.
 */
async function scoreResume(resumeText, jobDescription) {
    // Prompt engineering to guide the AI to return a specific JSON format
    const prompt = `You are a helpful assistant that scores resumes against a job description. Your response MUST be ONLY a JSON object with the following keys: "score" (a number from 0-100), "goodPoints" (a string detailing strengths), and "badPoints" (a string detailing weaknesses). Do NOT include any other text or commentary outside the JSON.

Job Description:
${jobDescription}

Resume:
${resumeText}

JSON Response:`;

    // Check if Groq API key is configured
    if (!process.env.GROQ_API_KEY) {
        console.error('[Groq API Error] Groq API key is not set. Please set GROQ_API_KEY in your .env file.');
        return {
            score: 0,
            goodPoints: 'API key not configured.',
            badPoints: 'Cannot evaluate resume without a Groq API key. Please check server configuration.'
        };
    }

    try {
        // Call the Groq API for chat completion
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                {
                    role: "user",
                    content: prompt,
                },
            ],
            model: "llama3-8b-8192", // Choose a suitable Groq model
            temperature: 0.5, // Controls randomness: lower values are more deterministic
            max_tokens: 500, // Max tokens for the model's response
        });

        const textResponse = chatCompletion.choices[0]?.message?.content?.trim();
        console.log('Groq raw response:', textResponse); // Log raw AI response for debugging

        let parsedResult;
        try {
            // Attempt to parse JSON safely, even if there's surrounding text (common AI issue)
            const jsonStart = textResponse.indexOf('{');
            const jsonEnd = textResponse.lastIndexOf('}');
            if (jsonStart === -1 || jsonEnd === -1) {
                throw new Error('JSON object boundaries not found in AI response.');
            }
            const jsonString = textResponse.substring(jsonStart, jsonEnd + 1);
            parsedResult = JSON.parse(jsonString);
        } catch (jsonError) {
            console.error('[JSON Parse Error] Failed to parse JSON from Groq response:', jsonError);
            console.error('Problematic Groq response text:', textResponse);
            // Fallback for malformed JSON, try to extract common keys if possible
            const scoreMatch = textResponse.match(/"score":\s*(\d+)/);
            const goodPointsMatch = textResponse.match(/"goodPoints":\s*"(.*?)(?<!\\)"/s); // 's' flag for multiline dotall
            const badPointsMatch = textResponse.match(/"badPoints":\s*"(.*?)(?<!\\)"/s);

            parsedResult = {
                score: scoreMatch ? parseInt(scoreMatch[1], 10) : 0,
                goodPoints: goodPointsMatch ? goodPointsMatch[1].replace(/\\"/g, '"') : 'AI response format issue: Good points could not be extracted.',
                badPoints: badPointsMatch ? badPointsMatch[1].replace(/\\"/g, '"') : 'AI response format issue: Bad points could not be extracted.'
            };
            console.warn('[Groq Response Warning] Using fallback parsing due to malformed JSON.');
        }

        // Validate the structure of the parsed result
        if (typeof parsedResult.score !== 'number' ||
            typeof parsedResult.goodPoints !== 'string' ||
            typeof parsedResult.badPoints !== 'string') {
            throw new Error('AI response did not return the expected JSON structure (score, goodPoints, badPoints).');
        }

        return parsedResult;
    } catch (error) {
        console.error('[Groq API Error] Groq API call or response processing failed:', error);
        return {
            score: 0,
            goodPoints: 'An error occurred during evaluation.',
            badPoints: `Evaluation failed due to an internal error: ${error.message}. Please ensure your API key is valid and the Groq model is accessible.`
        };
    }
}

// --- API Endpoints ---

/**
 * POST /analyze
 * Handles resume uploads and analysis against a job description.
 * Expects 'resumes' as multipart/form-data files and 'jobDescription' as a text field.
 */
app.post('/analyze', upload.array('resumes'), async (req, res) => {
    try {
        const jobDescription = req.body.jobDescription;
        if (!jobDescription) {
            // If job description is missing, return a 400 Bad Request
            // Ensure uploaded files are deleted in this case
            if (req.files && req.files.length > 0) {
                req.files.forEach(file => {
                    if (fs.existsSync(file.path)) {
                        fs.unlinkSync(file.path);
                    }
                });
            }
            return res.status(400).json({ error: 'Job description is required for analysis.' });
        }

        if (!req.files || req.files.length === 0) {
            // If no resume files are uploaded, return a 400 Bad Request
            return res.status(400).json({ error: 'No resume files uploaded for analysis.' });
        }

        // Process each uploaded file concurrently
        const results = await Promise.all(
            req.files.map(async (file) => {
                const fileExt = path.extname(file.originalname).toLowerCase();
                let resumeText = '';
                let analysis = {}; // Initialize analysis object for each file

                try {
                    const filePath = file.path; // Path where Multer saved the file

                    // Extract text based on file type
                    if (fileExt === '.pdf') {
                        resumeText = await extractTextFromPDF(filePath);
                    } else if (fileExt === '.docx') {
                        resumeText = await extractTextFromDOCX(filePath);
                    } else {
                        // Handle unsupported file types: delete and return error
                        console.warn(`Unsupported file type uploaded: ${file.originalname}`);
                        fs.unlinkSync(filePath); // Delete the unsupported file
                        return {
                            filename: file.originalname,
                            error: 'Unsupported file type. Only PDF and DOCX files are allowed.',
                        };
                    }

                    // Score the extracted resume text using Groq API
                    analysis = await scoreResume(resumeText, jobDescription);

                    return {
                        filename: file.originalname,
                        savedFilename: path.basename(filePath), // Provide the unique saved filename
                        ...analysis, // Include score, goodPoints, badPoints
                    };
                } catch (fileProcessingError) {
                    console.error(`[File Processing Error] Error processing file ${file.originalname}:`, fileProcessingError);
                    // Ensure the file is deleted if processing fails for any reason
                    if (file.path && fs.existsSync(file.path)) {
                        fs.unlinkSync(file.path);
                    }
                    return {
                        filename: file.originalname,
                        error: `Failed to process this resume: ${fileProcessingError.message}`,
                    };
                }
                // Note: Files are NOT deleted immediately after successful analysis.
                // Implement a separate cleanup mechanism (e.g., scheduled task, or after download)
                // for production to manage disk space and data privacy.
            })
        );

        // Send back the results for all processed resumes
        res.json(results);
    } catch (err) {
        console.error('[Server Error] Error in /analyze endpoint:', err);
        // Catch any unexpected server-level errors
        res.status(500).json({ error: 'Internal server error occurred during resume analysis. Please try again.' });
    }
});

/**
 * GET /download/:filename
 * Allows clients to download previously uploaded files from the 'uploads' directory.
 */
app.get('/download/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(uploadsDir, filename);

    // Basic security check: prevent directory traversal attacks
    // Ensure filename doesn't contain '..' and the file actually exists
    if (!filename || filename.includes('..') || !fs.existsSync(filePath)) {
        return res.status(404).send('File not found or invalid filename.');
    }

    // Send the file for download
    res.download(filePath, (err) => {
        if (err) {
            console.error(`[Download Error] Failed to download file ${filename}:`, err);
            // Handle specific download errors
            if (err.code === 'ENOENT') {
                return res.status(404).send('The requested file was not found on the server.');
            }
            res.status(500).send('Could not download the file due to a server error.');
        }
        // Optional: delete the file after successful download. Use with caution
        // in multi-user environments if multiple users might need the same file.
        /*
        fs.unlink(filePath, (unlinkErr) => {
            if (unlinkErr) console.error(`[Cleanup Error] Error deleting file ${filename} after download:`, unlinkErr);
            else console.log(`File ${filename} deleted after download.`);
        });
        */
    });
});

// --- Start the Server ---

// Make the Express app listen for incoming requests on the specified port
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log(`Uploads directory: ${uploadsDir}`);
    if (!process.env.GROQ_API_KEY) {
        console.warn('WARNING: GROQ_API_KEY is not set in your .env file. AI analysis will fail.');
    }
});