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
      instructions: `Create a new Jira issue with the following details. IMPORTANT: Do not change or guess any values, use exactly what is specified:
        - Project: ${issueData.project}
        - Summary: ${issueData.title}
        - Description: ${issueData.description || 'No description provided'}
        - Issue Type: ${issueData.issueType || 'Task'}
        - Priority: ${issueData.priority || 'Medium'} (MANDATORY: Set priority to exactly "${issueData.priority}", do not use Medium or any other value)`,
      project: issueData.project,
      summary: issueData.title,
      description: issueData.description,
      issueType: issueData.issueType,
      priority: issueData.priority
    };

    try {
      console.log('📝 Creating Jira issue via Zapier MCP...');
      console.log('📋 Request parameters:');
      console.log(`   - project: ${args.project}`);
      console.log(`   - summary: ${args.summary}`);
      console.log(`   - issueType: ${args.issueType}`);
      console.log(`   - priority: ${args.priority} ⚠️  (Check if this appears in Jira)`);
      console.log(`   - description: ${args.description?.substring(0, 50)}...`);
      console.log('');
      
      const result = await this.mcpClient.callTool({
        name: 'jira_software_cloud_create_issue',
        arguments: args
      });

      console.log('📡 Received response from Zapier MCP');
      
      if (result.isError) {
        console.log('❌ MCP Client marked response as error');
        throw new Error(this.extractErrorMessage(result));
      }

      const responseText = this.extractResponseText(result);
      console.log('📊 Response text length:', responseText.length, 'characters');
      
      const parsedResult = this.parseCreatedIssueResponse(responseText);
      
      if (parsedResult.success) {
        console.log('✅ Issue creation confirmed as successful');
      } else {
        console.log('❌ Issue creation confirmed as failed');
      }
      
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
    // Enhanced parsing to handle Zapier MCP JSON response format accurately
    try {
      console.log('📋 Raw Zapier Response Length:', responseText.length, 'characters');
      
      // Try to parse as JSON first (Zapier returns structured JSON)
      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch (parseError) {
        console.log('⚠️  Response is not JSON, falling back to text parsing');
        return this.parseTextResponse(responseText);
      }
      
      // Zapier MCP response structure analysis
      console.log('📊 Response structure keys:', Object.keys(responseData));
      
      // Check what Zapier actually processed
      if (responseData.execution && responseData.execution.resolvedParams) {
        console.log('🔍 Zapier processed parameters:');
        const resolvedParams = responseData.execution.resolvedParams;
        Object.keys(resolvedParams).forEach(key => {
          const param = resolvedParams[key];
          console.log(`   ${key}: ${param.value} (${param.status})`);
          if (key.includes('priority')) {
            console.log(`   ⚠️  Priority processing: ${JSON.stringify(param)}`);
          }
        });
      }
      
      // Check for successful Zapier MCP execution
      const execution = responseData.execution;
      const results = responseData.results;
      const issueUrl = responseData.issueUrl;
      
      if (execution) {
        console.log(`🔍 Execution status: ${execution.status}`);
        
        // SUCCESS status is the primary indicator
        if (execution.status === 'SUCCESS') {
          let issueData = null;
          
          // Extract issue details from results array
          if (results && Array.isArray(results) && results.length > 0) {
            issueData = results[0];
            console.log(`📝 Issue created: ${issueData.key}`);
            
            // Debug URL extraction
            console.log('🔗 URL Analysis:');
            console.log(`   issueUrl from response: ${issueUrl}`);
            console.log(`   self field: ${issueData?.self}`);
            
            // Try to find the correct browse URL pattern
            const responseStr = JSON.stringify(responseData);
            const urlMatches = responseStr.match(/https:\/\/[^"]+/g);
            if (urlMatches) {
              console.log('   Found URLs in response:', urlMatches.slice(0, 3)); // Show first 3
            }
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
            response: this.buildSuccessMessage(issueData, issueUrl),
            rawData: {
              execution: execution,
              issue: issueData,
              fullResponse: responseData
            }
          };
          
          console.log('✅ Parsed as successful creation');
          return result;
          
        } else if (execution.status === 'FAILED' || execution.status === 'ERROR') {
          console.log('❌ Execution marked as failed');
          return {
            success: false,
            error: `Zapier execution failed with status: ${execution.status}`,
            response: execution.error || 'Unknown execution error',
            rawData: responseData
          };
        } else {
          console.log(`⚠️  Unknown execution status: ${execution.status}`);
          return {
            success: false,
            error: `Unknown execution status: ${execution.status}`,
            response: JSON.stringify(execution),
            rawData: responseData
          };
        }
      }
      
      // If no execution object, check for direct results
      if (results && Array.isArray(results) && results.length > 0) {
        const issueData = results[0];
        if (issueData.key) {
          console.log('✅ Found issue data without execution status');
          return {
            success: true,
            key: issueData.key,
            url: issueUrl || this.constructIssueUrl(issueData.key),
            response: `Issue ${issueData.key} appears to have been created`,
            rawData: responseData
          };
        }
      }
      
      // If we get here, the response structure is unexpected
      console.log('⚠️  Unexpected response structure, falling back to text parsing');
      return this.parseTextResponse(responseText);
      
    } catch (error) {
      console.error('💥 Error parsing JSON response:', error);
      return {
        success: false,
        error: `JSON parsing error: ${error.message}`,
        response: responseText,
        rawData: null
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
    
    // Try to extract the domain from the API response first
    let domain = 'fankave.atlassian.net'; // Default fallback
    
    if (responseData) {
      // Look for any atlassian.net domain in the response
      const responseStr = JSON.stringify(responseData);
      const domainMatch = responseStr.match(/https:\/\/([^.]+\.atlassian\.net)/);
      if (domainMatch) {
        domain = domainMatch[1];
      }
    }
    
    return `https://${domain}/browse/${issueKey}`;
  }

  private parseTextResponse(responseText: string): any {
    // Fallback text parsing for non-JSON responses
    console.log('📝 Parsing as text response');
    
    try {
      // Look for success indicators in text
      const hasSuccess = responseText.toLowerCase().includes('success') ||
                        responseText.includes('"status":"SUCCESS"') ||
                        responseText.toLowerCase().includes('created');
      
      // Look for failure indicators  
      const hasFailure = responseText.toLowerCase().includes('error') ||
                        responseText.toLowerCase().includes('failed') ||
                        responseText.includes('"status":"FAILED"') ||
                        responseText.toLowerCase().includes('unable');
      
      // Extract issue key pattern (e.g., PROJ-123, DEMO-456)
      const issueKeyMatch = responseText.match(/([A-Z]+-\d+)/);
      const issueKey = issueKeyMatch ? issueKeyMatch[1] : null;
      
      // Extract URL patterns
      const urlMatch = responseText.match(/(https?:\/\/[^\s"]+browse\/[A-Z]+-\d+)/);
      const issueUrl = urlMatch ? urlMatch[1] : null;
      
      // Determine success based on available indicators
      const success = (hasSuccess || issueKey !== null) && !hasFailure;
      
      const result = {
        success: success,
        key: issueKey,
        url: issueUrl,
        response: success ? 
          `Text parsing detected successful creation${issueKey ? ` of ${issueKey}` : ''}` :
          'Text parsing could not confirm successful creation',
        error: hasFailure ? 'Text parsing detected failure indicators' : null,
        rawData: responseText
      };
      
      console.log('📊 Text parsing result:', JSON.stringify(result, null, 2));
      return result;
      
    } catch (error) {
      console.error('💥 Error in text parsing:', error);
      return {
        success: false,
        response: responseText,
        error: `Text parsing error: ${error.message}`,
        rawData: responseText
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
