import { ConversationState, IssueCreationStep } from './types';
import { InformationExtractor } from './informationExtractor';
import { IssueCreationFlow } from './issueCreationFlow';
import { Chatbot } from './chatbot';

export class ConversationManager {
  private extractor: InformationExtractor;
  private issueFlow: IssueCreationFlow;

  constructor() {
    this.extractor = new InformationExtractor();
    this.issueFlow = new IssueCreationFlow();
  }

  async processUserInput(
    userInput: string, 
    state: ConversationState, 
    chatbot: Chatbot
  ): Promise<{
    action: 'continue' | 'create_issue' | 'search' | 'cancel' | 'regular_chat';
    message?: string;
    searchQuery?: string;
  }> {
    // If we're in issue creation mode, handle the flow
    if (state.isCreatingIssue) {
      return await this.handleIssueCreationFlow(userInput, state, chatbot);
    } else {
      // Check what the user wants to do
      if (this.extractor.detectsIssueCreationIntent(userInput)) {
        return await this.startIssueCreation(userInput, state, chatbot);
      } else if (this.extractor.detectsSearchIntent(userInput)) {
        const searchQuery = this.extractor.extractSearchQuery(userInput);
        return { action: 'search', searchQuery };
      } else {
        return { action: 'regular_chat' };
      }
    }
  }

  private async startIssueCreation(
    userInput: string, 
    state: ConversationState, 
    chatbot: Chatbot
  ): Promise<{
    action: 'continue';
    message: string;
  }> {
    this.issueFlow.startIssueCreation(userInput, state);
    
    // Start the guided flow
    const nextStep = this.issueFlow.determineNextStep(state);
    const question = this.issueFlow.getQuestionForStep(nextStep);
    
    state.currentStep = nextStep;
    if (nextStep === IssueCreationStep.ASKING_PROJECT) {
      state.hasAskedFor.add('project');
    } else if (nextStep === IssueCreationStep.ASKING_TYPE) {
      state.hasAskedFor.add('type');
    } else if (nextStep === IssueCreationStep.ASKING_TITLE) {
      state.hasAskedFor.add('title');
    } else if (nextStep === IssueCreationStep.ASKING_DESCRIPTION) {
      state.hasAskedFor.add('description');
    } else if (nextStep === IssueCreationStep.ASKING_PRIORITY) {
      state.hasAskedFor.add('priority');
    }

    return {
      action: 'continue',
      message: question
    };
  }

  private async handleIssueCreationFlow(
    userInput: string, 
    state: ConversationState, 
    chatbot: Chatbot
  ): Promise<{
    action: 'continue' | 'create_issue' | 'cancel';
    message?: string;
  }> {
    // Check for cancellation
    if (this.issueFlow.checkForCancellation(userInput)) {
      this.issueFlow.resetState(state);
      return {
        action: 'cancel',
        message: "No problem! Issue creation has been cancelled. Let me know if you need help with anything else."
      };
    }

    // Process the response based on current step
    const result = this.issueFlow.processResponse(userInput, state.currentStep, state);
    
    if (!result.success) {
      // Invalid response, ask again
      return {
        action: 'continue',
        message: result.errorMessage || "Please try again."
      };
    }

    // Handle confirmation step specially
    if (state.currentStep === IssueCreationStep.CONFIRMING_DETAILS) {
      if (result.value === 'confirmed') {
        return { action: 'create_issue' };
      } else if (result.value === 'cancelled') {
        this.issueFlow.resetState(state);
        return {
          action: 'cancel',
          message: "No problem! Issue creation has been cancelled. Let me know if you need help with anything else."
        };
      }
    }

    // Move to next step
    const nextStep = this.issueFlow.determineNextStep(state);
    
    if (nextStep === IssueCreationStep.CONFIRMING_DETAILS) {
      // Show summary and ask for confirmation
      this.issueFlow.displayIssueSummary(state.issueData);
      state.currentStep = nextStep;
      
      return {
        action: 'continue',
        message: this.issueFlow.getQuestionForStep(nextStep)
      };
    } else if (nextStep === IssueCreationStep.READY_TO_CREATE) {
      // All data collected, ready to create
      return { action: 'create_issue' };
    } else {
      // Continue with next question
      state.currentStep = nextStep;
      
      // Mark what we're asking for
      if (nextStep === IssueCreationStep.ASKING_PROJECT) {
        state.hasAskedFor.add('project');
      } else if (nextStep === IssueCreationStep.ASKING_TYPE) {
        state.hasAskedFor.add('type');
      } else if (nextStep === IssueCreationStep.ASKING_TITLE) {
        state.hasAskedFor.add('title');
      } else if (nextStep === IssueCreationStep.ASKING_DESCRIPTION) {
        state.hasAskedFor.add('description');
      } else if (nextStep === IssueCreationStep.ASKING_PRIORITY) {
        state.hasAskedFor.add('priority');
      }
      
      return {
        action: 'continue',
        message: this.issueFlow.getQuestionForStep(nextStep)
      };
    }
  }

  formatSuccessMessage(result: any, issueData: any): string {
    return `✅ Perfect! I've successfully created your Jira issue with key ${result.key || 'N/A'}. The issue "${result.summary || issueData.title}" has been added to your ${result.project || issueData.project} project. You can view it at the link provided above. Is there anything else you'd like me to help you with?`;
  }

  formatErrorMessage(result: any): string {
    return `❌ I encountered an issue while creating your Jira ticket. The error was: ${result.error || result.response || 'Unknown error'}. Would you like to try again?`;
  }

  displayCreationDetails(issueData: any): void {
    console.log('🚀 Creating Jira issue with collected information...');
    console.log('📋 Issue Details:');
    console.log(`   Project: ${issueData.project}`);
    console.log(`   Title: ${issueData.title}`);
    console.log(`   Type: ${issueData.issueType}`);
    console.log(`   Priority: ${issueData.priority}`);
    if (issueData.description) {
      console.log(`   Description: ${issueData.description.substring(0, 100)}${issueData.description.length > 100 ? '...' : ''}`);
    }
    console.log('');
  }

  displaySuccessResult(result: any): void {
    console.log('🎉 SUCCESS! Jira issue has been created!');
    console.log('═'.repeat(50));
    
    if (result.key) {
      console.log(`📝 Issue Key: ${result.key}`);
    }
    
    if (result.url) {
      console.log(`🔗 Issue Link: ${result.url}`);
    }
    
    if (result.project) {
      console.log(`📂 Project: ${result.project}`);
    }
    
    if (result.summary) {
      console.log(`📋 Summary: ${result.summary}`);
    }
    
    if (result.issueType) {
      console.log(`🏷️  Type: ${result.issueType}`);
    }
    
    if (result.priority) {
      console.log(`⚡ Priority: ${result.priority}`);
    }
    
    if (result.status) {
      console.log(`📊 Status: ${result.status}`);
    }
    
    console.log('═'.repeat(50));
    console.log(`✨ ${result.response}`);
  }

  displayFailureResult(result: any): void {
    console.log('❌ FAILED: Issue creation was not successful');
    console.log('═'.repeat(50));
    
    if (result.error) {
      console.log(`💥 Error: ${result.error}`);
    }
    
    if (result.response) {
      console.log(`📄 Details: ${result.response}`);
    }
    
    console.log('═'.repeat(50));
  }

  resetConversationState(state: ConversationState): void {
    this.issueFlow.resetState(state);
  }
}