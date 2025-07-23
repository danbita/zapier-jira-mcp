import { Chatbot } from './chatbot';
import { ConversationState, IssueData } from './types';
import { APP_CONFIG, OPENAI_API_KEY } from './config';
import { ZapierService } from './zapierService';

export class JiraAgent {
  private chatbot: Chatbot;
  private zapierService: ZapierService;
  private state: ConversationState = {
    isCreatingIssue: false,
    issueData: {}
  };

  constructor() {
    this.chatbot = new Chatbot(OPENAI_API_KEY);
    this.zapierService = new ZapierService();
  }

  async start(): Promise<void> {
    console.log(APP_CONFIG.WELCOME_MESSAGE);
    
    // Initialize Zapier service
    try {
      await this.zapierService.initialize();
    } catch (error) {
      console.error('⚠️  Warning: Could not connect to Zapier MCP server. Issue creation will not work.');
      console.error('Please check your ZAPIER_MCP_URL in .env file.\n');
    }
    
    await this.conversationLoop();
  }

  private async conversationLoop(): Promise<void> {
    while (true) {
      try {
        const userInput = await this.chatbot.getUserInput('You: ');
        
        if (userInput.toLowerCase().trim() === APP_CONFIG.EXIT_COMMAND) {
          console.log(APP_CONFIG.GOODBYE_MESSAGE);
          break;
        }

        if (userInput.trim() === '') {
          continue;
        }

        // Add user message to conversation history
        this.chatbot.addUserMessage(userInput);

        // Get AI response
        const response = await this.chatbot.getAIResponse();
        
        if (response) {
          console.log(`\n🤖 Agent: ${response}\n`);
          
          // Add assistant response to conversation history
          this.chatbot.addAssistantMessage(response);

          // Update conversation state based on response
          await this.updateConversationState(userInput, response);
        }

      } catch (error) {
        console.error('❌ An error occurred:', error);
        console.log('Please try again.\n');
      }
    }

    // Cleanup
    await this.cleanup();
  }

  private async updateConversationState(userInput: string, aiResponse: string): Promise<void> {
    // Simple state tracking for issue creation
    const lowerInput = userInput.toLowerCase();
    const lowerResponse = aiResponse.toLowerCase();

    // Detect if user wants to create an issue
    if (lowerInput.includes('create') && (lowerInput.includes('issue') || lowerInput.includes('ticket'))) {
      this.state.isCreatingIssue = true;
      console.log('🎯 Issue creation mode activated');
    }

    // Extract information from conversation if we're creating an issue
    if (this.state.isCreatingIssue) {
      await this.extractIssueData(userInput, aiResponse);
      
      // Check if we have enough information to create the issue
      if (this.hasRequiredIssueData()) {
        console.log('\n📋 All required information collected!');
        await this.attemptIssueCreation();
      }
    }

    // Handle search requests
    if (lowerInput.includes('search') || lowerInput.includes('find')) {
      if (lowerInput.includes('issue') || lowerInput.includes('ticket')) {
        await this.handleSearchRequest(userInput);
      }
    }
  }

  private async extractIssueData(userInput: string, aiResponse: string): Promise<void> {
    const lowerInput = userInput.toLowerCase();
    
    // Extract project information - look for common patterns
    if (!this.state.issueData.project) {
      const projectPatterns = [
        /project\s+([A-Z]+\w*)/i,
        /([A-Z]+\w*)\s+project/i,
        /in\s+([A-Z]+\w*)/i,
        /for\s+([A-Z]+\w*)/i
      ];
      
      for (const pattern of projectPatterns) {
        const match = userInput.match(pattern);
        if (match) {
          this.state.issueData.project = match[1].toUpperCase();
          console.log(`📂 Project extracted: ${this.state.issueData.project}`);
          break;
        }
      }
    }

    // Extract issue type with more patterns
    if (!this.state.issueData.issueType) {
      const typePatterns = [
        /\b(bug|defect|issue)\b/i,
        /\b(task|todo)\b/i,
        /\b(story|feature|requirement)\b/i,
        /\b(epic)\b/i,
        /create\s+a\s+(\w+)/i
      ];
      
      for (const pattern of typePatterns) {
        const match = userInput.match(pattern);
        if (match) {
          const type = match[1].toLowerCase();
          if (type === 'defect' || type === 'issue') {
            this.state.issueData.issueType = 'Bug';
          } else if (type === 'todo') {
            this.state.issueData.issueType = 'Task';
          } else if (type === 'feature' || type === 'requirement') {
            this.state.issueData.issueType = 'Story';
          } else {
            this.state.issueData.issueType = type.charAt(0).toUpperCase() + type.slice(1);
          }
          console.log(`🏷️  Issue type extracted: ${this.state.issueData.issueType}`);
          break;
        }
      }
    }

    // Extract priority with more patterns
    if (!this.state.issueData.priority) {
      const priorityPatterns = [
        /\b(low|minor)\b/i,
        /\b(medium|normal|standard)\b/i,
        /\b(high|important|urgent)\b/i,
        /\b(critical|blocker|severe)\b/i
      ];
      
      for (const pattern of priorityPatterns) {
        const match = userInput.match(pattern);
        if (match) {
          const priority = match[1].toLowerCase();
          if (priority === 'minor') {
            this.state.issueData.priority = 'Low';
          } else if (priority === 'normal' || priority === 'standard') {
            this.state.issueData.priority = 'Medium';
          } else if (priority === 'important' || priority === 'urgent') {
            this.state.issueData.priority = 'High';
          } else if (priority === 'blocker' || priority === 'severe') {
            this.state.issueData.priority = 'Critical';
          } else {
            this.state.issueData.priority = priority.charAt(0).toUpperCase() + priority.slice(1);
          }
          console.log(`⚡ Priority extracted: ${this.state.issueData.priority}`);
          break;
        }
      }
    }

    // Enhanced title extraction
    if (!this.state.issueData.title) {
      // Look for quoted text first
      const quotedMatch = userInput.match(/"([^"]+)"/);
      if (quotedMatch) {
        this.state.issueData.title = quotedMatch[1];
        console.log(`📝 Title extracted from quotes: ${this.state.issueData.title}`);
      } else {
        // Remove common prefixes and extract meaningful content
        let cleanedInput = userInput
          .replace(/^(create|make|add|new)\s+(a\s+)?(bug|task|story|epic|issue|ticket)?\s*(in|for|about)?\s*/i, '')
          .replace(/project\s+\w+/i, '')
          .replace(/\b(high|low|medium|critical)\s+priority\b/i, '')
          .trim();
        
        if (cleanedInput.length > 10 && cleanedInput.length < 150) {
          // Take the first sentence or meaningful phrase
          const firstSentence = cleanedInput.split(/[.!?]/)[0];
          if (firstSentence.length > 5) {
            this.state.issueData.title = firstSentence.trim();
            console.log(`📝 Title extracted: ${this.state.issueData.title}`);
          }
        }
      }
    }

    // Enhanced description extraction
    if (!this.state.issueData.description && userInput.length > 30) {
      // Use the full user input as description if it's substantial
      if (!this.state.issueData.title || userInput !== this.state.issueData.title) {
        this.state.issueData.description = userInput;
        console.log('📄 Description captured from user input');
      }
    }

    // Show current state
    this.showCollectedInfo();
  }

  private showCollectedInfo(): void {
    const collected = [];
    const missing = [];

    if (this.state.issueData.project) {
      collected.push(`Project: ${this.state.issueData.project}`);
    } else {
      missing.push('project');
    }

    if (this.state.issueData.title) {
      collected.push(`Title: ${this.state.issueData.title}`);
    } else {
      missing.push('title/summary');
    }

    if (this.state.issueData.issueType) {
      collected.push(`Type: ${this.state.issueData.issueType}`);
    }

    if (this.state.issueData.priority) {
      collected.push(`Priority: ${this.state.issueData.priority}`);
    }

    if (collected.length > 0) {
      console.log(`📊 Collected: ${collected.join(', ')}`);
    }

    if (missing.length > 0 && this.state.isCreatingIssue) {
      console.log(`❓ Still need: ${missing.join(', ')}`);
    }
  }

  private hasRequiredIssueData(): boolean {
    return !!(this.state.issueData.project && this.state.issueData.title);
  }

  private async attemptIssueCreation(): Promise<void> {
    if (!this.zapierService.isReady()) {
      console.log('❌ Cannot create issue: Zapier service not connected');
      this.resetIssueState();
      return;
    }

    try {
      // Check for similar issues first (bonus feature)
      if (this.state.issueData.title) {
        console.log('🔍 Checking for similar issues...');
        const similarIssues = await this.zapierService.findSimilarIssues(
          this.state.issueData.title,
          this.state.issueData.description
        );

        if (similarIssues.length > 0) {
          console.log('\n⚠️  Found potentially similar issues:');
          similarIssues.forEach((issue, index) => {
            console.log(`  ${index + 1}. ${issue.key}: ${issue.summary}`);
          });
          console.log('\nProceeding with creation anyway...\n');
        }
      }

      // Create the issue using the MCP tool directly
      console.log('🚀 Creating Jira issue with collected information...');
      console.log('📋 Issue Details:');
      console.log(`   Project: ${this.state.issueData.project}`);
      console.log(`   Title: ${this.state.issueData.title}`);
      console.log(`   Type: ${this.state.issueData.issueType || 'Task'}`);
      console.log(`   Priority: ${this.state.issueData.priority || 'Medium'}`);
      if (this.state.issueData.description) {
        console.log(`   Description: ${this.state.issueData.description.substring(0, 100)}${this.state.issueData.description.length > 100 ? '...' : ''}`);
      }
      console.log('');

      // Execute the actual Jira creation via MCP
      const result = await this.zapierService.createJiraIssue(this.state.issueData);
      
      if (result.success) {
        console.log('🎉 SUCCESS! Jira issue has been created!');
        
        if (result.key) {
          console.log(`📝 Issue Key: ${result.key}`);
        }
        
        if (result.url) {
          console.log(`🔗 Issue Link: ${result.url}`);
        } else if (result.key) {
          // Construct likely URL format (this may need adjustment based on your Jira instance)
          console.log(`🔗 Issue Link: https://your-domain.atlassian.net/browse/${result.key}`);
        }
        
        console.log(`📄 Response Details: ${result.response}`);
        
        // Inform the chatbot about the successful creation
        this.chatbot.addAssistantMessage(
          `✅ Great! I've successfully created your Jira issue with key ${result.key || 'N/A'}. The issue has been added to your Jira project and you can view it using the link above. Is there anything else you'd like me to help you with?`
        );
        
      } else {
        console.log('❌ Issue creation failed');
        console.log(`Details: ${result.response || result.error || 'Unknown error'}`);
        
        this.chatbot.addAssistantMessage(
          `❌ I encountered an issue while creating your Jira ticket. The error was: ${result.response || result.error || 'Unknown error'}. Would you like to try again or modify any of the details?`
        );
      }
      
      console.log('');

    } catch (error) {
      console.error('❌ Failed to create Jira issue:', error);
      console.log('Please check your issue details and Zapier MCP connection.\n');
      
      this.chatbot.addAssistantMessage(
        `❌ I encountered a technical error while trying to create the Jira issue: ${error}. Please check your connection and try again.`
      );
    } finally {
      this.resetIssueState();
    }
  }

  private async handleSearchRequest(userInput: string): Promise<void> {
    if (!this.zapierService.isReady()) {
      console.log('❌ Cannot search issues: Zapier service not connected');
      return;
    }

    // Extract search query from user input
    const searchQuery = userInput.replace(/search|find|for|issues?|tickets?/gi, '').trim();
    
    if (searchQuery.length < 3) {
      console.log('Please provide a more specific search term.');
      return;
    }

    try {
      console.log(`🔍 Searching for: "${searchQuery}"`);
      const results = await this.zapierService.searchJiraIssues(searchQuery);
      
      if (results.length === 0) {
        console.log('No issues found matching your search.');
      } else {
        console.log(`\n📋 Found ${results.length} issue(s):`);
        results.slice(0, 5).forEach((issue, index) => { // Show max 5 results
          console.log(`  ${index + 1}. ${issue.key}: ${issue.summary}`);
        });
        if (results.length > 5) {
          console.log(`  ... and ${results.length - 5} more`);
        }
        console.log('');
      }
      
    } catch (error) {
      console.error('❌ Search failed:', error);
    }
  }

  private resetIssueState(): void {
    this.state.isCreatingIssue = false;
    this.state.issueData = {};
    console.log('🔄 Ready for next operation\n');
  }

  private async cleanup(): Promise<void> {
    this.chatbot.close();
    await this.zapierService.cleanup();
    console.log('🧹 Cleanup completed');
  }

  // Getters for testing and debugging
  getState(): ConversationState {
    return { ...this.state };
  }

  getConversationHistory() {
    return this.chatbot.getConversationHistory();
  }

  getZapierService(): ZapierService {
    return this.zapierService;
  }
}