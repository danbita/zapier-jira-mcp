# Jira AI Agent

A conversational AI agent that creates and manages Jira issues through natural language chat. Built with TypeScript and integrates with Jira via Zapier's Model Context Protocol (MCP).

## ✨ Features

- **Natural Language Issue Creation** - Just describe what you need: *"Create a bug in project Demo about login not working"*
- **Guided Conversations** - Agent asks follow-up questions to gather all required details
- **Real Jira Integration** - Creates actual issues in your Jira workspace
- **Issue Search** - Find existing issues to avoid duplicates
- **Smart Data Extraction** - Automatically detects projects, priorities, and issue types from your messages

## 🚀 Quick Start

### Prerequisites
- Node.js (v18+)
- Yarn package manager
- OpenAI API key
- Zapier MCP account with Jira connection

### Installation

1. **Clone and setup**
   ```bash
   git clone <your-repo>
   cd zapier-ai-agent-node
   yarn install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your credentials:
   ```env
   OPENAI_API_KEY=your_openai_api_key_here
   ZAPIER_MCP_URL=your_zapier_mcp_server_url_here
   ```

3. **Setup Zapier MCP**
   - Create account at [mcp.zapier.com](https://mcp.zapier.com)
   - Connect to your Jira workspace
   - Copy your MCP server URL to `.env`

4. **Run the agent**
   ```bash
   yarn start
   ```

## 💬 How to Use

### Creating Issues
```
You: Hello, I need to create a new issue
Agent: I'll help you create a Jira issue! Which project should this go in?
You: Demo project
Agent: What type of issue? Bug, Task, Story, or Epic?
You: Bug
Agent: What should be the title of this issue?
You: Login button not responding on mobile
Agent: Please provide a description...
You: Users can't tap the login button on iPhone Safari
Agent: What priority? Lowest, Low, Medium, High, or Highest?
You: High
Agent: [Shows summary] Would you like me to create this issue? (yes/no)
You: yes
Agent: ✅ Issue DPI-1050 created successfully!
       🔗 https://yourcompany.atlassian.net/browse/DPI-1050
```

### Searching Issues
```
You: Find issues about login problems
Agent: 🔍 Found 3 issue(s):
       1. DPI-1050: Login button not responding on mobile
       2. DPI-1023: Login timeout errors
       3. DPI-1015: Login form validation issues
```

### Quick Commands
- Say **"exit"** to quit
- Say **"cancel"** during issue creation to abort
- Use **quotes** for exact titles: *"Create issue titled 'Fix header styling'"*

## 🏗️ Architecture

```
├── index.ts                 # Main entry point
├── jiraAgent.ts            # Core agent orchestrator
├── conversationManager.ts  # Conversation flow management  
├── issueCreationFlow.ts    # Step-by-step issue creation
├── informationExtractor.ts # Parse user input for data
├── zapierService.ts        # Jira operations via Zapier MCP
├── mcpClient.ts           # MCP protocol handler
├── chatbot.ts             # OpenAI integration
├── types.ts               # TypeScript type definitions
└── config.ts              # Configuration and environment
```

## 🔧 Configuration

### Jira Project Setup
Make sure your Jira projects have the standard issue types:
- **Bug** - For defects and problems
- **Task** - For work items (supports priority)
- **Story** - For features and requirements  
- **Epic** - For large initiatives

### Priority Levels
The agent supports these priority levels:
- **Lowest** - Minor issues
- **Low** - Small problems
- **Medium** - Standard priority
- **High** - Important issues
- **Highest** - Critical problems

*Note: Priority may only apply to certain issue types depending on your Jira configuration.*

## 🛠️ Development

### Project Structure
The codebase is modular for easy maintenance:
- Each file has a single responsibility
- Clean separation between conversation, data extraction, and API calls
- TypeScript for type safety and better development experience

### Adding Features
- **New conversation flows**: Extend `conversationManager.ts`
- **Additional Jira operations**: Add methods to `zapierService.ts`
- **Enhanced data extraction**: Improve patterns in `informationExtractor.ts`

## 📝 Example Interactions

**Quick Issue Creation:**
```
You: Create a high priority task in Engineering project about updating documentation
Agent: [Extracts: project=Engineering, type=Task, priority=High]
       What should be the title of this issue?
You: Update API documentation for new endpoints
Agent: [Continues with description, then creates issue]
```

**Smart Project Detection:**
```
You: I need a bug for the demo project
Agent: [Recognizes "demo" → maps to "FV Demo (Issues)" project]
       What should be the title of this bug?
```

## 🆘 Troubleshooting

**Connection Issues:**
- Verify your `.env` file has correct API keys
- Test your Zapier MCP connection at [mcp.zapier.com](https://mcp.zapier.com)

**Permission Errors:**
- Ensure your Zapier account has access to create issues in the target Jira project
- Check that your Jira user has the necessary permissions

**Priority Not Showing:**
- Some issue types (like Bugs) may not support priority in your Jira configuration
- Priority works correctly for Tasks in most setups

## 📄 License

This project is licensed under the MIT License.

---

**Built with ❤️ using TypeScript, OpenAI GPT-4, and Zapier MCP**
