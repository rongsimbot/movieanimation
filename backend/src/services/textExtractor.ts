/**
 * textExtractor.ts - Text Extraction from Uploaded Script Files
 * MovieAnimation Backend - Phase 3 Script Upload
 *
 * Extracts plain text from .txt, .pdf, and .docx files
 * to populate the script editor.
 */

import fs from 'fs';
import path from 'path';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';

const ALLOWED_SCRIPT_MIMES = [
  'text/plain',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/octet-stream', // ambiguous — check extension
];

const ALLOWED_SCRIPT_EXTENSIONS = ['.txt', '.pdf', '.docx'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB for scripts

export interface ExtractionResult {
  success: boolean;
  text: string;
  fileName: string;
  wordCount: number;
  error?: string;
}

/**
 * Validate script file type and size
 */
export function validateScriptFile(
  mimeType: string,
  fileName: string,
  fileSize: number
): { valid: boolean; error?: string } {
  const ext = path.extname(fileName).toLowerCase();

  if (!ALLOWED_SCRIPT_EXTENSIONS.includes(ext)) {
    return {
      valid: false,
      error: `Unsupported file type: "${ext}". Accepted: ${ALLOWED_SCRIPT_EXTENSIONS.join(', ')}`,
    };
  }

  if (fileSize > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File too large (${(fileSize / 1024 / 1024).toFixed(1)}MB). Max: ${MAX_FILE_SIZE / 1024 / 1024}MB`,
    };
  }

  return { valid: true };
}

/**
 * Extract text from a .txt file
 */
async function extractFromTxt(filePath: string): Promise<string> {
  const content = await fs.promises.readFile(filePath, 'utf-8');
  return content;
}

/**
 * Extract text from a .pdf file
 */
async function extractFromPdf(filePath: string): Promise<string> {
  const dataBuffer = await fs.promises.readFile(filePath);
  const pdfData = await pdfParse(dataBuffer);
  return pdfData.text;
}

/**
 * Extract text from a .docx file
 */
async function extractFromDocx(filePath: string): Promise<string> {
  const result = await mammoth.extractRawText({ path: filePath });
  if (result.messages.length > 0) {
    console.warn('[TextExtractor] mammoth warnings:', result.messages);
  }
  return result.value;
}

/**
 * Extract text from an uploaded file
 *
 * @param filePath - Absolute path to the uploaded file on disk
 * @param fileName - Original filename (used to detect type)
 */
export async function extractTextFromFile(
  filePath: string,
  fileName: string
): Promise<ExtractionResult> {
  const ext = path.extname(fileName).toLowerCase();

  try {
    let text: string;

    switch (ext) {
      case '.txt':
        text = await extractFromTxt(filePath);
        break;
      case '.pdf':
        text = await extractFromPdf(filePath);
        break;
      case '.docx':
        text = await extractFromDocx(filePath);
        break;
      default:
        return {
          success: false,
          text: '',
          fileName,
          wordCount: 0,
          error: `Unsupported file extension: ${ext}`,
        };
    }

    // Clean up: normalize line endings, trim excessive whitespace
    text = text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .trim();

    const wordCount = text.split(/\s+/).filter(Boolean).length;

    if (!text) {
      return {
        success: false,
        text: '',
        fileName,
        wordCount: 0,
        error: 'Extracted text is empty. The file may be corrupted or contain no readable text.',
      };
    }

    return {
      success: true,
      text,
      fileName,
      wordCount,
    };
  } catch (err: any) {
    console.error('[TextExtractor] Extraction failed:', err.message);
    return {
      success: false,
      text: '',
      fileName,
      wordCount: 0,
      error: `Failed to extract text: ${err.message}`,
    };
  }
}

/**
 * Guess a script title from the filename
 */
export function guessTitleFromFilename(fileName: string): string {
  const base = path.basename(fileName, path.extname(fileName));
  // Convert snake_case / kebab-case / camelCase to Title Case
  return base
    .replace(/[-_]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

export { ALLOWED_SCRIPT_MIMES, ALLOWED_SCRIPT_EXTENSIONS, MAX_FILE_SIZE };
