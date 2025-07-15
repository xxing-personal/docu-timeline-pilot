import { Memory } from './memory';
import { MemoryDatabaseService } from './memoryDatabaseService';
import { IndicesDatabaseService } from '../indicesDatabaseService';
import { callReasoningModel, callWritingModel, extractJsonFromResponse } from '../ModelUtils';
import { PromptManager } from '../promptManager';
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
    const indexName = taskPayload.indexName || '';
    const timestamp = taskPayload.timestamp;
    const previousArticle = taskPayload.previousArticle || '';
    const previousFilename = taskPayload.previousFilename;
    const previousTimestamp = taskPayload.previousTimestamp;

    // Log previous article info for debugging
    if (previousArticle && previousFilename) {
      console.log(`[COMPARISON WORKER] Using previous article: ${previousFilename}`);
      console.log(`[COMPARISON WORKER] Previous article preview: ${previousArticle.substring(0, 150)}${previousArticle.length > 150 ? '...' : ''}`);
    } else {
      console.log(`[COMPARISON WORKER] No previous article available for comparison`);
    }

    // Get formatted prompts from PromptManager
    const promptVariables = {
      indexName,
      articleId: article_id,
      article,
      timestamp,
      question,
      intent,
      historicalScores,
      previousArticle,
      previousFilename,
      previousTimestamp
    };

    const prompts = await PromptManager.getPrompt('workers', 'comparison', promptVariables);

    const response = await callReasoningModel(prompts.system, prompts.user, '[COMPARISON WORKER]');
    
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
        
        // Ensure the score_name matches the provided indexName
        output.score_name = indexName;
        console.log(`[COMPARISON WORKER] Using provided index name: ${indexName}`);
        
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
    const previousArticle = taskPayload.previousArticle || '';
    const previousFilename = taskPayload.previousFilename;
    const previousTimestamp = taskPayload.previousTimestamp;
    
    // Log previous article info for debugging
    if (previousArticle && previousFilename) {
      console.log(`[RESEARCH WORKER] Using previous article: ${previousFilename}`);
      console.log(`[RESEARCH WORKER] Previous article preview: ${previousArticle.substring(0, 150)}${previousArticle.length > 150 ? '...' : ''}`);
    } else {
      console.log(`[RESEARCH WORKER] No previous article available for comparison`);
    }
    
    // Get formatted prompts from PromptManager
    const promptVariables = {
      articleId: article_id,
      article,
      timestamp,
      question,
      intent,
      historicalResearch,
      previousArticle,
      previousFilename,
      previousTimestamp
    };

    const prompts = await PromptManager.getPrompt('workers', 'research', promptVariables);
    console.log(`[RESEARCH WORKER] Using PromptManager for research worker`);

    const response = await callReasoningModel(prompts.system, prompts.user, '[RESEARCH WORKER]');
    
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
    
    // First, generate a proper title for the article using PromptManager
    const titlePromptVariables = { question, intent };
    const titlePrompts = await PromptManager.getPrompt('workers', 'writing.title', titlePromptVariables);
    console.log(`[WRITING WORKER] Using PromptManager for title generation`);

    const titleResponse = await callReasoningModel(titlePrompts.system, titlePrompts.user, '[WRITING WORKER - TITLE]');
    
    const articleTitle = titleResponse.text || question;
    console.log('[WRITING WORKER] Generated article title:', articleTitle);
    
    // Generate the article using PromptManager
    const articlePromptVariables = {
      question,
      intent,
      historicalResearch,
      articleIdMap: JSON.stringify(articleIdMap, null, 2),
      timestampMap: JSON.stringify(timestampMap, null, 2)
    };
    const articlePrompts = await PromptManager.getPrompt('workers', 'writing.article', articlePromptVariables);
    console.log(`[WRITING WORKER] Using PromptManager for article generation`);

    const articleResponse = await callWritingModel(articlePrompts.system, articlePrompts.user, '[WRITING WORKER - ARTICLE]');
    
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
category: "change_statement"
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