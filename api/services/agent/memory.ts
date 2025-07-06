import OpenAI from 'openai';

export type ShrinkMode = 'truncate' | 'compress';

export class Memory {
  private context: string;
  private maxLength: number;
  private openai: OpenAI;
  private shrinkMode: ShrinkMode;
  private id: string;

  constructor(id: string, initialContext = '', maxLength = 10000, shrinkMode: ShrinkMode = 'truncate') {
    this.id = id;
    this.context = initialContext;
    this.maxLength = maxLength;
    this.shrinkMode = shrinkMode;
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  }

  setShrinkMode(mode: ShrinkMode) {
    this.shrinkMode = mode;
  }

  async add(text: string) {
    this.context += text;
    if (this.context.length > this.maxLength) {
      if (this.shrinkMode === 'compress') {
        this.compress();
      } else {
        this.truncate();
      }
    }
    // Saving to file removed; use MemoryDatabaseService for persistence
  }

  getContext() {
    return this.context;
  }

  truncate() {
    if (this.context.length > this.maxLength) {
      this.context = this.context.slice(this.context.length - this.maxLength);
    }
  }

  async compress() {
    const targetLength = Math.floor(this.maxLength / 2);
    const prompt = `The following is a long context string. Please compress or summarize it to fit within ${targetLength} characters, preserving as much important information as possible.\n\nContext:\n${this.context}`;
    const completion = await this.openai.chat.completions.create({
              model: 'o4-mini',
      messages: [
        { role: 'system', content: 'You are a helpful assistant that compresses and summarizes text.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: Math.floor(targetLength / 4),
      temperature: 0.3,
    });
    this.context = completion.choices[0]?.message?.content || this.context;
    this.truncate();
  }
} 