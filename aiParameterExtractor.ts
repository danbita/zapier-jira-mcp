import OpenAI from 'openai';
import { OPENAI_API_KEY } from './config';

export interface ExtractedParameter {
  value: string | null;
  confidence: number;
  source: 'ai_extracted' | 'user_confirmed' | 'follow_up_question' | 'default';
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
      
      // Pre-process input to help AI better identify project location
      const preprocessedInput = this.preprocessProjectMentions(userInput);
      
      const extractionPrompt = this.buildExtractionPrompt(preprocessedInput);
      
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert at extracting structured data from natural language requests for Jira issue creation. Pay special attention to project names that appear after location words like "in", "for", "to". Always respond with valid JSON only.'
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
      
      // Apply defaults for missing parameters
      const extractedWithDefaults = this.applyDefaults(extracted);
      
      this.logExtractionResults(extractedWithDefaults);
      
      return extractedWithDefaults;

    } catch (error) {
      console.error('❌ AI extraction failed:', error);
      return this.createDefaultExtraction();
    }
  }

  // NEW: Preprocess input to highlight project mentions for better AI extraction
  private preprocessProjectMentions(userInput: string): string {
    let processed = userInput;
    
    // Add explicit markers around project mentions to help AI identify them
    const projectPatterns = [
      { pattern: /\bin\s+(fv\s+demo\s+product)\b/gi, replacement: 'in [PROJECT:FV Demo Product]' },
      { pattern: /\bin\s+(demo\s+product)\b/gi, replacement: 'in [PROJECT:FV Demo Product]' },
      { pattern: /\bin\s+(fv\s+product)\b/gi, replacement: 'in [PROJECT:FV Product]' },
      { pattern: /\bin\s+(fv\s+engineering)\b/gi, replacement: 'in [PROJECT:FV Engineering]' },
      { pattern: /\bin\s+(engineering)\b/gi, replacement: 'in [PROJECT:FV Engineering]' },
      { pattern: /\bin\s+(fv\s+demo\s+issues)\b/gi, replacement: 'in [PROJECT:FV Demo Issues]' },
      { pattern: /\bin\s+(demo\s+issues)\b/gi, replacement: 'in [PROJECT:FV Demo Issues]' },
      { pattern: /\bin\s+(demo)\b/gi, replacement: 'in [PROJECT:FV Demo Issues]' },
      
      // Handle "for" and "to" patterns as well
      { pattern: /\bfor\s+(fv\s+demo\s+product)\b/gi, replacement: 'for [PROJECT:FV Demo Product]' },
      { pattern: /\bfor\s+(demo\s+product)\b/gi, replacement: 'for [PROJECT:FV Demo Product]' },
      { pattern: /\bfor\s+(fv\s+product)\b/gi, replacement: 'for [PROJECT:FV Product]' },
      { pattern: /\bfor\s+(fv\s+engineering)\b/gi, replacement: 'for [PROJECT:FV Engineering]' },
      { pattern: /\bfor\s+(engineering)\b/gi, replacement: 'for [PROJECT:FV Engineering]' },
      
      { pattern: /\bto\s+(fv\s+demo\s+product)\b/gi, replacement: 'to [PROJECT:FV Demo Product]' },
      { pattern: /\bto\s+(demo\s+product)\b/gi, replacement: 'to [PROJECT:FV Demo Product]' },
      { pattern: /\bto\s+(fv\s+product)\b/gi, replacement: 'to [PROJECT:FV Product]' },
      { pattern: /\bto\s+(fv\s+engineering)\b/gi, replacement: 'to [PROJECT:FV Engineering]' },
      { pattern: /\bto\s+(engineering)\b/gi, replacement: 'to [PROJECT:FV Engineering]' }
    ];
    
    for (const { pattern, replacement } of projectPatterns) {
      if (pattern.test(processed)) {
        processed = processed.replace(pattern, replacement);
        console.log(`🔍 Preprocessed: "${userInput}" → "${processed}"`);
        break; // Only apply the first match to avoid conflicts
      }
    }
    
    return processed;
  }

  private buildExtractionPrompt(userInput: string): string {
    return `Analyze this user request for creating a Jira issue and extract parameters:

"${userInput}"

Extract these parameters ONLY if they are clearly and explicitly mentioned:

TITLE: The issue title/summary (exact text in quotes, or clear subject)
TYPE: Must be exactly one of: Bug, Task, Story, Epic (case-sensitive)
PROJECT: Project name ONLY if mentioned with "in", "for", "to" keywords. Look for these exact patterns:
- "in [project name]" or "in the [project name]" 
- "for [project name]" or "for the [project name]"
- "to [project name]" or "to the [project name]"
Valid project names: "FV Demo Product", "FV Demo Issues", "FV Engineering", "FV Product", "demo product", "demo issues", "engineering", "product"
PRIORITY: Must be exactly one of: Lowest, Low, Medium, High, Highest (case-sensitive)  
DESCRIPTION: Detailed explanation, steps to reproduce, or additional context (usually after "description is" or "whose description is")

CRITICAL: When extracting PROJECT, pay close attention to the exact phrase after "in", "for", or "to":
- "in fv demo product" → "FV Demo Product" 
- "in fv product" → "FV Product"
- "in fv demo issues" → "FV Demo Issues" 
- "in fv engineering" → "FV Engineering"
- "in engineering" → "FV Engineering"
- "in demo product" → "FV Demo Product"
- "in demo issues" → "FV Demo Issues"

DO NOT extract project from description text or other parts of the sentence. Only from location indicators.

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
  "project": { "value": "FV Demo Product" | null, "confidence": 0.7 },
  "priority": { "value": "High" | null, "confidence": 0.6 },
  "description": { "value": "extracted description" | null, "confidence": 0.5 }
}

Examples:
- "Create a bug called 'Login broken'" → title: "Login broken", type: "Bug"
- "High priority task for demo project" → type: "Task", priority: "High", project: null
- "Make an issue in FV Engineering about API timeout" → title: "API timeout", project: "FV Engineering"
- "Create issue in fv demo product called test" → title: "test", project: "FV Demo Product"

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

  private createDefaultExtraction(): ExtractedParameters {
    return {
      title: { value: null, confidence: 0, source: 'ai_extracted' },
      type: { value: 'Bug', confidence: 1.0, source: 'default' },
      project: { value: 'FV Demo (Issues)', confidence: 1.0, source: 'default' },
      priority: { value: 'Medium', confidence: 1.0, source: 'default' },
      description: { value: null, confidence: 0, source: 'ai_extracted' }
    };
  }

  // NEW: Apply defaults for missing parameters
  private applyDefaults(extracted: ExtractedParameters): ExtractedParameters {
    const result = { ...extracted };

    // Apply defaults for type, project, and priority if not extracted with high confidence
    if (!result.type.value || result.type.confidence < 0.6) {
      result.type = { value: 'Bug', confidence: 1.0, source: 'default' };
      console.log('🔧 Applied default type: Bug');
    }

    if (!result.project.value || result.project.confidence < 0.6) {
      result.project = { value: 'FV Demo (Issues)', confidence: 1.0, source: 'default' };
      console.log('🔧 Applied default project: FV Demo (Issues)');
    }

    if (!result.priority.value || result.priority.confidence < 0.6) {
      result.priority = { value: 'Medium', confidence: 1.0, source: 'default' };
      console.log('🔧 Applied default priority: Medium');
    }

    return result;
  }

  private logExtractionResults(extracted: ExtractedParameters): void {
    console.log('🎯 AI Extraction Results:');
    
    Object.entries(extracted).forEach(([key, param]) => {
      if (param.value) {
        let icon = '❌';
        if (param.source === 'default') {
          icon = '🔧'; // Default value
        } else if (param.confidence >= 0.8) {
          icon = '✅'; // High confidence
        } else if (param.confidence >= 0.6) {
          icon = '🟡'; // Medium confidence
        } else {
          icon = '🟠'; // Low confidence
        }
        
        const sourceLabel = param.source === 'default' ? ' (default)' : ` (${(param.confidence * 100).toFixed(0)}%)`;
        console.log(`   ${icon} ${key}: "${param.value}"${sourceLabel}`);
      } else {
        console.log(`   ❌ ${key}: not detected`);
      }
    });
    console.log('');
  }

  // Helper method to identify which parameters still need to be collected
  // UPDATED: Only consider title and description as requiring follow-up questions
  identifyMissingParameters(extracted: ExtractedParameters, confidenceThreshold: number = 0.6): string[] {
    const missing: string[] = [];
    
    // Only check title and description for follow-up questions
    if (!extracted.title.value || extracted.title.confidence < confidenceThreshold) {
      missing.push('title');
    }
    
    if (!extracted.description.value || extracted.description.confidence < confidenceThreshold) {
      missing.push('description');
    }

    console.log(`📋 Missing parameters requiring follow-up:`, missing);
    return missing;
  }

  // Validate extracted parameters against known valid values
  validateExtractedParameters(extracted: ExtractedParameters): ExtractedParameters {
    const validated = { ...extracted };

    // Validate issue type
    if (validated.type.value) {
      const validTypes = ['Bug', 'Task', 'Story', 'Epic'];
      if (!validTypes.includes(validated.type.value)) {
        console.log(`⚠️  Invalid type "${validated.type.value}", using default: Bug`);
        validated.type = { value: 'Bug', confidence: 1.0, source: 'default' };
      }
    }

    // Validate priority
    if (validated.priority.value) {
      const validPriorities = ['Lowest', 'Low', 'Medium', 'High', 'Highest'];
      if (!validPriorities.includes(validated.priority.value)) {
        console.log(`⚠️  Invalid priority "${validated.priority.value}", using default: Medium`);
        validated.priority = { value: 'Medium', confidence: 1.0, source: 'default' };
      }
    }

    // Validate project with enhanced precision mapping
    if (validated.project.value) {
      const normalizedProject = validated.project.value.toLowerCase().trim();
      
      // Precise project mapping with exact matching
      const projectMapping: { [key: string]: string } = {
        // FV Demo Product variations
        'fv demo product': 'FV Demo (Product)',
        'demo product': 'FV Demo (Product)',
        'fv demo (product)': 'FV Demo (Product)',
        'dpd': 'FV Demo (Product)',
        
        // FV Demo Issues variations  
        'fv demo issues': 'FV Demo (Issues)',
        'demo issues': 'FV Demo (Issues)',
        'fv demo (issues)': 'FV Demo (Issues)',
        'demo': 'FV Demo (Issues)',
        'fvdemo': 'FV Demo (Issues)',
        'dpi': 'FV Demo (Issues)',
        'issues': 'FV Demo (Issues)',
        
        // FV Engineering variations
        'fv engineering': 'FV Engineering',
        'engineering': 'FV Engineering',
        'eng': 'FV Engineering',
        
        // FV Product variations (distinct from demo product)
        'fv product': 'FV Product',
        'prod': 'FV Product'
      };

      // Check for exact matches first
      if (projectMapping[normalizedProject]) {
        const mappedProject = projectMapping[normalizedProject];
        console.log(`📂 Mapped project "${normalizedProject}" → "${mappedProject}"`);
        validated.project.value = mappedProject;
      } else {
        // If no exact match, check if it's already a valid full project name
        const validFullNames = ['FV Demo (Product)', 'FV Demo (Issues)', 'FV Engineering', 'FV Product'];
        const matchingFullName = validFullNames.find(name => 
          name.toLowerCase() === normalizedProject || 
          normalizedProject === name
        );
        
        if (matchingFullName) {
          console.log(`📂 Validated full project name: "${matchingFullName}"`);
          validated.project.value = matchingFullName;
        } else {
          // Handle special cases for partial matches that might be ambiguous
          if (normalizedProject === 'product' || normalizedProject === 'fv') {
            console.log(`⚠️  Ambiguous project "${normalizedProject}", using default: FV Demo (Issues)`);
            validated.project = { value: 'FV Demo (Issues)', confidence: 1.0, source: 'default' };
          } else {
            console.log(`⚠️  Unknown project "${normalizedProject}", using default: FV Demo (Issues)`);
            validated.project = { value: 'FV Demo (Issues)', confidence: 1.0, source: 'default' };
          }
        }
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
