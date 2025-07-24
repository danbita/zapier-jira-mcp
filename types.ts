export interface IssueData {
    project?: string;
    issueType?: string;
    title?: string;
    description?: string;
    priority?: string;
  }
  
  export interface ConversationState {
    isCreatingIssue: boolean;
    issueData: IssueData;
    currentStep: IssueCreationStep;
    hasAskedFor: Set<string>;
  }
  
  export enum IssueCreationStep {
    DETECTING_INTENT = 'detecting_intent',
    ASKING_PROJECT = 'asking_project',
    ASKING_TYPE = 'asking_type', 
    ASKING_TITLE = 'asking_title',
    ASKING_DESCRIPTION = 'asking_description',
    ASKING_PRIORITY = 'asking_priority',
    CONFIRMING_DETAILS = 'confirming_details',
    READY_TO_CREATE = 'ready_to_create'
  }
  
  export interface JiraIssue {
    id: string;
    key: string;
    summary: string;
    description: string;
    issueType: string;
    priority: string;
    status: string;
    project: string;
    created: string;
    updated: string;
  }
  
  export enum IssueType {
    BUG = 'Bug',
    TASK = 'Task',
    STORY = 'Story',
    EPIC = 'Epic'
  }
  
  export enum Priority {
    LOW = 'Low',
    MEDIUM = 'Medium',
    HIGH = 'High',
    CRITICAL = 'Critical'
  }
  
  // MCP and Zapier specific types
  export interface MCPToolCall {
    name: string;
    arguments: Record<string, any>;
  }
  
  export interface MCPToolResult {
    content: Array<{
      type: string;
      text: string;
    }>;
    isError?: boolean;
  }
  
  export interface ZapierJiraCreateIssueArgs {
    instructions: string;
    project: string;
    summary?: string;
    description?: string;
    issueType?: string;
    priority?: string;
  }
  
  export interface ZapierJiraSearchArgs {
    instructions: string;
    summary?: string;
    key?: string;
    jql?: string;
  }
