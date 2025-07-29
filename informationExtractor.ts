import { IssueData } from './types';

export class InformationExtractor {

  extractExplicitInformation(userInput: string): Partial<IssueData> {
    const extractedData: Partial<IssueData> = {};
    
    // Only extract information that is explicitly and clearly stated
    const lowerInput = userInput.toLowerCase();
    
    // Extract project if explicitly mentioned with clear patterns
    const projectPatterns = [
      /(?:project|in)\s+([A-Z]+(?:[A-Z0-9]*)?)/i,
      /([A-Z]+(?:[A-Z0-9]*)?)\s+project/i
    ];
    
    for (const pattern of projectPatterns) {
      const match = userInput.match(pattern);
      if (match && match[1].length <= 10) { // Reasonable project key length
        extractedData.project = match[1].toUpperCase();
        console.log(`📂 Project explicitly mentioned: ${extractedData.project}`);
        break;
      }
    }

    // Extract issue type if explicitly mentioned
    const typePatterns = [
      /create\s+(?:a\s+)?(\w+)/i,
      /new\s+(\w+)/i,
      /(?:report|log)\s+(?:a\s+)?(\w+)/i
    ];
    
    for (const pattern of typePatterns) {
      const match = userInput.match(pattern);
      if (match) {
        const type = match[1].toLowerCase();
        if (['bug', 'task', 'story', 'epic', 'issue', 'ticket'].includes(type)) {
          if (type === 'issue' || type === 'ticket') {
            // Don't assume type for generic terms
            break;
          }
          extractedData.issueType = this.normalizeIssueType(type);
          console.log(`🏷️  Issue type explicitly mentioned: ${extractedData.issueType}`);
          break;
        }
      }
    }

    // Extract priority if explicitly mentioned
    const priorityPatterns = [
      /\b(low|medium|high|critical)\s+priority\b/i,
      /priority\s+(?:is\s+|of\s+)?(\w+)/i,
      /\b(urgent|critical|important)\b/i
    ];
    
    for (const pattern of priorityPatterns) {
      const match = userInput.match(pattern);
      if (match) {
        const priority = match[1].toLowerCase();
        extractedData.priority = this.normalizePriority(priority);
        console.log(`⚡ Priority explicitly mentioned: ${extractedData.priority}`);
        break;
      }
    }

    // Extract title if it's quoted or clearly indicated
    const quotedMatch = userInput.match(/"([^"]+)"/);
    if (quotedMatch) {
      extractedData.title = quotedMatch[1];
      console.log(`📝 Title explicitly quoted: ${extractedData.title}`);
    }

    return extractedData;
  }

  extractProjectFromResponse(userInput: string): string | null {
    // IMPROVED: Enhanced project mapping to handle all 4 projects
    const projectMapping: { [key: string]: string } = {
      // Demo projects
      'demo': 'FV Demo (Issues)',
      'fvdemo': 'FV Demo (Issues)', 
      'fv demo': 'FV Demo (Issues)',
      'demo issues': 'FV Demo (Issues)',
      'issues': 'FV Demo (Issues)',
      'dpi': 'FV Demo (Issues)',
      
      // Demo product
      'demo product': 'FV Demo (Product)',
      'fv demo product': 'FV Demo (Product)',
      'product demo': 'FV Demo (Product)',
      'dpd': 'FV Demo (Product)',
      
      // Engineering
      'engineering': 'FV Engineering',
      'eng': 'FV Engineering',
      'fv engineering': 'FV Engineering',
      'fv eng': 'FV Engineering',
      
      // Product
      'product': 'FV Product',
      'fv product': 'FV Product',
      'prod': 'FV Product'
    };
    
    const lowerInput = userInput.toLowerCase().trim();
    
    // Check for mapped abbreviations first
    for (const [key, value] of Object.entries(projectMapping)) {
      if (lowerInput.includes(key)) {
        console.log(`📂 Mapped "${key}" → "${value}"`);
        return value;
      }
    }
    
    // Check for exact full project names (case-insensitive)
    const fullProjectNames = [
      'FV Product',
      'FV Engineering', 
      'FV Demo (Issues)',
      'FV Demo (Product)'
    ];
    
    for (const projectName of fullProjectNames) {
      if (lowerInput.includes(projectName.toLowerCase())) {
        console.log(`📂 Found exact match: "${projectName}"`);
        return projectName;
      }
    }
    
    // Try partial matches for project names
    if (lowerInput.includes('fv product') || lowerInput.includes('fanvoice product')) {
      return 'FV Product';
    }
    if (lowerInput.includes('fv engineering') || lowerInput.includes('fanvoice engineering')) {
      return 'FV Engineering';
    }
    if (lowerInput.includes('fv demo') && lowerInput.includes('product')) {
      return 'FV Demo (Product)';
    }
    if (lowerInput.includes('fv demo') && (lowerInput.includes('issues') || !lowerInput.includes('product'))) {
      return 'FV Demo (Issues)';
    }
    
    // Fallback to original logic for other cases (project keys)
    const projectMatch = userInput.match(/\b([A-Z]+[A-Z0-9]*)\b/);
    if (projectMatch) {
      const match = projectMatch[1].toUpperCase();
      // Map known legacy project codes
      const legacyMapping: { [key: string]: string } = {
        'DEMO': 'FV Demo (Issues)',
        'DPI': 'FV Demo (Issues)',
        'DPD': 'FV Demo (Product)',
        'ENG': 'FV Engineering',
        'PROD': 'FV Product'
      };
      
      if (legacyMapping[match]) {
        console.log(`📂 Mapped legacy code "${match}" → "${legacyMapping[match]}"`);
        return legacyMapping[match];
      }
      
      return match;
    }
    
    return null;
  }

  extractIssueTypeFromResponse(userInput: string): string | null {
    const lowerInput = userInput.toLowerCase();
    const typeMapping: { [key: string]: string } = {
      'bug': 'Bug',
      'task': 'Task', 
      'story': 'Story',
      'epic': 'Epic'
    };
    
    for (const [key, value] of Object.entries(typeMapping)) {
      if (lowerInput.includes(key)) {
        return value;
      }
    }
    return null;
  }

  extractPriorityFromResponse(userInput: string): string | null {
    const lowerInput = userInput.toLowerCase();
    const priorityMapping: { [key: string]: string } = {
      'lowest': 'Lowest',
      'very low': 'Lowest',
      'trivial': 'Lowest',
      'low': 'Low',
      'minor': 'Low',
      'medium': 'Medium',
      'normal': 'Medium',
      'standard': 'Medium',
      'high': 'High',
      'important': 'High',
      'urgent': 'High',
      'major': 'High',
      'highest': 'Highest',
      'critical': 'Highest',
      'blocker': 'Highest',
      'severe': 'Highest'
    };
    
    for (const [key, value] of Object.entries(priorityMapping)) {
      if (lowerInput.includes(key)) {
        return value;
      }
    }
    return null;
  }

  extractTitleFromResponse(userInput: string): string | null {
    if (userInput.trim().length > 5) {
      return userInput.trim();
    }
    return null;
  }

  extractDescriptionFromResponse(userInput: string): string {
    const lowerInput = userInput.toLowerCase().trim();
    if (lowerInput === 'skip' || lowerInput === 'none' || lowerInput === 'no description') {
      return '';
    }
    return userInput.trim();
  }

  normalizeIssueType(type: string): string {
    const normalized = type.toLowerCase();
    switch (normalized) {
      case 'bug': return 'Bug';
      case 'task': return 'Task';
      case 'story': return 'Story';
      case 'epic': return 'Epic';
      default: return type.charAt(0).toUpperCase() + type.slice(1);
    }
  }

  normalizePriority(priority: string): string {
    const normalized = priority.toLowerCase();
    switch (normalized) {
      case 'lowest': case 'very low': case 'trivial': return 'Lowest';
      case 'low': case 'minor': return 'Low';
      case 'medium': case 'normal': case 'standard': return 'Medium';
      case 'high': case 'important': case 'urgent': case 'major': return 'High';
      case 'highest': case 'critical': case 'blocker': case 'severe': return 'Highest';
      default: return priority.charAt(0).toUpperCase() + priority.slice(1);
    }
  }

  detectsIssueCreationIntent(userInput: string): boolean {
    const lowerInput = userInput.toLowerCase();
    const creationKeywords = [
      'create', 'new', 'make', 'add', 'report', 'log', 'submit'
    ];
    const issueKeywords = [
      'issue', 'ticket', 'bug', 'task', 'story', 'epic', 'problem'
    ];
    
    const hasCreationKeyword = creationKeywords.some(keyword => 
      lowerInput.includes(keyword)
    );
    const hasIssueKeyword = issueKeywords.some(keyword => 
      lowerInput.includes(keyword)
    );
    
    return hasCreationKeyword && hasIssueKeyword;
  }

  detectsSearchIntent(userInput: string): boolean {
    const lowerInput = userInput.toLowerCase();
    return (lowerInput.includes('search') || lowerInput.includes('find')) &&
           (lowerInput.includes('issue') || lowerInput.includes('ticket'));
  }

  extractSearchQuery(userInput: string): string {
    return userInput.replace(/search|find|for|issues?|tickets?/gi, '').trim();
  }
}
