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
    error?: any; // Optional error details for richer error reporting
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