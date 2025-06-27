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
    const prompt = `
You are given an article.

1. Please provide a score based on the question and the historical scores, please do not change name if there is historical scores. if there is no historical scores, please provide a score based on the question and the artical, and comeup with a score name. 
2. Please also extract several pieces of evidence on how the article is discussing this and why you are giving this score. Please CITE the original sentences.
3. The output should look like:
{score_name: name of the score; 
score_value: val between -1 and 1; 
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
    const historicalResearch = context;
    const prompt = `
You are given an article and some historical research context.

Please write a small paragraph summary of the article, taking into account the historical research context if relevant. Be concise and informative.

Article:
${article}

Historical Research Context:
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
    let summary = '';
    try {
      summary = completion.choices[0]?.message?.content?.trim() || '';
    } catch (e) {
      summary = 'Failed to generate summary.';
    }
    return { summary };
  }
}

export class WritingWorker extends Worker {
  protected async coreProcess(taskPayload: any, context: string): Promise<string> {
    // TODO: implement writing logic using context and taskPayload
    return `Writing result (stub) with context length ${context.length}`;
  }
} 