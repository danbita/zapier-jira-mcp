# Jira AI Agent

A conversational AI agent that creates and manages Jira issues through natural language chat. Built with TypeScript and integrates with Jira via Zapier's Model Context Protocol (MCP).

## ✨ Features

- **Smart Issue Creation** - Just describe what you need: *"Create a bug in FV Engineering about login not working"*
- **Intelligent Defaults** - Automatically sets sensible defaults (Bug type, FV Demo Issues project, Medium priority)
- **Minimal Questions** - Only asks for title and description if missing
- **Multi-Project Support** - Create issues in FV Demo (Issues), FV Demo (Product), FV Engineering, or FV Product
- **Real Jira Integration** - Creates actual issues in your Jira workspace
- **Issue Search** - Find existing issues to avoid duplicates

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

### Quick Issue Creation
```
You: Create a bug in FV Engineering about API timeout
Agent: What should be the title of this issue?
You: API Gateway timeout errors
Agent: Please provide a description...
You: Users experiencing 30-second timeouts on API calls
Agent: ✅ Issue ENG-1234 created successfully!
```

### Smart Defaults
The agent automatically applies defaults when not specified:
- **Type**: Bug
- **Project**: FV Demo (Issues) 
- **Priority**: Medium

### Supported Projects
- **FV Demo (Issues)** - General bug reports and issues
- **FV Demo (Product)** - Product-related work  
- **FV Engineering** - Engineering tasks and bugs
- **FV Product** - Product management items

### Project Shortcuts
```
"engineering" → FV Engineering
"demo product" → FV Demo (Product)
"product" → FV Product
"demo" or "issues" → FV Demo (Issues)
```

### Searching Issues
```
You: Find issues about login problems
Agent: 🔍 Found 3 issue(s):
       1. ENG-1050: Login button not responding on mobile
       2. ENG-1023: Login timeout errors
       3. DEMO-1015: Login form validation issues
```

## 🏗️ Architecture

```
├── index.ts                 # Main entry point
├── jiraAgent.ts            # Core agent orchestrator
├── conversationManager.ts  # Conversation flow management  
├── aiParameterExtractor.ts # AI-powered parameter extraction
├── informationExtractor.ts # Fallback parameter parsing
├── issueCreationFlow.ts    # Traditional step-by-step flow
├── zapierService.ts        # Jira operations via Zapier MCP
├── mcpClient.ts           # MCP protocol handler
├── chatbot.ts             # OpenAI integration
├── types.ts               # TypeScript definitions
└── config.ts              # Configuration and environment
```

## 🔧 How It Works

1. **AI Parameter Extraction** - Uses GPT-4 to extract project, type, priority, title, and description from natural language
2. **Smart Defaults** - Automatically fills missing type, project, and priority with sensible defaults
3. **Targeted Questions** - Only asks follow-up questions for missing title and description
4. **Project Validation** - Ensures valid project selection with fuzzy matching and abbreviation support
5. **Jira Integration** - Creates real issues via Zapier MCP with full metadata

## 📝 Example Interactions

**All-in-one creation:**
```
You: Create a high priority task in FV Product titled "Update user onboarding" with description "Redesign the welcome flow for new users"
Agent: ✅ Issue PROD-567 created successfully!
```

**Smart defaults:**
```
You: Make an issue about broken search functionality
Agent: [Applies defaults: Bug type, FV Demo Issues project, Medium priority]
       What should be the title of this issue?
You: Search returns no results
Agent: Please provide a description...
You: Search bar not working on main page
Agent: ✅ Issue DPI-890 created successfully!
```

**Project-specific:**
```
You: Add a story to engineering for API rate limiting
Agent: What should be the title of this issue?
You: Implement API rate limiting middleware
Agent: ✅ Issue ENG-445 created successfully!
```

## 🆘 Troubleshooting

**Connection Issues:**
- Verify your `.env` file has correct API keys
- Test your Zapier MCP connection at [mcp.zapier.com](https://mcp.zapier.com)

**Project Not Found:**
- Use full project names or supported abbreviations
- Valid projects: FV Demo (Issues), FV Demo (Product), FV Engineering, FV Product

**AI Extraction Issues:**
- Be specific about project location: "in [project]" or "for [project]"
- Use clear language: "Create a bug in FV Engineering about..."

## 🎯 Key Improvements

- **Streamlined Flow**: Maximum 2 questions vs. traditional 5
- **AI-Powered**: Intelligent parameter extraction from natural language
- **Multi-Project**: Support for all 4 FanVoice projects with smart routing
- **Context-Aware**: Distinguishes between similar project names accurately
- **Fallback System**: Traditional step-by-step flow if AI extraction fails

## 📄 License

This project is licensed under the MIT License.

---

**Built with ❤️ using TypeScript, OpenAI GPT-4, and Zapier MCP**
