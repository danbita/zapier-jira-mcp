import OpenAI from 'openai';
import { OPENAI_API_KEY } from './config';

export interface ExtractedParameter {
  value: string | null;
  confidence: number;
  source: 'ai_extracted' | 'user_confirmed' | 'follow_up_question';
}

export interface ExtractedParameters {
  title: ExtractedParameter;
  type: ExtractedParameter;
  project: ExtractedParameter;
  priority: ExtractedParameter;
  description: ExtractedParameter;
}

export class AIParameterExtractor {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  }

  async extractParameters(userInput: string): Promise<ExtractedParameters> {
    try {
      console.log('🤖 Analyzing user input with AI...');
      
      const extractionPrompt = this.buildExtractionPrompt(userInput);
      
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert at extracting structured data from natural language requests for Jira issue creation. Always respond with valid JSON only.'
          },
          {
            role: 'user',
            content: extractionPrompt
          }
        ],
        max_tokens: 800,
        temperature: 0.1, // Low temperature for consistent extraction
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        throw new Error('No response from AI extraction');
      }

      console.log('📋 AI extraction response:', response);
      
      const extracted = this.parseAIResponse(response);
      this.logExtractionResults(extracted);
      
      return extracted;

    } catch (error) {
      console.error('❌ AI extraction failed:', error);
      return this.createEmptyExtraction();
    }
  }

  private buildExtractionPrompt(userInput: string): string {
    return `Analyze this user request for creating a Jira issue and extract parameters:

"${userInput}"

Extract these parameters ONLY if they are clearly and explicitly mentioned:

TITLE: The issue title/summary (exact text in quotes, or clear subject)
TYPE: Must be exactly one of: Bug, Task, Story, Epic (case-sensitive)
PROJECT: Project name, code, or identifier (common abbreviations: demo→Demo, eng→Engineering)
PRIORITY: Must be exactly one of: Lowest, Low, Medium, High, Highest (case-sensitive)  
DESCRIPTION: Detailed explanation, steps to reproduce, or additional context

Confidence scoring (0.0-1.0):
- 1.0: Explicitly stated with clear keywords
- 0.8: Strongly implied with high certainty
- 0.6: Reasonably inferred from context
- 0.4: Weakly suggested
- 0.2: Very uncertain
- 0.0: Not mentioned or completely unclear

RESPOND WITH VALID JSON ONLY:
{
  "title": { "value": "extracted title" | null, "confidence": 0.9 },
  "type": { "value": "Bug" | null, "confidence": 0.8 },
  "project": { "value": "Demo" | null, "confidence": 0.7 },
  "priority": { "value": "High" | null, "confidence": 0.6 },
  "description": { "value": "extracted description" | null, "confidence": 0.5 }
}

Examples:
- "Create a bug called 'Login broken'" → title: "Login broken", type: "Bug"
- "High priority task for demo project" → type: "Task", priority: "High", project: "Demo"
- "Make an issue about API timeout with detailed error logs" → title: "API timeout", description: "detailed error logs"

DO NOT invent information. Only extract what is clearly present. Use null for missing parameters.`;
  }

  private parseAIResponse(response: string): ExtractedParameters {
    try {
      // Clean the response to ensure valid JSON
      let cleanResponse = response.trim();
      
      // Remove any markdown code blocks
      cleanResponse = cleanResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      
      // Try to find JSON object in the response
      const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanResponse = jsonMatch[0];
      }

      const parsed = JSON.parse(cleanResponse);
      
      // Validate and normalize the structure
      return {
        title: this.normalizeParameter(parsed.title),
        type: this.normalizeParameter(parsed.type),
        project: this.normalizeParameter(parsed.project),
        priority: this.normalizeParameter(parsed.priority),
        description: this.normalizeParameter(parsed.description)
      };

    } catch (error) {
      console.error('❌ Failed to parse AI response:', error);
      console.error('Raw response:', response);
      return this.createEmptyExtraction();
    }
  }

  private normalizeParameter(param: any): ExtractedParameter {
    if (!param || typeof param !== 'object') {
      return { value: null, confidence: 0, source: 'ai_extracted' };
    }

    return {
      value: param.value || null,
      confidence: Math.max(0, Math.min(1, param.confidence || 0)),
      source: 'ai_extracted'
    };
  }

  private createEmptyExtraction(): ExtractedParameters {
    return {
      title: { value: null, confidence: 0, source: 'ai_extracted' },
      type: { value: null, confidence: 0, source: 'ai_extracted' },
      project: { value: null, confidence: 0, source: 'ai_extracted' },
      priority: { value: null, confidence: 0, source: 'ai_extracted' },
      description: { value: null, confidence: 0, source: 'ai_extracted' }
    };
  }

  private logExtractionResults(extracted: ExtractedParameters): void {
    console.log('🎯 AI Extraction Results:');
    
    Object.entries(extracted).forEach(([key, param]) => {
      if (param.value && param.confidence > 0.3) {
        const confidenceIcon = param.confidence >= 0.8 ? '✅' : param.confidence >= 0.6 ? '🟡' : '🟠';
        console.log(`   ${confidenceIcon} ${key}: "${param.value}" (${(param.confidence * 100).toFixed(0)}%)`);
      } else {
        console.log(`   ❌ ${key}: not detected`);
      }
    });
    console.log('');
  }

  // Helper method to identify which parameters still need to be collected
  identifyMissingParameters(extracted: ExtractedParameters, confidenceThreshold: number = 0.6): string[] {
    const missing: string[] = [];
    
    Object.entries(extracted).forEach(([key, param]) => {
      if (!param.value || param.confidence < confidenceThreshold) {
        missing.push(key);
      }
    });

    console.log(`📋 Missing parameters (confidence < ${confidenceThreshold * 100}%):`, missing);
    return missing;
  }

  // Validate extracted parameters against known valid values
  validateExtractedParameters(extracted: ExtractedParameters): ExtractedParameters {
    const validated = { ...extracted };

    // Validate issue type
    if (validated.type.value) {
      const validTypes = ['Bug', 'Task', 'Story', 'Epic'];
      if (!validTypes.includes(validated.type.value)) {
        console.log(`⚠️  Invalid type "${validated.type.value}", marking as uncertain`);
        validated.type.confidence = Math.min(validated.type.confidence, 0.3);
      }
    }

    // Validate priority
    if (validated.priority.value) {
      const validPriorities = ['Lowest', 'Low', 'Medium', 'High', 'Highest'];
      if (!validPriorities.includes(validated.priority.value)) {
        console.log(`⚠️  Invalid priority "${validated.priority.value}", marking as uncertain`);
        validated.priority.confidence = Math.min(validated.priority.confidence, 0.3);
      }
    }

    // Validate project (basic check)
    if (validated.project.value) {
      // Map common abbreviations to full names
      const projectMapping: { [key: string]: string } = {
        'demo': 'FV Demo (Issues)',
        'fvdemo': 'FV Demo (Issues)',
        'engineering': 'FV Engineering',
        'eng': 'FV Engineering',
        'product': 'FV Product'
      };

      const normalizedProject = validated.project.value.toLowerCase();
      if (projectMapping[normalizedProject]) {
        validated.project.value = projectMapping[normalizedProject];
        console.log(`📂 Mapped project "${normalizedProject}" → "${validated.project.value}"`);
      }
    }

    return validated;
  }

  // Build a context phrase for follow-up questions
  buildContextPhrase(extracted: ExtractedParameters): string {
    const parts: string[] = [];
    
    if (extracted.type.value && extracted.type.confidence >= 0.6) {
      parts.push(`${extracted.type.value.toLowerCase()}`);
    } else {
      parts.push('issue');
    }

    if (extracted.title.value && extracted.title.confidence >= 0.6) {
      parts.push(`titled "${extracted.title.value}"`);
    }

    if (extracted.project.value && extracted.project.confidence >= 0.6) {
      parts.push(`in ${extracted.project.value} project`);
    }

    if (extracted.priority.value && extracted.priority.confidence >= 0.6) {
      parts.push(`with ${extracted.priority.value.toLowerCase()} priority`);
    }

    if (parts.length > 1) {
      return `I'll create a ${parts.join(' ')}`;
    } else {
      return 'For this issue';
    }
  }
}