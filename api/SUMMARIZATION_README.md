# Real Text Extraction and Summarization

This document explains how to set up and use the real PDF text extraction and AI-powered summarization features.

## Setup Instructions

### 1. Environment Configuration

Create a `.env` file in the `api` directory:

```bash
cp .env.example .env
```

Edit the `.env` file and add your OpenAI API key:

```env
OPENAI_API_KEY=your_actual_openai_api_key_here
PORT=3000
```

### 2. Get OpenAI API Key

1. Sign up or log in to [OpenAI Platform](https://platform.openai.com/)
2. Go to [API Keys](https://platform.openai.com/api-keys)
3. Create a new secret key
4. Copy the key and paste it in your `.env` file

### 3. Install Dependencies

The required dependencies are already installed:
- `pdf-parse`: For extracting text from PDF files
- `openai`: For AI-powered summarization
- `@types/pdf-parse`: TypeScript type definitions

## Features

### Real Text Extraction
- Extracts actual text content from PDF files using `pdf-parse`
- Handles text cleanup and normalization
- Gets real page count and file metadata
- Detects image-based or encrypted PDFs

### AI-Powered Summarization
- Uses OpenAI GPT-3.5-turbo for intelligent summarization
- Provides 150-300 word summaries focusing on key points
- Handles long documents by truncating to fit token limits
- Falls back to basic text analysis if OpenAI is unavailable

### Graceful Fallbacks
- If no OpenAI API key is provided, generates basic summaries
- Basic summaries include word count, character count, and first few sentences
- All text extraction still works without OpenAI

## API Response Changes

### Individual Task Status (`GET /status/:taskId`)
Now includes full `result` object with:
```json
{
  "result": {
    "filename": "document.pdf",
    "processedAt": "2024-01-01T12:00:00.000Z",
    "extractedText": "Full extracted text content...",
    "summary": "AI-generated summary of the document...",
    "pageCount": 25,
    "fileSize": 1048576,
    "metadata": {
      "textLength": 15420,
      "summaryLength": 284,
      "pdfInfo": { ... }
    }
  }
}
```

### All Tasks Status (`GET /status`)
Now includes summary preview for completed tasks:
```json
{
  "tasks": [
    {
      "id": "task_123",
      "filename": "document.pdf",
      "status": "completed",
      "hasResult": true,
      "summary": "AI-generated summary...",
      "pageCount": 25,
      "fileSize": 1048576
    }
  ]
}
```

## Testing the Implementation

### 1. Start the Server
```bash
npm run dev
```

### 2. Upload a PDF
```bash
curl -X POST http://localhost:3000/upload \
  -F "pdf=@/path/to/your/document.pdf"
```

### 3. Monitor Processing
```bash
# Check all tasks
curl http://localhost:3000/status

# Check specific task
curl http://localhost:3000/status/your_task_id
```

### 4. View Results
Once processing is complete, the response will include:
- Real extracted text from the PDF
- AI-generated summary
- Actual page count and file size
- Processing metadata

## Configuration Options

### OpenAI Model Settings
The summarization uses these settings (in `pdfProcessor.ts`):
- Model: `gpt-3.5-turbo`
- Max tokens: 500
- Temperature: 0.3 (for consistent results)
- Character limit: 12,000 (to fit token limits)

### Text Processing
- Normalizes whitespace and line breaks
- Detects empty or unreadable PDFs
- Provides detailed error messages

## Error Handling

### Common Issues and Solutions

1. **"No readable text found"**
   - PDF may be image-based (scanned document)
   - PDF may be encrypted or password-protected
   - Consider adding OCR support for image-based PDFs

2. **"OpenAI API error"**
   - Check your API key is valid
   - Ensure you have sufficient OpenAI credits
   - System will fall back to basic summary

3. **"Text extraction failed"**
   - PDF file may be corrupted
   - Unsupported PDF format
   - File permissions issue

## Performance Considerations

- Text extraction is fast (typically < 1 second)
- AI summarization takes 2-5 seconds depending on document length
- Large documents are truncated to fit OpenAI token limits
- Summary information is included in list responses for better UX

## Next Steps

Potential enhancements:
1. **OCR Support**: Add Tesseract.js for image-based PDFs
2. **Chunk Processing**: Handle very large documents in chunks
3. **Multiple Models**: Support different AI models (Claude, local models)
4. **Custom Prompts**: Allow customizable summarization prompts
5. **Keyword Extraction**: Extract key terms and topics
6. **Language Detection**: Detect and handle multiple languages

## Costs

OpenAI API costs for summarization:
- GPT-3.5-turbo: ~$0.001-0.002 per document summary
- Typical 10-page PDF: ~$0.0015
- 100 documents/month: ~$0.15

The system includes cost controls:
- Text truncation to limit token usage
- Fallback to free basic summaries
- Single summarization per document 