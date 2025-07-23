import { JiraAgent } from './jiraAgent';

// Main execution
async function main() {
  try {
    const agent = new JiraAgent();
    await agent.start();
  } catch (error) {
    console.error('Failed to start the Jira Agent:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down gracefully...');
  process.exit(0);
});

// Run the application
if (require.main === module) {
  main();
}