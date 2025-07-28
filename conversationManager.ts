import { ConversationState, IssueCreationStep } from './types';
import { InformationExtractor } from './informationExtractor';
import { IssueCreationFlow } from './issueCreationFlow';
import { AIParameterExtractor, ExtractedParameters } from './aiParameterExtractor';
import { Chatbot } from './chatbot';

export class ConversationManager {
  private extractor: InformationExtractor;
  private issueFlow: IssueCreationFlow;
  private aiExtractor: AIParameterExtractor;

  constructor() {
    this.extractor = new InformationExtractor();
    this.issueFlow = new IssueCreationFlow();
    this.aiExtractor = new AIParameterExtractor();
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
        return await this.startIssueCreationWithAI(userInput, state, chatbot);
      } else if (this.extractor.detectsSearchIntent(userInput)) {
        const searchQuery = this.extractor.extractSearchQuery(userInput);
        return { action: 'search', searchQuery };
      } else {
        return { action: 'regular_chat' };
      }
    }
  }

  private async startIssueCreationWithAI(
    userInput: string, 
    state: ConversationState, 
    chatbot: Chatbot
  ): Promise<{
    action: 'continue' | 'create_issue';
    message?: string;
  }> {
    console.log('🎯 Starting AI-enhanced issue creation...');
    
    state.isCreatingIssue = true;
    state.currentStep = IssueCreationStep.AI_EXTRACTING;

    try {
      // Phase 1: AI Parameter Extraction
      console.log('🤖 Extracting parameters with AI...');
      const extracted = await this.aiExtractor.extractParameters(userInput);
      const validated = this.aiExtractor.validateExtractedParameters(extracted);
      
      // Phase 2: Identify Missing Parameters
      const missing = this.aiExtractor.identifyMissingParameters(validated, 0.6);
      
      // Store extraction results
      state.extractedParameters = validated;
      state.missingParameters = missing;
      
      // Phase 3: Convert extracted parameters to issueData
      this.convertExtractedToIssueData(validated, state);
      
      // Phase 4: Route Based on Completeness
      if (missing.length === 0) {
        console.log('🎉 All parameters extracted! Ready to create issue.');
        return { action: 'create_issue' };
      } else {
        console.log(`📋 Need to collect ${missing.length} missing parameter(s): ${missing.join(', ')}`);
        
        // Start collecting missing parameters
        const contextPhrase = this.aiExtractor.buildContextPhrase(validated);
        const firstQuestion = this.generateQuestionForParameter(missing[0], contextPhrase);
        
        state.currentStep = this.getStepForParameter(missing[0]);
        state.hasAskedFor.add(missing[0]);
        
        return {
          action: 'continue',
          message: firstQuestion
        };
      }

    } catch (error) {
      console.error('❌ AI extraction failed, falling back to traditional flow:', error);
      
      // Fallback to traditional step-by-step flow
      this.issueFlow.startIssueCreation(userInput, state);
      const nextStep = this.issueFlow.determineNextStep(state);
      const question = this.issueFlow.getQuestionForStep(nextStep);
      
      state.currentStep = nextStep;
      this.markStepAsAsked(nextStep, state);

      return {
        action: 'continue',
        message: question
      };
    }
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

    // Handle confirmation step in AI flow
    if (state.currentStep === IssueCreationStep.CONFIRMING_DETAILS && state.extractedParameters) {
      const lowerInput = userInput.toLowerCase();
      if (lowerInput.includes('yes') || lowerInput.includes('confirm') || lowerInput.includes('create')) {
        return { action: 'create_issue' };
      } else if (lowerInput.includes('no') || lowerInput.includes('cancel')) {
        this.issueFlow.resetState(state);
        return {
          action: 'cancel',
          message: "No problem! Issue creation has been cancelled. Let me know if you need help with anything else."
        };
      } else {
        return {
          action: 'continue',
          message: "Please confirm by saying 'yes' to create the issue, or 'no' to cancel."
        };
      }
    }

    // If we have missing parameters from AI extraction, handle them dynamically
    if (state.missingParameters && state.missingParameters.length > 0) {
      return await this.handleMissingParameterCollection(userInput, state);
    }

    // Otherwise, fall back to traditional step-by-step flow
    const result = this.issueFlow.processResponse(userInput, state.currentStep, state);
    
    if (!result.success) {
      return {
        action: 'continue',
        message: result.errorMessage || "Please try again."
      };
    }

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

    const nextStep = this.issueFlow.determineNextStep(state);
    
    if (nextStep === IssueCreationStep.CONFIRMING_DETAILS) {
      this.issueFlow.displayIssueSummary(state.issueData);
      state.currentStep = nextStep;
      
      return {
        action: 'continue',
        message: this.issueFlow.getQuestionForStep(nextStep)
      };
    } else if (nextStep === IssueCreationStep.READY_TO_CREATE) {
      return { action: 'create_issue' };
    } else {
      state.currentStep = nextStep;
      this.markStepAsAsked(nextStep, state);
      
      return {
        action: 'continue',
        message: this.issueFlow.getQuestionForStep(nextStep)
      };
    }
  }

  private async handleMissingParameterCollection(
    userInput: string,
    state: ConversationState
  ): Promise<{
    action: 'continue' | 'create_issue';
    message?: string;
  }> {
    const currentMissing = state.missingParameters![0]; // Get the first missing parameter
    
    // Process the user's response for the current missing parameter
    const success = this.processParameterResponse(userInput, currentMissing, state);
    
    if (!success) {
      // Invalid response, ask again
      const contextPhrase = this.aiExtractor.buildContextPhrase(state.extractedParameters!);
      return {
        action: 'continue',
        message: this.generateQuestionForParameter(currentMissing, contextPhrase) + ' Please provide a valid response.'
      };
    }

    // Remove the parameter we just collected
    state.missingParameters = state.missingParameters!.slice(1);
    
    // Check if we have more missing parameters
    if (state.missingParameters.length === 0) {
      console.log('🎉 All missing parameters collected! Ready to create issue.');
      
      // Show confirmation summary
      this.displayAIExtractedSummary(state);
      state.currentStep = IssueCreationStep.CONFIRMING_DETAILS;
      
      return {
        action: 'continue',
        message: "Please review the issue details above. Would you like me to create this issue? (yes/no)"
      };
    } else {
      // Ask for the next missing parameter
      const nextMissing = state.missingParameters[0];
      const contextPhrase = this.aiExtractor.buildContextPhrase(state.extractedParameters!);
      const nextQuestion = this.generateQuestionForParameter(nextMissing, contextPhrase);
      
      state.currentStep = this.getStepForParameter(nextMissing);
      
      return {
        action: 'continue',
        message: nextQuestion
      };
    }
  }

  private convertExtractedToIssueData(extracted: ExtractedParameters, state: ConversationState): void {
    // Convert high-confidence extracted parameters to issueData
    if (extracted.title.value && extracted.title.confidence >= 0.6) {
      state.issueData.title = extracted.title.value;
    }
    if (extracted.type.value && extracted.type.confidence >= 0.6) {
      state.issueData.issueType = extracted.type.value;
    }
    if (extracted.project.value && extracted.project.confidence >= 0.6) {
      state.issueData.project = extracted.project.value;
    }
    if (extracted.priority.value && extracted.priority.confidence >= 0.6) {
      state.issueData.priority = extracted.priority.value;
    }
    if (extracted.description.value && extracted.description.confidence >= 0.6) {
      state.issueData.description = extracted.description.value;
    }
  }

  private processParameterResponse(userInput: string, parameter: string, state: ConversationState): boolean {
    switch (parameter) {
      case 'project':
        const project = this.extractor.extractProjectFromResponse(userInput);
        if (project) {
          state.issueData.project = project;
          console.log(`📂 Project collected: ${project}`);
          return true;
        }
        break;
        
      case 'type':
        const type = this.extractor.extractIssueTypeFromResponse(userInput);
        if (type) {
          state.issueData.issueType = type;
          console.log(`🏷️  Type collected: ${type}`);
          return true;
        }
        break;
        
      case 'title':
        const title = this.extractor.extractTitleFromResponse(userInput);
        if (title) {
          state.issueData.title = title;
          console.log(`📝 Title collected: ${title}`);
          return true;
        }
        break;
        
      case 'description':
        const description = this.extractor.extractDescriptionFromResponse(userInput);
        state.issueData.description = description;
        console.log(`📄 Description collected: ${description ? 'provided' : 'skipped'}`);
        return true;
        
      case 'priority':
        const priority = this.extractor.extractPriorityFromResponse(userInput);
        if (priority) {
          state.issueData.priority = priority;
          console.log(`⚡ Priority collected: ${priority}`);
          return true;
        }
        break;
    }
    
    return false;
  }

  private generateQuestionForParameter(parameter: string, contextPhrase: string): string {
    switch (parameter) {
      case 'project':
        return `${contextPhrase}. Which project should this go in? (FV Product, FV Engineering, FV Demo (Issues), or FV Demo (Product))`;
      case 'type':
        return `${contextPhrase}. What type of issue should this be? (Bug, Task, Story, or Epic)`;
      case 'title':
        return `${contextPhrase}. What should be the title of this issue?`;
      case 'description':
        return `${contextPhrase}. Please provide a description for this issue.`;
      case 'priority':
        return `${contextPhrase}. What priority should this have? (Lowest, Low, Medium, High, or Highest)`;
      default:
        return `${contextPhrase}. I need more information to proceed.`;
    }
  }

  private getStepForParameter(parameter: string): IssueCreationStep {
    switch (parameter) {
      case 'project': return IssueCreationStep.ASKING_PROJECT;
      case 'type': return IssueCreationStep.ASKING_TYPE;
      case 'title': return IssueCreationStep.ASKING_TITLE;
      case 'description': return IssueCreationStep.ASKING_DESCRIPTION;
      case 'priority': return IssueCreationStep.ASKING_PRIORITY;
      default: return IssueCreationStep.ASKING_TITLE;
    }
  }

  private markStepAsAsked(step: IssueCreationStep, state: ConversationState): void {
    switch (step) {
      case IssueCreationStep.ASKING_PROJECT:
        state.hasAskedFor.add('project');
        break;
      case IssueCreationStep.ASKING_TYPE:
        state.hasAskedFor.add('type');
        break;
      case IssueCreationStep.ASKING_TITLE:
        state.hasAskedFor.add('title');
        break;
      case IssueCreationStep.ASKING_DESCRIPTION:
        state.hasAskedFor.add('description');
        break;
      case IssueCreationStep.ASKING_PRIORITY:
        state.hasAskedFor.add('priority');
        break;
    }
  }

  private displayAIExtractedSummary(state: ConversationState): void {
    console.log('\n📋 Issue Summary (AI + Follow-up):');
    console.log('══════════════════════════════════════');
    
    if (state.issueData.project) {
      const source = state.extractedParameters?.project?.confidence >= 0.6 ? '🤖' : '💬';
      console.log(`📂 Project: ${state.issueData.project} ${source}`);
    }
    
    if (state.issueData.issueType) {
      const source = state.extractedParameters?.type?.confidence >= 0.6 ? '🤖' : '💬';
      console.log(`🏷️  Type: ${state.issueData.issueType} ${source}`);
    }
    
    if (state.issueData.title) {
      const source = state.extractedParameters?.title?.confidence >= 0.6 ? '🤖' : '💬';
      console.log(`📝 Title: ${state.issueData.title} ${source}`);
    }
    
    if (state.issueData.priority) {
      const source = state.extractedParameters?.priority?.confidence >= 0.6 ? '🤖' : '💬';
      console.log(`⚡ Priority: ${state.issueData.priority} ${source}`);
    }
    
    if (state.issueData.description) {
      const source = state.extractedParameters?.description?.confidence >= 0.6 ? '🤖' : '💬';
      const truncated = state.issueData.description.length > 100 
        ? state.issueData.description.substring(0, 100) + '...' 
        : state.issueData.description;
      console.log(`📄 Description: ${truncated} ${source}`);
    }
    
    console.log('══════════════════════════════════════');
    console.log('🤖 = AI extracted, 💬 = Follow-up question');
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
