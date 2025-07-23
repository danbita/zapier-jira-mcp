import { MCPClient } from './mcpClient';
import { 
  IssueData, 
  ZapierJiraCreateIssueArgs, 
  ZapierJiraSearchArgs, 
  JiraIssue,
  MCPToolResult 
} from './types';

export class ZapierService {
  private mcpClient: MCPClient;
  private isInitialized: boolean = false;

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
    } catch (error) {
      console.error('Failed to initialize Zapier service:', error);
      throw error;
    }
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

    const args: ZapierJiraCreateIssueArgs = {
      instructions: `Create a new Jira issue with the following details:
        - Project: ${issueData.project}
        - Summary: ${issueData.title}
        - Description: ${issueData.description || 'No description provided'}
        - Issue Type: ${issueData.issueType || 'Task'}
        - Priority: ${issueData.priority || 'Medium'}`,
      project: issueData.project,
      summary: issueData.title,
      description: issueData.description,
      issueType: issueData.issueType,
      priority: issueData.priority
    };

    try {
      console.log('📝 Creating Jira issue...');
      const result = await this.mcpClient.callTool({
        name: 'jira_software_cloud_create_issue',
        arguments: args
      });

      if (result.isError) {
        throw new Error(this.extractErrorMessage(result));
      }

      const responseText = this.extractResponseText(result);
      console.log('✅ Jira issue created successfully!');
      console.log('📋 Response:', responseText);
      
      return this.parseCreatedIssueResponse(responseText);
      
    } catch (error) {
      console.error('❌ Failed to create Jira issue:', error);
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
      console.log(`🔍 Searching for issues related to: "${query}"`);
      const result = await this.mcpClient.callTool({
        name: 'jira_software_cloud_find_issue',
        arguments: args
      });

      if (result.isError) {
        throw new Error(this.extractErrorMessage(result));
      }

      const responseText = this.extractResponseText(result);
      console.log('✅ Search completed');
      
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

    // Create a search query combining title and description keywords
    const searchTerms = [title];
    if (description) {
      // Extract key words from description (simple approach)
      const descWords = description.split(' ')
        .filter(word => word.length > 3)
        .slice(0, 3); // Take first 3 meaningful words
      searchTerms.push(...descWords);
    }

    const searchQuery = searchTerms.join(' ');
    
    try {
      console.log(`🔍 Looking for similar issues to: "${title}"`);
      const results = await this.searchJiraIssues(searchQuery);
      
      // Filter results that might be similar (basic similarity check)
      const similarIssues = results.filter(issue => 
        this.calculateSimilarity(title, issue.summary || '') > 0.3
      );

      if (similarIssues.length > 0) {
        console.log(`📋 Found ${similarIssues.length} potentially similar issue(s)`);
      } else {
        console.log('✅ No similar issues found');
      }

      return similarIssues;
      
    } catch (error) {
      console.error('Error finding similar issues:', error);
      return []; // Return empty array instead of throwing, as this is a bonus feature
    }
  }

  async getAvailableProjects(): Promise<string[]> {
    if (!this.isInitialized) {
      throw new Error('Zapier service not initialized. Call initialize() first.');
    }

    try {
      console.log('📂 Fetching available projects...');
      const result = await this.mcpClient.callTool({
        name: 'jira_software_cloud_find_project',
        arguments: {
          instructions: 'List all available Jira projects',
          searchByParameter: ''
        }
      });

      if (result.isError) {
        console.log('Could not fetch projects, using default suggestions');
        return ['DEMO', 'TEST', 'PROJ']; // Fallback suggestions
      }

      const responseText = this.extractResponseText(result);
      return this.parseProjectList(responseText);
      
    } catch (error) {
      console.log('Could not fetch projects:', error);
      return ['DEMO', 'TEST', 'PROJ']; // Fallback suggestions
    }
  }

  // Utility methods for parsing responses
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
    // Enhanced parsing to handle Zapier MCP JSON response format
    try {
      console.log('📋 Raw Zapier Response:', responseText);
      
      // Try to parse as JSON first (Zapier returns structured JSON)
      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        // Fallback to text parsing if not JSON
        return this.parseTextResponse(responseText);
      }
      
      // Check for Zapier MCP response structure
      if (responseData.results && Array.isArray(responseData.results) && responseData.results.length > 0) {
        const issue = responseData.results[0];
        const execution = responseData.execution;
        
        return {
          success: execution?.status === 'SUCCESS',
          key: issue.key || null,
          url: responseData.issueUrl || issue.self || null,
          issueId: issue.id,
          project: issue.fields?.project?.name || issue.fields?.project?.key,
          summary: issue.fields?.summary,
          status: issue.fields?.status?.name,
          response: `Issue ${issue.key} created successfully in project ${issue.fields?.project?.name}`,
          rawResponse: responseData
        };
      }
      
      // Check execution status for success/failure
      if (responseData.execution) {
        const isSuccess = responseData.execution.status === 'SUCCESS';
        return {
          success: isSuccess,
          response: responseData.execution.status,
          error: isSuccess ? null : `Execution status: ${responseData.execution.status}`,
          rawResponse: responseData
        };
      }
      
      // Fallback to text parsing
      return this.parseTextResponse(responseText);
      
    } catch (error) {
      console.log('⚠️  Error parsing JSON response:', error);
      return this.parseTextResponse(responseText);
    }
  }

  private parseTextResponse(responseText: string): any {
    // Fallback text parsing for non-JSON responses
    try {
      // Look for issue key pattern (e.g., PROJ-123, DEMO-456)
      const issueKeyMatch = responseText.match(/([A-Z]+-\d+)/);
      const issueKey = issueKeyMatch ? issueKeyMatch[1] : null;
      
      // Look for URL patterns in the response
      const urlMatch = responseText.match(/(https?:\/\/[^\s"]+)/);
      const issueUrl = urlMatch ? urlMatch[1] : null;
      
      // Look for success indicators
      const isSuccess = responseText.toLowerCase().includes('created') || 
                       responseText.toLowerCase().includes('success') ||
                       responseText.includes('"status":"SUCCESS"') ||
                       issueKey !== null;
      
      // Look for error indicators
      const isError = responseText.toLowerCase().includes('error') ||
                     responseText.toLowerCase().includes('failed') ||
                     responseText.toLowerCase().includes('unable') ||
                     responseText.includes('"status":"FAILED"');
      
      const result = {
        success: isSuccess && !isError,
        key: issueKey,
        url: issueUrl,
        response: responseText,
        error: isError ? responseText : null
      };
      
      console.log('📊 Parsed Result:', JSON.stringify(result, null, 2));
      return result;
      
    } catch (error) {
      console.log('⚠️  Error parsing text response:', error);
      return {
        success: false,
        response: responseText,
        error: `Parsing error: ${error}`
      };
    }
  }

  private parseSearchResults(responseText: string): any[] {
    // Basic parsing - extract issue information from response
    // This would need to be adapted based on actual Zapier response format
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
      console.log('Could not parse search results:', error);
      return [];
    }
  }

  private parseProjectList(responseText: string): string[] {
    // Extract project keys/names from response
    try {
      const projectMatches = responseText.match(/([A-Z]+)/g);
      return projectMatches ? [...new Set(projectMatches)] : ['DEMO', 'TEST'];
    } catch (error) {
      return ['DEMO', 'TEST'];
    }
  }

  private calculateSimilarity(str1: string, str2: string): number {
    // Simple similarity calculation (Jaccard similarity on words)
    const words1 = new Set(str1.toLowerCase().split(' '));
    const words2 = new Set(str2.toLowerCase().split(' '));
    
    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  // Status check
  isReady(): boolean {
    return this.isInitialized && this.mcpClient.isClientConnected();
  }
}