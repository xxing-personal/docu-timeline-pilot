import fs from 'fs/promises';
import path from 'path';

interface PromptTemplate {
  system: string;
  user: string;
  variables?: string[];
  customizations?: Record<string, any>;
}

interface PromptVariables {
  [key: string]: any;
}

interface PromptConfig {
  version: string;
  description: string;
  prompts: {
    [category: string]: {
      [type: string]: PromptTemplate;
    };
  };
  metadata?: {
    lastModified: string;
    modifiedBy: string;
    notes: string;
  };
}

export class PromptManager {
  private static loadedConfig: PromptConfig | null = null;
  private static configPath = path.join(process.cwd(), 'api', 'prompts.config.json');

  private static prompts = {
    // Intent Analysis Prompts
    intentAnalysis: {
      indices: {
        system: 'You are a helpful assistant for analyzing user intent for document analysis tasks.',
        user: `You are analyzing a user query for an indices creation agent. The agent will analyze PDF documents and create scoring indices based on the user's question.

User Query: "{{userQuery}}"

Please provide:
1. A clear analysis of what the users' intent. 
2. A concise, descriptive name for this indices creation task (max 50 characters)
3. A consistent index name that will be used for ALL documents analyzed in this task (max 40 characters, descriptive but concise)

Output as JSON (do not wrap in markdown code blocks):
{
  "intent": "brief analysis of what user wants to measure",
  "taskName": "concise task name", 
  "indexName": "consistent index name for all documents"
}`,
        variables: ['userQuery']
      },
      
      deepResearch: {
        system: 'You are a helpful assistant for analyzing user intent for research tasks.',
        user: `You are analyzing a user query for a deep research agent. The agent will analyze PDF documents to answer research questions.

User Query: "{{userQuery}}"

Please provide:
1. A clear analysis of what the user wants to research and understand.
2. A concise, descriptive name for this research task (max 50 characters)

Output as JSON (do not wrap in markdown code blocks):
{
  "intent": "brief analysis of research objective",
  "taskName": "concise task name"
}`,
        variables: ['userQuery']
      },
      
      changeStatement: {
        system: 'You are a helpful assistant for analyzing user intent for statement change analysis tasks.',
        user: `You are analyzing a user query for a change of statement agent. The agent will analyze PDF documents to identify and track changes in language, tone, messaging, or statements over time.

User Query: "{{userQuery}}"

Please provide:
1. A clear analysis of what changes in statements/language the user wants to track.
2. A concise, descriptive name for this statement change analysis task (max 50 characters)
3. A consistent analysis name that will be used for ALL documents analyzed in this task (max 40 characters, descriptive but concise)

Output as JSON (do not wrap in markdown code blocks):
{
  "intent": "brief analysis of what statement changes to track",
  "taskName": "concise task name",
  "analysisName": "consistent analysis name for all documents"
}`,
        variables: ['userQuery']
      }
    },

    // Worker Prompts
    workers: {
      comparison: {
        system: 'You are a helpful assistant for document analysis. You are good at quantitative analysis and when you quantify values, you should always round to two decimal places.',
        user: `## Purpose
You are given an article and you need to create a score based on users' inquiry and intent. 

## Background
This article is part of a time series of articles that talk about similar or related topics. We have had similar agents review the previous articles. From that reading, they quoted some sentences from the articles, wrote down the rationale and gave a score based on that article. Now it is your turn to conduct this quantification process.

## Steps
1. First read all historical generation if there is any. You need to take a look at quotes (cited from the doc), rationale (how this score is generated), and try to understand how this score is generated
2. Secondly you need to read the current article and previous article, spot the differences for the statement related to user inquiry, and understand the change of tones or statement. 
3. Based on your understanding of previous steps, give a score for user inquiry on current article. Be consistent with historical scoring patterns and generation logic but allow for value changes over time. Please do not hesitate to give score outside historical range -- it is really normal.
4. Besides the score, extract several pieces of quotes from the article that support your score. Cite the original sentences. Also extract some key change in tones. Also put down your rationale for the score for future generation.

{{#if knowledge}}
## Knowledge
{{knowledge}}
{{/if}}

## Output format
The output must be a single valid JSON object, with all keys and string values double-quoted, and arrays in square brackets. Do not use markdown, YAML, or any other formatting.

IMPORTANT: You must use "{{indexName}}" as the score_name. Do not generate a different name.

Example output:
{
  "score_name": "{{indexName}}",
  "score_value": 0.7342,
  "article_id": "{{articleId}}",
  "quotes": [
    "Inflation remained elevated.",
    "Participants agreed that inflation was unacceptably high and noted that the data indicated that declines in inflation had been slower than they had expected.",
    "Participants generally noted that economic activity had continued to expand at a modest pace but there were some signs that supply and demand in the labor market were coming into better balance."
  ],
  "Key Differences": [
    {"last": "inflation remains high", "current": "inflation remains elevated"},
    {"last": "aaaaa", "current":"aaaaab"}
  ],
  "rational": "The score of 0.7342 reflects a moderately high concern about inflation, consistent with the language used in the document. This score is slightly higher than the previous month due to the explicit mention of elevated inflation levels and slower-than-expected declines."
}

Article:
{{#if timestamp}}Document Timestamp: {{timestamp}}{{/if}}

{{article}}

User inquiry: {{question}}
{{#if intent}}Intent: {{intent}}{{/if}}

Historical Generation: 
{{#if historicalScores}}{{historicalScores}}{{/if}}

{{#if previousArticle}}
Previous Article:
{{#if previousTimestamp}}Previous Document Timestamp: {{previousTimestamp}}{{/if}}
Previous Document: {{previousFilename}}

{{previousArticle}}

Please consider the previous article when analyzing the current document for trends, changes, or comparisons.
{{else}}
Previous Article: No previous document available for comparison.
{{/if}}

Output only the JSON object as described above. Do not wrap it in markdown code blocks or any other formatting.`,
        variables: ['knowledge', 'indexName', 'articleId', 'article', 'timestamp', 'question', 'intent', 'historicalScores', 'previousArticle', 'previousFilename', 'previousTimestamp']
      },

      research: {
        system: 'You are a helpful assistant for research and summarization.',
        user: `You are given an article and user inquiries, and you are reading documents to answer user's question or fulfill the inquiries.

## Background
The user has provided a research question and you need to analyze documents in chronological order to provide insights and track developments over time.

1. Write a small paragraph to answer the question, referring to the article. Take into account the historical research context if relevant. Be concise and informative. Try to get as much incremental information as possible from the article compared to historical research context.
2. Extract several pieces of quotes from the article that support your answer. Cite the original sentences.
3. The output must be a single valid JSON object, with all keys and string values double-quoted, and arrays in square brackets. Do not use markdown, YAML, or any other formatting.

Example output:
{
  "answer": "The FOMC minutes indicate continued concerns about elevated inflation levels, with participants noting that inflation declines have been slower than expected. However, there are signs of improvement in labor market balance and economic activity continues to expand modestly.",
  "article_id": "{{articleId}}",
  "quotes": [
    "Inflation remained elevated.",
    "Participants agreed that inflation was unacceptably high and noted that the data indicated that declines in inflation had been slower than they had expected.",
    "Participants generally noted that economic activity had continued to expand at a modest pace but there were some signs that supply and demand in the labor market were coming into better balance."
  ],
  "rational": "The analysis shows both ongoing inflation concerns and emerging positive indicators, suggesting a cautious but potentially improving outlook compared to previous assessments."
}

Article:
{{#if timestamp}}Document Timestamp: {{timestamp}}{{/if}}

{{article}}

Question: {{question}}
{{#if intent}}Intent: {{intent}}{{/if}}

Historical Research Context: 
{{historicalResearch}}

{{#if previousArticle}}
Previous Article:
{{#if previousTimestamp}}Previous Document Timestamp: {{previousTimestamp}}{{/if}}
Previous Document: {{previousFilename}}

{{previousArticle}}

Please compare the current article with the previous article to identify key developments, changes, or continuities in the research topic.
{{else}}
Previous Article: No previous document available for comparison.
{{/if}}

Output only the JSON object as described above. Do not wrap it in markdown code blocks or any other formatting.`,
        variables: ['articleId', 'timestamp', 'article', 'question', 'intent', 'historicalResearch', 'previousArticle', 'previousFilename', 'previousTimestamp']
      },

      changeStatement: {
        system: 'You are a helpful assistant for analyzing changes in statements, language, tone, and messaging in documents.',
        user: `You are analyzing a document to identify changes in statements, language, tone, or messaging. Your task is to track qualitative changes in how concepts are discussed, framed, or presented.

1. Analyze the document for statements, language patterns, tone, and messaging related to the focus area.
2. Compare with historical analysis to identify changes, evolution, or shifts in approach.
3. If a previous article is available, pay special attention to direct comparisons between the current and previous documents.
4. Extract specific quotes that demonstrate these changes or continuities.
5. The output must be a single valid JSON object, with all keys and string values double-quoted, and arrays in square brackets. Do not use markdown, YAML, or any other formatting.

IMPORTANT: You must use "{{analysisName}}" as the analysis_name. Do not generate a different name.

Example output:
{
  "analysis_name": "{{analysisName}}",
  "change_type": "Increased dovish language and forward guidance clarity",
  "article_id": "{{articleId}}",
  "quotes": [
    "The Committee will continue to monitor the implications of incoming information for the economic outlook.",
    "The Committee is prepared to adjust the stance of monetary policy as appropriate if risks emerge that could impede the attainment of the Committee's goals.",
    "The Committee expects to maintain this target range until labor market conditions have reached levels consistent with the Committee's assessments."
  ],
  "change_description": "This document shows a notable shift toward more explicit forward guidance compared to earlier communications. The language has become more specific about conditions for policy changes, moving away from general statements to concrete economic indicators.",
  "comparison_context": "Previous documents used more general language about 'monitoring conditions' while this document provides specific criteria and expectations, indicating a strategic shift toward greater transparency in monetary policy communication."
}

Article:
{{#if timestamp}}Document Timestamp: {{timestamp}}{{/if}}

{{article}}

Question: {{question}}
{{#if intent}}Intent: {{intent}}{{/if}}

Historical Analysis:
{{#if historicalAnalysis}}{{historicalAnalysis}}{{else}}No previous analysis available.{{/if}}

{{#if previousArticle}}
Previous Article for Direct Comparison:
{{#if previousTimestamp}}Previous Document Timestamp: {{previousTimestamp}}{{/if}}
Previous Document: {{previousFilename}}

{{previousArticle}}

Please analyze the current document in the context of this previous document, identifying specific changes in language, tone, statements, or messaging. Focus on how the approach, framing, or emphasis has evolved between these two documents.
{{else}}
Previous Article: No previous document available for direct comparison.
{{/if}}

Output only the JSON object as described above. Do not wrap it in markdown code blocks or any other formatting.`,
        variables: ['analysisName', 'articleId', 'timestamp', 'article', 'question', 'intent', 'historicalAnalysis', 'previousArticle', 'previousFilename', 'previousTimestamp']
      },

      writingTitle: {
        system: 'You are a helpful assistant for generating professional research article titles.',
        user: `Based on this research question and intent, generate a clear, professional title for a research article:

Question: {{question}}
Intent: {{intent}}

Generate a concise, descriptive title (max 60 characters) that would be appropriate for a professional research article. 
Return only the title, no quotes or additional text.`,
        variables: ['question', 'intent']
      },

      writingArticle: {
        system: 'You are an expert research analyst and writer specializing in comprehensive, evidence-based research articles.',
        user: `You are an expert research analyst writing a comprehensive research article. Based on the provided research context from multiple documents, create a professional, well-structured markdown article.

Research Question: {{question}}
{{#if intent}}Research Intent: {{intent}}{{/if}}

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
{{historicalResearch}}

Article ID Map (for citation):
{{articleIdMap}}

Timestamp Map (for chronological context):
{{timestampMap}}

Generate the complete markdown article following the structure and requirements above.`,
        variables: ['question', 'intent', 'historicalResearch', 'articleIdMap', 'timestampMap']
      }
    }
  };

  /**
   * Load prompts from configuration file if available
   */
  static async loadConfig(): Promise<void> {
    try {
      const configExists = await fs.access(this.configPath).then(() => true).catch(() => false);
      
      if (configExists) {
        const configData = await fs.readFile(this.configPath, 'utf-8');
        this.loadedConfig = JSON.parse(configData);
        console.log(`[PROMPT MANAGER] Loaded configuration from: ${this.configPath}`);
        console.log(`[PROMPT MANAGER] Config version: ${this.loadedConfig?.version}`);
      } else {
        console.log(`[PROMPT MANAGER] No configuration file found at: ${this.configPath}`);
        console.log(`[PROMPT MANAGER] Using default prompts`);
      }
    } catch (error) {
      console.error(`[PROMPT MANAGER] Error loading configuration:`, error);
      console.log(`[PROMPT MANAGER] Falling back to default prompts`);
      this.loadedConfig = null;
    }
  }

  /**
   * Get a formatted prompt by category and type
   */
  static async getPrompt(category: 'intentAnalysis' | 'workers', type: string, variables: PromptVariables = {}): Promise<{ system: string; user: string }> {
    // Load config if not already loaded
    if (this.loadedConfig === null) {
      await this.loadConfig();
    }

    // Try to get prompt from config first, then fall back to defaults
    let promptTemplate: PromptTemplate | undefined;
    
    if (this.loadedConfig?.prompts?.[category]?.[type]) {
      promptTemplate = this.loadedConfig.prompts[category][type];
      console.log(`[PROMPT MANAGER] Using config prompt: ${category}.${type}`);
    } else {
      promptTemplate = (this.prompts as any)[category]?.[type];
      console.log(`[PROMPT MANAGER] Using default prompt: ${category}.${type}`);
    }
    
    if (!promptTemplate) {
      throw new Error(`Prompt not found: ${category}.${type}`);
    }

    return {
      system: this.formatTemplate(promptTemplate.system, variables),
      user: this.formatTemplate(promptTemplate.user, variables)
    };
  }

  /**
   * Format a template string with variables using Handlebars-like syntax
   */
  private static formatTemplate(template: string, variables: PromptVariables): string {
    let formatted = template;

    // Replace simple variables {{variable}}
    Object.keys(variables).forEach(key => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      formatted = formatted.replace(regex, variables[key] || '');
    });

    // Handle conditional blocks {{#if variable}}...{{/if}}
    formatted = formatted.replace(/{{#if\s+(\w+)}}([\s\S]*?){{\/if}}/g, (match, variable, content) => {
      return variables[variable] ? content : '';
    });

    // Handle conditional blocks with else {{#if variable}}...{{else}}...{{/if}}
    formatted = formatted.replace(/{{#if\s+(\w+)}}([\s\S]*?){{else}}([\s\S]*?){{\/if}}/g, (match, variable, ifContent, elseContent) => {
      return variables[variable] ? ifContent : elseContent;
    });

    return formatted;
  }

  /**
   * Get available prompt categories and types
   */
  static async getAvailablePrompts(): Promise<{ [category: string]: string[] }> {
    await this.loadConfig();
    
    const result: { [category: string]: string[] } = {};
    const source = this.loadedConfig?.prompts || this.prompts;
    
    Object.keys(source).forEach(category => {
      result[category] = Object.keys((source as any)[category] || {});
    });
    
    return result;
  }

  /**
   * Get variables required for a specific prompt
   */
  static async getPromptVariables(category: 'intentAnalysis' | 'workers', type: string): Promise<string[]> {
    await this.loadConfig();
    
    const promptTemplate = this.loadedConfig?.prompts?.[category]?.[type] || (this.prompts as any)[category]?.[type];
    return promptTemplate?.variables || [];
  }

  /**
   * Validate that all required variables are provided
   */
  static async validateVariables(category: 'intentAnalysis' | 'workers', type: string, variables: PromptVariables): Promise<{ isValid: boolean; missing: string[] }> {
    const required = await this.getPromptVariables(category, type);
    const provided = Object.keys(variables);
    const missing = required.filter(req => !provided.includes(req));
    
    return {
      isValid: missing.length === 0,
      missing
    };
  }

  /**
   * Get prompt preview (first 200 chars) for debugging
   */
  static async getPromptPreview(category: 'intentAnalysis' | 'workers', type: string): Promise<{ system: string; user: string }> {
    const prompts = await this.getPrompt(category, type, {});
    
    return {
      system: prompts.system.substring(0, 200) + (prompts.system.length > 200 ? '...' : ''),
      user: prompts.user.substring(0, 200) + (prompts.user.length > 200 ? '...' : '')
    };
  }

  /**
   * Reload configuration from file
   */
  static async reloadConfig(): Promise<void> {
    this.loadedConfig = null;
    await this.loadConfig();
  }

  /**
   * Get configuration info
   */
  static getConfigInfo(): { usingConfig: boolean; version?: string; configPath: string } {
    return {
      usingConfig: this.loadedConfig !== null,
      version: this.loadedConfig?.version,
      configPath: this.configPath
    };
  }
} 