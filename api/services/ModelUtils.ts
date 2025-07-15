import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export interface OpenAIResponse {
  text: string;
  success: boolean;
  error?: string;
}

/**
 * Call OpenAI o4-mini model for reasoning tasks (analysis, comparison, JSON extraction, etc.)
 * Uses medium effort reasoning
 */
export async function callReasoningModel(
  systemPrompt: string, 
  userPrompt: string,
  logPrefix: string = '[REASONING MODEL]'
): Promise<OpenAIResponse> {
  try {
    console.log(`${logPrefix} Making API call to o4-mini reasoning model`);
    
    const completion = await openai.responses.create({
      model: 'o4-mini',
      reasoning: { effort: 'medium' },
      input: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    });
    
    console.log(`${logPrefix} API Response:`, JSON.stringify(completion, null, 2));
    
    const text = completion.output_text?.trim() || '';
    console.log(`${logPrefix} Response text length:`, text.length);
    console.log(`${logPrefix} Response preview:`, text.substring(0, 200) + '...');
    
    if (!text) {
      console.warn(`${logPrefix} Empty response from OpenAI`);
      return {
        text: '',
        success: false,
        error: 'Empty response from OpenAI'
      };
    }
    
    return {
      text,
      success: true
    };
    
  } catch (error) {
    console.error(`${logPrefix} Error calling OpenAI API:`, error);
    return {
      text: '',
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Call OpenAI gpt-4o-mini model for writing tasks (article generation, long-form content)
 * Uses regular completion without reasoning for faster, more direct writing
 */
export async function callWritingModel(
  systemPrompt: string, 
  userPrompt: string,
  logPrefix: string = '[WRITING MODEL]'
): Promise<OpenAIResponse> {
  try {
    console.log(`${logPrefix} Making API call to gpt-4o-mini writing model`);
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 4000
    });
    
    console.log(`${logPrefix} API Response:`, JSON.stringify(completion, null, 2));
    
    const text = completion.choices[0]?.message?.content?.trim() || '';
    console.log(`${logPrefix} Response text length:`, text.length);
    console.log(`${logPrefix} Response preview:`, text.substring(0, 500) + '...');
    
    if (!text) {
      console.warn(`${logPrefix} Empty response from OpenAI`);
      return {
        text: '',
        success: false,
        error: 'Empty response from OpenAI'
      };
    }
    
    return {
      text,
      success: true
    };
    
  } catch (error) {
    console.error(`${logPrefix} Error calling OpenAI API:`, error);
    return {
      text: '',
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Helper function to extract JSON from OpenAI response that might be wrapped in markdown
 */
export function extractJsonFromResponse(text: string): string {
  // Try to extract JSON from markdown code blocks if present
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }
  
  // If no code blocks, return the text as-is
  return text.trim();
} 