import { MCPClient } from './mcpClient';
import { 
  IssueData, 
  ZapierJiraCreateIssueArgs, 
  ZapierJiraSearchArgs, 
  ZapierJiraProjectSearchArgs,
  JiraIssue,
  JiraProject,
  MCPToolResult 
} from './types';

export class ZapierService {
  private mcpClient: MCPClient;
  private isInitialized: boolean = false;
  private availableProjects: JiraProject[] = [];
  private projectCache: Map<string, JiraProject> = new Map();

  constructor() {
    this.mcpClient = new MCPClient();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      await this.mcpClient.connect();
      this.isInitialized = true;
      console.log('🚀 Zapier service initialized successfully');
      
      // Try to cache available projects for better project resolution
      await this.cacheAvailableProjects();
    } catch (error) {
      console.error('Failed to initialize Zapier service:', error);
      throw error;
    }
  }

  async testConnection(): Promise<void> {
    console.log('🚀 Zapier service connection ready');
  }

  // NEW: Cache available projects to improve project resolution
  private async cacheAvailableProjects(): Promise<void> {
    try {
      console.log('📂 Caching available projects...');
      
      // Try to search for known projects to cache them
      const knownProjects = [
        'FV Demo (Issues)',
        'FV Demo (Product)', 
        'FV Engineering',
        'FV Product'
      ];

      for (const projectName of knownProjects) {
        try {
          const project = await this.validateAndFindProject(projectName);
          if (project) {
            this.projectCache.set(projectName.toLowerCase(), project);
            this.projectCache.set(project.key.toLowerCase(), project);
            console.log(`✅ Cached project: ${project.name} (${project.key})`);
          }
        } catch (error) {
          console.log(`⚠️  Could not cache project "${projectName}": ${error}`);
        }
      }

      console.log(`📂 Cached ${this.projectCache.size / 2} projects successfully`);
    } catch (error) {
      console.warn('⚠️  Could not cache projects, will validate dynamically:', error);
    }
  }

  async fetchAndCacheProjects(): Promise<void> {
    if (!this.isInitialized) {
      console.warn('⚠️  Cannot fetch projects: Zapier service not initialized');
      return;
    }

    await this.cacheAvailableProjects();
  }

  getAvailableProjects(): JiraProject[] {
    return [...this.availableProjects];
  }

  // IMPROVED: Better project validation with caching and multiple search strategies
  async validateAndFindProject(userInput: string): Promise<JiraProject | null> {
    if (!userInput || !this.isInitialized) {
      return null;
    }

    console.log(`🔍 Validating project: "${userInput}"`);

    // First check cache
    const cacheKey = userInput.toLowerCase();
    if (this.projectCache.has(cacheKey)) {
      const cached = this.projectCache.get(cacheKey)!;
      console.log(`✅ Found cached project: ${cached.name} (${cached.key})`);
      return cached;
    }

    try {
      // Strategy 1: Direct search with user input
      let project = await this.searchProjectDirectly(userInput);
      if (project) {
        this.cacheProject(project, userInput);
        return project;
      }

      // Strategy 2: Try with common abbreviation expansions
      const expandedNames = this.expandAbbreviation(userInput);
      for (const expandedName of expandedNames) {
        console.log(`🔍 Trying expanded name: "${expandedName}"`);
        project = await this.searchProjectDirectly(expandedName);
        if (project) {
          this.cacheProject(project, userInput);
          return project;
        }
      }

      // Strategy 3: Try searching by project key if it looks like one
      if (this.looksLikeProjectKey(userInput)) {
        project = await this.searchProjectByKey(userInput);
        if (project) {
          this.cacheProject(project, userInput);
          return project;
        }
      }

      console.log(`❌ No project found for: "${userInput}"`);
      return null;

    } catch (error) {
      console.error(`❌ Error validating project "${userInput}":`, error);
      return null;
    }
  }

  // NEW: Search for project directly by name
  private async searchProjectDirectly(projectName: string): Promise<JiraProject | null> {
    try {
      const result = await this.mcpClient.callTool({
        name: 'jira_software_cloud_find_project',
        arguments: {
          instructions: `Search for project: ${projectName}`,
          name: projectName
        }
      });

      const responseText = this.extractResponseText(result);
      const projects = this.parseProjectResponse(responseText);
      
      if (projects.length > 0) {
        const project = projects[0];
        console.log(`✅ Found project: ${project.name} (${project.key})`);
        return project;
      }
      
      return null;
    } catch (error) {
      console.error(`Error searching for project "${projectName}":`, error);
      return null;
    }
  }

  // NEW: Search for project by key
  private async searchProjectByKey(projectKey: string): Promise<JiraProject | null> {
    try {
      console.log(`🔍 Searching by project key: ${projectKey}`);
      const result = await this.mcpClient.callTool({
        name: 'jira_software_cloud_find_project',
        arguments: {
          instructions: `Find project with key: ${projectKey}`,
          key: projectKey
        }
      });

      const responseText = this.extractResponseText(result);
      const projects = this.parseProjectResponse(responseText);
      
      if (projects.length > 0) {
        const project = projects[0];
        console.log(`✅ Found project by key: ${project.name} (${project.key})`);
        return project;
      }
      
      return null;
    } catch (error) {
      console.error(`Error searching for project key "${projectKey}":`, error);
      return null;
    }
  }

  // NEW: Cache a project with multiple keys
  private cacheProject(project: JiraProject, originalInput: string): void {
    this.projectCache.set(originalInput.toLowerCase(), project);
    this.projectCache.set(project.name.toLowerCase(), project);
    this.projectCache.set(project.key.toLowerCase(), project);
  }

  // NEW: Check if input looks like a project key
  private looksLikeProjectKey(input: string): boolean {
    // Project keys are typically uppercase letters, sometimes with numbers
    return /^[A-Z][A-Z0-9]*$/i.test(input) && input.length >= 2 && input.length <= 10;
  }

  // Parse the project response from find_project tool
  private parseProjectResponse(responseText: string): JiraProject[] {
    try {
      // Try parsing as JSON first
      const response = JSON.parse(responseText);
      
      if (response.results && Array.isArray(response.results) && response.results.length > 0) {
        return response.results.map((project: any) => ({
          key: project.key || project.projectKey || project.name,
          name: project.name || project.displayName || project.key,
          id: project.id || project.key,
          type: project.projectTypeKey || project.type || 'software'
        }));
      }

      // If results is directly an array
      if (Array.isArray(response) && response.length > 0) {
        return response.map((project: any) => ({
          key: project.key || project.projectKey || project.name,
          name: project.name || project.displayName || project.key,
          id: project.id || project.key,
          type: project.projectTypeKey || project.type || 'software'
        }));
      }

      // If it's a single project object
      if (response.key || response.name) {
        return [{
          key: response.key || response.projectKey || response.name,
          name: response.name || response.displayName || response.key,
          id: response.id || response.key,
          type: response.projectTypeKey || response.type || 'software'
        }];
      }
      
      return [];
    } catch (parseError) {
      // If JSON parsing fails, try to extract project info from text
      console.log('JSON parsing failed, trying text extraction...');
      return this.extractProjectFromText(responseText);
    }
  }

  // NEW: Extract project info from text response
  private extractProjectFromText(text: string): JiraProject[] {
    const projects: JiraProject[] = [];
    const lines = text.split('\n');
    
    for (const line of lines) {
      // Look for patterns like "PROJECT_KEY: Project Name" or "Project Name (PROJECT_KEY)"
      const keyNameMatch = line.match(/([A-Z][A-Z0-9]*)\s*[:.-]\s*(.+)/i);
      const nameKeyMatch = line.match(/(.+?)\s*\(([A-Z][A-Z0-9]*)\)/i);
      
      if (keyNameMatch) {
        projects.push({
          key: keyNameMatch[1].trim(),
          name: keyNameMatch[2].trim(),
          id: keyNameMatch[1].trim(),
          type: 'software'
        });
      } else if (nameKeyMatch) {
        projects.push({
          key: nameKeyMatch[2].trim(),
          name: nameKeyMatch[1].trim(),
          id: nameKeyMatch[2].trim(),
          type: 'software'
        });
      }
    }
    
    return projects;
  }

  // IMPROVED: Better project name expansions
  private expandAbbreviation(input: string): string[] {
    const lowerInput = input.toLowerCase().trim();
    const expansions: string[] = [];

    // Enhanced mapping with more variations
    const expansionMap: { [key: string]: string[] } = {
      'demo': ['FV Demo (Issues)', 'FV Demo (Product)', 'Demo'],
      'demo issues': ['FV Demo (Issues)'],
      'demo product': ['FV Demo (Product)'],
      'issues': ['FV Demo (Issues)'],
      'product': ['FV Product', 'FV Demo (Product)'],
      'engineering': ['FV Engineering'],
      'eng': ['FV Engineering'],
      'fv': ['FV Product', 'FV Engineering', 'FV Demo (Issues)', 'FV Demo (Product)'],
      'fv demo': ['FV Demo (Issues)', 'FV Demo (Product)'],
      'fv product': ['FV Product'],
      'fv engineering': ['FV Engineering'],
      // Common project keys
      'dpi': ['FV Demo (Issues)'],
      'dpd': ['FV Demo (Product)'],
      'prod': ['FV Product']
    };

    if (expansionMap[lowerInput]) {
      expansions.push(...expansionMap[lowerInput]);
    }

    // Try with "FV" prefix if not already present
    if (!lowerInput.startsWith('fv')) {
      expansions.push(`FV ${input}`);
      expansions.push(`FV ${input} (Issues)`);
      expansions.push(`FV ${input} (Product)`);
    }

    // Try variations with parentheses
    if (!lowerInput.includes('(')) {
      expansions.push(`${input} (Issues)`);
      expansions.push(`${input} (Product)`);
    }

    return [...new Set(expansions)]; // Remove duplicates
  }

  formatProjectSelectionPrompt(): string {
    const availableProjectNames = [
      'FV Demo (Issues) - for bug reports and general issues',
      'FV Demo (Product) - for product-related work',
      'FV Engineering - for engineering tasks',
      'FV Product - for product management'
    ];

    return `Which project should this issue be created in?\n\nAvailable projects:\n${availableProjectNames.map((p, i) => `   ${i + 1}. ${p}`).join('\n')}\n\nYou can use full project names, abbreviations (demo, eng, product), or project keys:`;
  }

  async cleanup(): Promise<void> {
    if (this.isInitialized) {
      await this.mcpClient.disconnect();
      this.isInitialized = false;
    }
  }

  async createJiraIssue(issueData: IssueData): Promise<any> {
    if (!this.isInitialized) {
      throw new Error('Zapier service not initialized. Call initialize() first.');
    }

    // Validate required fields
    if (!issueData.project) {
      throw new Error('Project is required to create a Jira issue');
    }
    if (!issueData.title) {
      throw new Error('Title/Summary is required to create a Jira issue');
    }

    // IMPROVED: Validate project before creating issue
    console.log(`🔍 Validating project "${issueData.project}" before creating issue...`);
    const validProject = await this.validateAndFindProject(issueData.project);
    
    if (!validProject) {
      throw new Error(`Invalid project: "${issueData.project}". Please use one of: FV Demo (Issues), FV Demo (Product), FV Engineering, FV Product`);
    }

    // Use the validated project name/key
    const projectToUse = validProject.key || validProject.name;
    console.log(`✅ Using validated project: ${validProject.name} (${validProject.key})`);

    const args: ZapierJiraCreateIssueArgs = {
      instructions: `Create a new Jira issue with the following details. IMPORTANT: Do not change or guess any values, use exactly what is specified:
        - Project: ${projectToUse}
        - Summary: ${issueData.title}
        - Description: ${issueData.description || 'No description provided'}
        - Issue Type: ${issueData.issueType || 'Task'}
        - Priority: ${issueData.priority || 'Medium'}`,
      project: projectToUse,
      summary: issueData.title,
      description: issueData.description,
      issueType: issueData.issueType,
      priority: issueData.priority
    };

    try {
      console.log('📝 Creating Jira issue via Zapier MCP...');
      console.log(`📂 Project: ${projectToUse}`);
      console.log(`📝 Summary: ${issueData.title}`);
      console.log(`🏷️  Type: ${issueData.issueType || 'Task'}`);
      console.log(`⚡ Priority: ${issueData.priority || 'Medium'}`);
      
      const result = await this.mcpClient.callTool({
        name: 'jira_software_cloud_create_issue',
        arguments: args
      });

      if (result.isError) {
        throw new Error(this.extractErrorMessage(result));
      }

      const responseText = this.extractResponseText(result);
      const parsedResult = this.parseCreatedIssueResponse(responseText);
      
      return parsedResult;
      
    } catch (error) {
      console.error('💥 Exception during Jira issue creation:', error);
      throw new Error(`Failed to create Jira issue: ${error}`);
    }
  }

  async searchJiraIssues(query: string): Promise<any[]> {
    if (!this.isInitialized) {
      throw new Error('Zapier service not initialized. Call initialize() first.');
    }

    const args: ZapierJiraSearchArgs = {
      instructions: `Search for Jira issues related to: "${query}"`,
      summary: query
    };

    try {
      const result = await this.mcpClient.callTool({
        name: 'jira_software_cloud_find_issue',
        arguments: args
      });

      if (result.isError) {
        throw new Error(this.extractErrorMessage(result));
      }

      const responseText = this.extractResponseText(result);
      return this.parseSearchResults(responseText);
      
    } catch (error) {
      console.error('❌ Failed to search Jira issues:', error);
      throw new Error(`Failed to search Jira issues: ${error}`);
    }
  }

  async findSimilarIssues(title: string, description?: string): Promise<any[]> {
    if (!this.isInitialized) {
      throw new Error('Zapier service not initialized. Call initialize() first.');
    }

    const searchTerms = [title];
    if (description) {
      const descWords = description.split(' ')
        .filter(word => word.length > 3)
        .slice(0, 3);
      searchTerms.push(...descWords);
    }

    const searchQuery = searchTerms.join(' ');
    
    try {
      const results = await this.searchJiraIssues(searchQuery);
      
      const similarIssues = results.filter(issue => 
        this.calculateSimilarity(title, issue.summary || '') > 0.3
      );

      return similarIssues;
      
    } catch (error) {
      console.error('Error finding similar issues:', error);
      return [];
    }
  }

  // Utility methods
  private extractResponseText(result: MCPToolResult): string {
    if (result.content && result.content.length > 0) {
      return result.content[0].text || '';
    }
    return '';
  }

  private extractErrorMessage(result: MCPToolResult): string {
    const text = this.extractResponseText(result);
    return text || 'Unknown error occurred';
  }

  private parseCreatedIssueResponse(responseText: string): any {
    try {
      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch (parseError) {
        return this.parseTextResponse(responseText);
      }
      
      const execution = responseData.execution;
      const results = responseData.results;
      const issueUrl = responseData.issueUrl;
      
      if (execution && execution.status === 'SUCCESS') {
        let issueData = null;
        
        if (results && Array.isArray(results) && results.length > 0) {
          issueData = results[0];
        }
        
        const result = {
          success: true,
          key: issueData?.key || null,
          url: issueUrl || this.constructIssueUrl(issueData?.key, responseData),
          issueId: issueData?.id,
          project: issueData?.fields?.project?.name || issueData?.fields?.project?.key,
          summary: issueData?.fields?.summary,
          status: issueData?.fields?.status?.name,
          priority: issueData?.fields?.priority?.name,
          issueType: issueData?.fields?.issuetype?.name,
          created: issueData?.fields?.created,
          response: this.buildSuccessMessage(issueData, issueUrl)
        };
        
        return result;
        
      } else if (execution && (execution.status === 'FAILED' || execution.status === 'ERROR')) {
        return {
          success: false,
          error: `Zapier execution failed with status: ${execution.status}`,
          response: execution.error || 'Unknown execution error'
        };
      }
      
      return this.parseTextResponse(responseText);
      
    } catch (error) {
      return {
        success: false,
        error: `JSON parsing error: ${error.message}`,
        response: responseText
      };
    }
  }

  private buildSuccessMessage(issueData: any, issueUrl: string): string {
    if (!issueData) {
      return 'Issue created successfully (details not available)';
    }
    
    const parts = [];
    parts.push(`Issue ${issueData.key} created successfully`);
    
    if (issueData.fields?.project?.name) {
      parts.push(`in project "${issueData.fields.project.name}"`);
    }
    
    if (issueData.fields?.summary) {
      parts.push(`with summary "${issueData.fields.summary}"`);
    }
    
    if (issueData.fields?.issuetype?.name) {
      parts.push(`as ${issueData.fields.issuetype.name}`);
    }
    
    if (issueData.fields?.priority?.name) {
      parts.push(`with ${issueData.fields.priority.name} priority`);
    }
    
    return parts.join(' ');
  }

  private constructIssueUrl(issueKey: string, responseData?: any): string | null {
    if (!issueKey) return null;
    
    let domain = 'fankave.atlassian.net';
    
    if (responseData) {
      const responseStr = JSON.stringify(responseData);
      const domainMatch = responseStr.match(/https:\/\/([^.]+\.atlassian\.net)/);
      if (domainMatch) {
        domain = domainMatch[1];
      }
    }
    
    return `https://${domain}/browse/${issueKey}`;
  }

  private parseTextResponse(responseText: string): any {
    try {
      const hasSuccess = responseText.toLowerCase().includes('success') ||
                        responseText.includes('"status":"SUCCESS"') ||
                        responseText.toLowerCase().includes('created');
      
      const hasFailure = responseText.toLowerCase().includes('error') ||
                        responseText.toLowerCase().includes('failed') ||
                        responseText.includes('"status":"FAILED"') ||
                        responseText.toLowerCase().includes('unable');
      
      const issueKeyMatch = responseText.match(/([A-Z]+-\d+)/);
      const issueKey = issueKeyMatch ? issueKeyMatch[1] : null;
      
      const urlMatch = responseText.match(/(https?:\/\/[^\s"]+browse\/[A-Z]+-\d+)/);
      const issueUrl = urlMatch ? urlMatch[1] : null;
      
      const success = (hasSuccess || issueKey !== null) && !hasFailure;
      
      return {
        success: success,
        key: issueKey,
        url: issueUrl,
        response: success ? 
          `Text parsing detected successful creation${issueKey ? ` of ${issueKey}` : ''}` :
          'Text parsing could not confirm successful creation',
        error: hasFailure ? 'Text parsing detected failure indicators' : null
      };
      
    } catch (error) {
      return {
        success: false,
        response: responseText,
        error: `Text parsing error: ${error.message}`
      };
    }
  }

  private parseSearchResults(responseText: string): any[] {
    try {
      const results = [];
      const lines = responseText.split('\n');
      
      for (const line of lines) {
        const issueKeyMatch = line.match(/([A-Z]+-\d+)/);
        if (issueKeyMatch) {
          results.push({
            key: issueKeyMatch[1],
            summary: line.replace(issueKeyMatch[1], '').trim(),
            raw: line
          });
        }
      }
      
      return results;
    } catch (error) {
      return [];
    }
  }

  private calculateSimilarity(str1: string, str2: string): number {
    const words1 = new Set(str1.toLowerCase().split(' '));
    const words2 = new Set(str2.toLowerCase().split(' '));
    
    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  isReady(): boolean {
    return this.isInitialized && this.mcpClient.isClientConnected();
  }
}
