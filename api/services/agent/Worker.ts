import { Memory } from './memory';
import { MemoryDatabaseService } from './memoryDatabaseService';
import OpenAI from 'openai';
import { IndicesDatabaseService } from '../indicesDatabaseService';

// Utility function to extract JSON from OpenAI response
function extractJsonFromResponse(text: string): string {
  // Extract JSON from markdown code blocks if present
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }
  return text.trim();
}

export abstract class Worker {
  protected memory: Memory;
  protected memoryDb: MemoryDatabaseService;

  constructor(memory: Memory) {
    this.memory = memory;
    this.memoryDb = new MemoryDatabaseService();
  }

  // Subclasses implement this
  protected abstract coreProcess(taskPayload: any, context: string): Promise<string | object>;

  // Unified process method
  async process(taskPayload: any, taskId: string): Promise<any> {
    const context = this.memory.getContext();
    console.log(`[WORKER] Context for task ${taskId}:`);
    console.log(`[WORKER] Context length: ${context.length} characters`);
    console.log(`[WORKER] Context content:`, context);
    console.log(`[WORKER] --- End Context ---`);
    
    // Call subclass-specific logic
    const result = await this.coreProcess(taskPayload, context);
    // Add result to memory with better formatting
    const resultString = typeof result === 'string' ? result : JSON.stringify(result);
    const formattedResult = `\n--- TASK RESULT ---\n${resultString}\n--- END RESULT ---\n`;
    console.log(`[WORKER] Adding to memory for task ${taskId}:`);
    console.log(`[WORKER] Result length: ${formattedResult.length} characters`);
    console.log(`[WORKER] Result content:`, formattedResult);
    console.log(`[WORKER] --- End Result ---`);
    await this.memory.add(formattedResult);
    // Save snapshot to DB
    await this.memoryDb.addSnapshot({
      id: this.memory['id'],
      context: this.memory.getContext(),
      maxLength: (this.memory as any).maxLength,
      shrinkMode: (this.memory as any).shrinkMode,
      taskId
    } as any);
    return { result };
  }
}

export class ComparisonWorker extends Worker {
  private indicesDb: IndicesDatabaseService;

  constructor(memory: Memory) {
    super(memory);
    this.indicesDb = new IndicesDatabaseService();
  }

  protected async coreProcess(taskPayload: any, context: string): Promise<object> {
    // Use OpenAI API to analyze the article
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
    const question = taskPayload.question || '';
    const intent = taskPayload.intent || '';
    
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
    
    const historicalScores = context;
    const article_id = taskPayload.article_id || '';
    const prompt = `
You are given an article.

1. Please provide a score based on the question and the historical scores. If there is historical data, do not change the score name. If there is no historical data, create a new score name based on the question and article.
2. Extract several pieces of evidence from the article that support your score. Cite the original sentences.
3. The output must be a single valid JSON object, with all keys and string values double-quoted, and arrays in square brackets. Do not use markdown, YAML, or any other formatting.

Example output:
{
  "score_name": "Inflation Sentiment Index",
  "score_value": 0.3,
  "article_id": "${article_id}",
  "evidence": [
    "Inflation remained elevated.",
    "Participants agreed that inflation was unacceptably high and noted that the data indicated that declines in inflation had been slower than they had expected.",
    "Participants generally noted that economic activity had continued to expand at a modest pace but there were some signs that supply and demand in the labor market were coming into better balance."
  ],
  "rational": "The score of 0.3 reflects a moderately positive sentiment towards inflation management, indicating that while inflation is acknowledged as a concern, there is also a recognition of the potential for stabilization and control through policy measures. This is consistent with historical scores that show a cautious but proactive stance on inflation."
}

Article:
${article}

Question: ${question}
${intent ? `Intent: ${intent}` : ''}

Historical Scores: 
${historicalScores}

Output only the JSON object as described above. Do not wrap it in markdown code blocks or any other formatting.
`;
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a helpful assistant for document analysis.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 512,
      temperature: 0.3,
    });
    // Try to parse the output as JSON
    let output: any = {};
    let scoreSummary = '';
    try {
      const text = completion.choices[0]?.message?.content || '';
      const jsonText = extractJsonFromResponse(text);
      output = JSON.parse(jsonText);
      if (output.score_name && output.score_value !== undefined) {
        scoreSummary = `${output.score_name}: ${output.score_value}`;
        
        // Save the index to the indices database
        try {
          await this.indicesDb.addIndicesCreationIndex(
            output.score_name,
            output.score_value,
            output.article_id || taskPayload.article_id,
            taskPayload.filename || 'unknown',
            output.evidence || [],
            output.rational || '',
            taskPayload.timestamp,
            taskPayload.taskId
          );
        } catch (error) {
          console.error(`[COMPARISON WORKER] Failed to save index to database:`, error);
        }
      }
    } catch (e) {
      output = { error: 'Failed to parse OpenAI output as JSON', raw: completion.choices[0]?.message?.content };
    }
    return { ...output, scoreSummary };
  }
}

export class ResearchWorker extends Worker {
  protected async coreProcess(taskPayload: any, context: string): Promise<object> {
    // Use OpenAI API to generate a summary of the article
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
    const prompt = `
You are given an article and some historical research context.

1. Write a small paragraph to answer the question, referring to the article. Take into account the historical research context if relevant. Be concise and informative. Try to get as much incremental information as possible from the article compared to historical research context.
2. Extract several pieces of evidence from the article that support your answer. Cite the original sentences.
3. The output must be a single valid JSON object, with all keys and string values double-quoted, and arrays in square brackets. Do not use markdown, YAML, or any other formatting.

Example output:
{
  "answer": "The FOMC minutes indicate continued concerns about elevated inflation levels, with participants noting that inflation declines have been slower than expected. However, there are signs of improvement in labor market balance and economic activity continues to expand modestly.",
  "article_id": "${article_id}",
  "evidence": [
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
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a helpful assistant for research and summarization.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 512,
      temperature: 0.3,
    });
    let output: any = {};
    let summary = '';
    try {
      const text = completion.choices[0]?.message?.content || '';
      const jsonText = extractJsonFromResponse(text);
      output = JSON.parse(jsonText);
      if (output.answer) {
        summary = output.answer;
      }
    } catch (e) {
      output = { error: 'Failed to parse OpenAI output as JSON', raw: completion.choices[0]?.message?.content };
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
    // Use OpenAI API to generate a long markdown article
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
    const question = taskPayload.question || '';
    const intent = taskPayload.intent || '';
    const historicalResearch = context;
    // Optionally, pass in a mapping of article ids to article titles for citation
    const articleIdMap = taskPayload.articleIdMap || {};
    const timestampMap = taskPayload.timestampMap || {};
    
    // First, generate a proper title for the article
    const titlePrompt = `
Based on this research question and intent, generate a clear, professional title for a research article:

Question: ${question}
Intent: ${intent}

Generate a concise, descriptive title (max 60 characters) that would be appropriate for a professional research article. 
Return only the title, no quotes or additional text.
`;

    const titleCompletion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a helpful assistant for generating professional research article titles.' },
        { role: 'user', content: titlePrompt }
      ],
      max_tokens: 100,
      temperature: 0.3,
    });

    const articleTitle = titleCompletion.choices[0]?.message?.content?.trim() || question;
    
    const prompt = `
You are an expert research analyst writing a comprehensive research article. Based on the provided research context from multiple documents, create a professional, well-structured markdown article.

Research Question: ${question}
${intent ? `Research Intent: ${intent}` : ''}

ARTICLE REQUIREMENTS:
1. **Professional Structure**: Use a clear hierarchy with main sections and subsections
2. **Executive Summary**: Start with a brief overview of key findings
3. **Comprehensive Analysis**: Provide detailed analysis of the research question
4. **Evidence-Based**: Support all claims with specific citations from the documents
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
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are an expert research analyst and writer specializing in comprehensive, evidence-based research articles.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 3000,
      temperature: 0.7,
    });
    let article = '';
    try {
      article = completion.choices[0]?.message?.content?.trim() || '';
    } catch (e) {
      article = 'Failed to generate article.';
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