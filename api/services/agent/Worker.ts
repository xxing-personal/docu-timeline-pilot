import { Memory } from './memory';
import { MemoryDatabaseService } from './memoryDatabaseService';
import OpenAI from 'openai';

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
    // Call subclass-specific logic
    const result = await this.coreProcess(taskPayload, context);
    // Add result to memory
    await this.memory.add(typeof result === 'string' ? result : JSON.stringify(result));
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
  protected async coreProcess(taskPayload: any, context: string): Promise<object> {
    // Use OpenAI API to analyze the article
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
    const question = taskPayload.question || '';
    const article = taskPayload.article || '';
    const historicalScores = context;
    const article_id = taskPayload.article_id || '';
    const prompt = `
You are given an article.

1. Please provide a score based on the question and the historical scores, please do not change name if there is historical scores. if there is no historical scores, please provide a score based on the question and the artical, and comeup with a score name. 
2. Please also extract several pieces of evidence on how the article is discussing this and why you are giving this score. Please CITE the original sentences.
3. The output should look like:
{score_name: name of the score; 
score_value: val between -1 and 1; 
article_id: ${article_id};
evidence: original sentence from the article, in bullet's point, be concise; 
rational: your thinking why this score is given, especially compare with historical, 1-2 sentence}

Article:
${article}

Question: ${question}

Historical Scores: 
${historicalScores}

Please output only the JSON object as described above.
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
      output = JSON.parse(text);
      if (output.score_name && output.score_value !== undefined) {
        scoreSummary = `${output.score_name}: ${output.score_value}`;
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
    const article = taskPayload.article || '';
    const article_id = taskPayload.article_id || '';
    const historicalResearch = context;
    const question = taskPayload.question || '';
    const prompt = `
You are given an article and some historical research context.

Please write a small paragraph summary of the article, taking into account the historical research context if relevant. Be concise and informative.
1. Please write a small paragraph to answer the question, refering to the article. Taking into account the historical research context if relevant. Be concise and informative. try to get as much as incremental information you have from the article comparing to historical research context.
2. Please also extract several pieces of evidence on how the article is discussing this and why you are giving this answer. Please CITE the original sentences.
3. The output should look like:
{answer: answer of the score; 
artical_id: ${article_id}; 
evidence: original sentence from the article, in bullet's point, be concise; 
rational: your thinking why this score is given, especially compare with historical, 1-2 sentence}

Article:
${article}

Question: ${question}

Historical Scores: 
${historicalResearch}


Output only the summary paragraph as plain text.
`;
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a helpful assistant for research and summarization.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 256,
      temperature: 0.3,
    });
    let output: any = {};
    let summary = '';
    try {
      const text = completion.choices[0]?.message?.content || '';
      output = JSON.parse(text);
      if (output.answer) {
        summary = output.answer;
      }
    } catch (e) {
      output = { error: 'Failed to parse OpenAI output as JSON', raw: completion.choices[0]?.message?.content };
    }
    return { ...output, summary };
  }
}

export class WritingWorker extends Worker {
  protected async coreProcess(taskPayload: any, context: string): Promise<object> {
    // Use OpenAI API to generate a long markdown article
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
    const question = taskPayload.question || '';
    const historicalResearch = context;
    // Optionally, pass in a mapping of article ids to article titles for citation
    const articleIdMap = taskPayload.articleIdMap || {};
    const prompt = `
You are a writing assistant. Given the following historical research context, generate a long, detailed markdown article that answers the question. The article should:
- Be in markdown format
- Reference and cite specific articles by their article id (use [^article_id] for citation)
- Include a references section at the end listing all cited article ids and their titles (if available)

Question:
${question}

Historical Research Context:
${historicalResearch}

Article ID Map (for citation):
${JSON.stringify(articleIdMap, null, 2)}

Output only the markdown article.
`;
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a helpful assistant for research writing and markdown generation.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 2048,
      temperature: 0.7,
    });
    let article = '';
    try {
      article = completion.choices[0]?.message?.content?.trim() || '';
    } catch (e) {
      article = 'Failed to generate article.';
    }
    return { article };
  }
} 