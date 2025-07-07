import { Memory } from './memory';
import { MemoryDatabaseService } from './memoryDatabaseService';
import { IndicesDatabaseService } from '../indicesDatabaseService';
import { callReasoningModel, callWritingModel, extractJsonFromResponse } from '../openaiUtil';
import OpenAI from 'openai';

export abstract class Worker {
  protected memory: Memory;
  protected memoryDb: MemoryDatabaseService;

  constructor(memory: Memory) {
    this.memory = memory;
    this.memoryDb = new MemoryDatabaseService();
  }

  protected abstract coreProcess(taskPayload: any, context: string): Promise<string | object>;

  async process(taskPayload: any, taskId: string): Promise<any> {
    console.log(`[WORKER] Starting task: ${taskId}`);
    
    // Get context from memory
    const context = await this.memory.getContext();
    console.log(`[WORKER] Context for task ${taskId}:`);
    console.log(`[WORKER] Context length: ${context.length} characters`);
    console.log(`[WORKER] Context content: ${context.substring(0, 200)}${context.length > 200 ? '...' : ''}`);
    
    // Process the task
    const result = await this.coreProcess(taskPayload, context);
    
    // Update memory with result
    await this.memory.add(`Task ${taskId} completed with result: ${JSON.stringify(result).substring(0, 500)}`);
    
    return result;
  }
}

export class ComparisonWorker extends Worker {
  private indicesDb: IndicesDatabaseService;

  constructor(memory: Memory) {
    super(memory);
    this.indicesDb = new IndicesDatabaseService();
  }

  protected async coreProcess(taskPayload: any, context: string): Promise<object> {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
    
    // Load article text from file if not provided directly
    let article = taskPayload.article || '';
    if (!article && taskPayload.extractedTextPath) {
      try {
        const fs = require('fs/promises');
        const path = require('path');
        // Check if the path is already absolute or relative
        const fullPath = path.isAbsolute(taskPayload.extractedTextPath) 
          ? taskPayload.extractedTextPath 
          : path.join(process.cwd(), taskPayload.extractedTextPath);
        article = await fs.readFile(fullPath, 'utf-8');
        console.log(`[COMPARISON WORKER] Loaded article from: ${fullPath}`);
      } catch (error) {
        console.error(`[COMPARISON WORKER] Failed to load article from ${taskPayload.extractedTextPath}:`, error);
        throw new Error(`Failed to load article text: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    const article_id = taskPayload.article_id || '';
    const historicalScores = context;
    const question = taskPayload.question || '';
    const intent = taskPayload.intent || '';
    const timestamp = taskPayload.timestamp;

    const systemPrompt = 'You are a helpful assistant for document analysis.';
    
    const userPrompt = `
You are given an article and some historical scores context.

1. Create a scoring index based on the user question, referring to the article. Take into account the historical scores context if relevant. Be consistent with historical scoring patterns but allow for changes over time.
2. Extract several pieces of quotes from the article that support your score. Cite the original sentences.
3. The output must be a single valid JSON object, with all keys and string values double-quoted, and arrays in square brackets. Do not use markdown, YAML, or any other formatting.

Example output:
{
  "score_name": "Inflation Sentiment Index",
  "score_value": 0.7,
  "article_id": "${article_id}",
  "quotes": [
    "Inflation remained elevated.",
    "Participants agreed that inflation was unacceptably high and noted that the data indicated that declines in inflation had been slower than they had expected.",
    "Participants generally noted that economic activity had continued to expand at a modest pace but there were some signs that supply and demand in the labor market were coming into better balance."
  ],
  "rational": "The score of 0.7 reflects a moderately high concern about inflation, consistent with the language used in the document. This score is slightly higher than the previous month due to the explicit mention of elevated inflation levels and slower-than-expected declines."
}

Article:
${article}

Question: ${question}
${intent ? `Intent: ${intent}` : ''}
${timestamp ? `Document Timestamp: ${timestamp}` : ''}

Historical Scores: 
${historicalScores}

Output only the JSON object as described above. Do not wrap it in markdown code blocks or any other formatting.
`;

    const response = await callReasoningModel(systemPrompt, userPrompt, '[COMPARISON WORKER]');
    
    // Try to parse the output as JSON
    let output: any = {};
    let scoreSummary = '';
    
    if (!response.success) {
      output = { error: response.error || 'Failed to get response from OpenAI', raw: response.text };
    } else {
      try {
        const jsonText = extractJsonFromResponse(response.text);
        console.log('[COMPARISON WORKER] Extracted JSON text:', jsonText);
        
        output = JSON.parse(jsonText);
        console.log('[COMPARISON WORKER] Parsed JSON output:', output);
        
        if (output.score_name && output.score_value !== undefined) {
          scoreSummary = `${output.score_name}: ${output.score_value}`;
          
          // Save the index to the indices database
          try {
            await this.indicesDb.addIndicesCreationIndex(
              output.score_name,
              output.score_value,
              output.article_id || taskPayload.article_id,
              taskPayload.filename || 'unknown',
              output.quotes || [],
              output.rational || '',
              taskPayload.timestamp,
              taskPayload.taskId
            );
          } catch (error) {
            console.error(`[COMPARISON WORKER] Failed to save index to database:`, error);
          }
        }
      } catch (e) {
        console.error('[COMPARISON WORKER] Error parsing JSON:', e);
        output = { error: 'Failed to parse OpenAI output as JSON', raw: response.text };
      }
    }
    
    return { ...output, scoreSummary };
  }
}

export class ResearchWorker extends Worker {
  protected async coreProcess(taskPayload: any, context: string): Promise<object> {
    // Load article text from file if not provided directly
    let article = taskPayload.article || '';
    if (!article && taskPayload.extractedTextPath) {
      try {
        const fs = require('fs/promises');
        const path = require('path');
        // Check if the path is already absolute or relative
        const fullPath = path.isAbsolute(taskPayload.extractedTextPath) 
          ? taskPayload.extractedTextPath 
          : path.join(process.cwd(), taskPayload.extractedTextPath);
        article = await fs.readFile(fullPath, 'utf-8');
        console.log(`[RESEARCH WORKER] Loaded article from: ${fullPath}`);
      } catch (error) {
        console.error(`[RESEARCH WORKER] Failed to load article from ${taskPayload.extractedTextPath}:`, error);
        throw new Error(`Failed to load article text: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    const article_id = taskPayload.article_id || '';
    const historicalResearch = context;
    const question = taskPayload.question || '';
    const intent = taskPayload.intent || '';
    const timestamp = taskPayload.timestamp;
    
    const systemPrompt = 'You are a helpful assistant for research and summarization.';
    
    const userPrompt = `
You are given an article and some historical research context.

1. Write a small paragraph to answer the question, referring to the article. Take into account the historical research context if relevant. Be concise and informative. Try to get as much incremental information as possible from the article compared to historical research context.
2. Extract several pieces of quotes from the article that support your answer. Cite the original sentences.
3. The output must be a single valid JSON object, with all keys and string values double-quoted, and arrays in square brackets. Do not use markdown, YAML, or any other formatting.

Example output:
{
  "answer": "The FOMC minutes indicate continued concerns about elevated inflation levels, with participants noting that inflation declines have been slower than expected. However, there are signs of improvement in labor market balance and economic activity continues to expand modestly.",
  "article_id": "${article_id}",
  "quotes": [
    "Inflation remained elevated.",
    "Participants agreed that inflation was unacceptably high and noted that the data indicated that declines in inflation had been slower than they had expected.",
    "Participants generally noted that economic activity had continued to expand at a modest pace but there were some signs that supply and demand in the labor market were coming into better balance."
  ],
  "rational": "The analysis shows both ongoing inflation concerns and emerging positive indicators, suggesting a cautious but potentially improving outlook compared to previous assessments."
}

Article:
${article}

Question: ${question}
${intent ? `Intent: ${intent}` : ''}
${timestamp ? `Document Timestamp: ${timestamp}` : ''}

Historical Research Context: 
${historicalResearch}

Output only the JSON object as described above. Do not wrap it in markdown code blocks or any other formatting.
`;

    const response = await callReasoningModel(systemPrompt, userPrompt, '[RESEARCH WORKER]');
    
    let output: any = {};
    let summary = '';
    
    if (!response.success) {
      output = { error: response.error || 'Failed to get response from OpenAI', raw: response.text };
    } else {
      try {
        const jsonText = extractJsonFromResponse(response.text);
        console.log('[RESEARCH WORKER] Extracted JSON text:', jsonText);
        
        output = JSON.parse(jsonText);
        console.log('[RESEARCH WORKER] Parsed JSON output:', output);
        
        if (output.answer) {
          summary = output.answer;
        }
      } catch (e) {
        console.error('[RESEARCH WORKER] Error parsing JSON:', e);
        output = { error: 'Failed to parse OpenAI output as JSON', raw: response.text };
      }
    }
    
    // Add timestamp to output if available
    if (timestamp) {
      output.timestamp = timestamp;
    }
    
    return { ...output, summary };
  }
}

export class WritingWorker extends Worker {
  protected async coreProcess(taskPayload: any, context: string): Promise<object> {
    const question = taskPayload.question || '';
    const intent = taskPayload.intent || '';
    const historicalResearch = context;
    // Optionally, pass in a mapping of article ids to article titles for citation
    const articleIdMap = taskPayload.articleIdMap || {};
    const timestampMap = taskPayload.timestampMap || {};
    
    // First, generate a proper title for the article
    const titleSystemPrompt = 'You are a helpful assistant for generating professional research article titles.';
    
    const titleUserPrompt = `
Based on this research question and intent, generate a clear, professional title for a research article:

Question: ${question}
Intent: ${intent}

Generate a concise, descriptive title (max 60 characters) that would be appropriate for a professional research article. 
Return only the title, no quotes or additional text.
`;

    const titleResponse = await callReasoningModel(titleSystemPrompt, titleUserPrompt, '[WRITING WORKER - TITLE]');
    
    const articleTitle = titleResponse.text || question;
    console.log('[WRITING WORKER] Generated article title:', articleTitle);
    
    const articleSystemPrompt = 'You are an expert research analyst and writer specializing in comprehensive, quotes-based research articles.';
    
    const articleUserPrompt = `
You are an expert research analyst writing a comprehensive research article. Based on the provided research context from multiple documents, create a professional, well-structured markdown article.

Research Question: ${question}
${intent ? `Research Intent: ${intent}` : ''}

ARTICLE REQUIREMENTS:
1. **Professional Structure**: Use a clear hierarchy with main sections and subsections
2. **Executive Summary**: Start with a brief overview of key findings
3. **Comprehensive Analysis**: Provide detailed analysis of the research question
4. **quotes-Based**: Support all claims with specific citations from the documents
5. **Chronological Context**: When relevant, discuss developments over time
6. **Synthesis**: Connect findings across different documents to provide insights
7. **Citations**: Use [^article_id] format for all references
8. **References Section**: Include complete reference list with titles and timestamps

WRITING STYLE:
- Professional and authoritative tone
- Clear, accessible language while maintaining analytical depth
- Logical flow between sections
- Specific data points and quotes where relevant
- Balanced perspective acknowledging different viewpoints when present

STRUCTURE TEMPLATE:
# [Article Title]

## Executive Summary
[2-3 paragraph overview of key findings]

## Introduction
[Context and background]

## [Main Analysis Sections]
[Organize by themes, chronology, or key aspects of the research question]

## Key Findings
[Summarize main discoveries and insights]

## Conclusion
[Synthesis and implications]

## References
[Complete citation list]

---

Historical Research Context:
${historicalResearch}

Article ID Map (for citation):
${JSON.stringify(articleIdMap, null, 2)}

Timestamp Map (for chronological context):
${JSON.stringify(timestampMap, null, 2)}

Generate the complete markdown article following the structure and requirements above.
`;

    const articleResponse = await callWritingModel(articleSystemPrompt, articleUserPrompt, '[WRITING WORKER - ARTICLE]');
    
    let article = '';
    if (!articleResponse.success) {
      article = 'Failed to generate article - ' + (articleResponse.error || 'Unknown error');
    } else {
      article = articleResponse.text || 'Failed to generate article.';
    }
    
    // Save the article as a markdown file
    const fs = require('fs/promises');
    const path = require('path');
    
    try {
      // Create research-articles directory if it doesn't exist
      const articlesDir = path.join(process.cwd(), 'research-articles');
      await fs.mkdir(articlesDir, { recursive: true });
      
      // Generate a clean, readable filename from the article title
      const sanitizedTitle = articleTitle
        .replace(/[^a-z0-9\s-]/gi, '') // Remove special characters except hyphens
        .replace(/\s+/g, '-') // Replace spaces with hyphens
        .toLowerCase()
        .substring(0, 60); // Reasonable length limit
        
      // Use a simpler date format for the filename
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD format
      const filename = `${dateStr}_${sanitizedTitle}.md`;
      const filepath = path.join(articlesDir, filename);
      
      // Create article with metadata header
      const articleWithMeta = `---
title: "${articleTitle}"
original_query: "${question}"
intent: "${intent}"
generated: ${new Date().toISOString()}
documents_analyzed: ${Object.keys(articleIdMap).length}
category: "deep_research"
---

${article}`;
      
      await fs.writeFile(filepath, articleWithMeta, 'utf-8');
      console.log(`[WRITING WORKER] Saved article to: ${filepath}`);
      
      return { 
        article, 
        articleTitle,
        filepath: path.relative(process.cwd(), filepath),
        filename 
      };
    } catch (saveError) {
      console.error('[WRITING WORKER] Failed to save article file:', saveError);
      return { article, articleTitle };
    }
  }
}

export class ChangeOfStatementWorker extends Worker {
  protected async coreProcess(taskPayload: any, context: string): Promise<object> {
    // Load article text from file if not provided directly
    let article = taskPayload.article || '';
    if (!article && taskPayload.extractedTextPath) {
      try {
        const fs = require('fs/promises');
        const path = require('path');
        // Check if the path is already absolute or relative
        const fullPath = path.isAbsolute(taskPayload.extractedTextPath) 
          ? taskPayload.extractedTextPath 
          : path.join(process.cwd(), taskPayload.extractedTextPath);
        article = await fs.readFile(fullPath, 'utf-8');
        console.log(`[CHANGE OF STATEMENT WORKER] Loaded article from: ${fullPath}`);
      } catch (error) {
        console.error(`[CHANGE OF STATEMENT WORKER] Failed to load article from ${taskPayload.extractedTextPath}:`, error);
        throw new Error(`Failed to load article text: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    const article_id = taskPayload.article_id || '';
    const historicalAnalysis = context;
    const question = taskPayload.question || '';
    const intent = taskPayload.intent || '';
    const timestamp = taskPayload.timestamp;

    const systemPrompt = 'You are a helpful assistant for analyzing changes in statements, language, tone, and messaging in documents.';
    
    const userPrompt = `
You are analyzing a document to identify changes in statements, language, tone, or messaging. Your task is to track qualitative changes in how concepts are discussed, framed, or presented.

1. Analyze the document for statements, language patterns, tone, and messaging related to the focus area.
2. Compare with historical analysis to identify changes, evolution, or shifts in approach.
3. Extract specific quotes that demonstrate these changes or continuities.
4. The output must be a single valid JSON object, with all keys and string values double-quoted, and arrays in square brackets. Do not use markdown, YAML, or any other formatting.

Example output:
{
  "analysis_name": "Federal Reserve Communication Evolution",
  "change_type": "Increased dovish language and forward guidance clarity",
  "article_id": "${article_id}",
  "quotes": [
    "The Committee will continue to monitor the implications of incoming information for the economic outlook.",
    "The Committee is prepared to adjust the stance of monetary policy as appropriate if risks emerge that could impede the attainment of the Committee's goals.",
    "The Committee expects to maintain this target range until labor market conditions have reached levels consistent with the Committee's assessments."
  ],
  "change_description": "This document shows a notable shift toward more explicit forward guidance compared to earlier communications. The language has become more specific about conditions for policy changes, moving away from general statements to concrete economic indicators.",
  "comparison_context": "Previous documents used more general language about 'monitoring conditions' while this document provides specific criteria and expectations, indicating a strategic shift toward greater transparency in monetary policy communication."
}

Article:
${article}

Question: ${question}
${intent ? `Intent: ${intent}` : ''}
${timestamp ? `Document Timestamp: ${timestamp}` : ''}

Historical Analysis Context: 
${historicalAnalysis}

Output only the JSON object as described above. Do not wrap it in markdown code blocks or any other formatting.
`;

    const response = await callReasoningModel(systemPrompt, userPrompt, '[CHANGE OF STATEMENT WORKER]');
    
    // Try to parse the output as JSON
    let output: any = {};
    let changeSummary = '';
    
    if (!response.success) {
      output = { error: response.error || 'Failed to get response from OpenAI', raw: response.text };
    } else {
      try {
        const jsonText = extractJsonFromResponse(response.text);
        console.log('[CHANGE OF STATEMENT WORKER] Extracted JSON text:', jsonText);
        
        output = JSON.parse(jsonText);
        console.log('[CHANGE OF STATEMENT WORKER] Parsed JSON output:', output);
        
        if (output.analysis_name && output.change_type) {
          changeSummary = `${output.analysis_name}: ${output.change_type}`;
        }
      } catch (e) {
        console.error('[CHANGE OF STATEMENT WORKER] Error parsing JSON:', e);
        output = { error: 'Failed to parse OpenAI output as JSON', raw: response.text };
      }
    }
    
    // Add timestamp to output if available
    if (timestamp) {
      output.timestamp = timestamp;
    }
    
    return { ...output, changeSummary };
  }
} 