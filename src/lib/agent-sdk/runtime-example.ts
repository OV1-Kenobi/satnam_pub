// Agent Runtime Initialization Example
// Demonstrates how to integrate heartbeat service into agent startup

import { AgentHeartbeatService } from "./heartbeat";

// Mock agent class for demonstration
class MockAgent {
  private agentId: string;
  private currentLoad = 0;
  private activeTasks = 0;
  private walletBalance = 10000;
  private acceptingTasks = true;
  private contextUsage = 0;

  constructor(agentId: string) {
    this.agentId = agentId;
  }

  getCurrentLoad(): number {
    // Simulate load changes
    this.currentLoad = Math.floor(Math.random() * 100);
    return this.currentLoad;
  }

  getActiveTaskCount(): number {
    // Simulate task count changes
    this.activeTasks = Math.floor(Math.random() * 5);
    return this.activeTasks;
  }

  getWalletBalance(): number {
    // Simulate balance changes
    this.walletBalance += Math.floor(Math.random() * 100) - 50;
    return Math.max(0, this.walletBalance);
  }

  isAcceptingTasks(): boolean {
    // Simulate task acceptance state
    this.acceptingTasks = Math.random() > 0.1; // 90% chance of accepting
    return this.acceptingTasks;
  }

  getContextUsage(): number {
    // Simulate context usage
    this.contextUsage = Math.floor(Math.random() * 100);
    return this.contextUsage;
  }

  // Simulate agent shutdown
  shutdown(): void {
    console.log(`Agent ${this.agentId} shutting down...`);
  }
}

// Example usage in agent startup code
export async function initializeAgent(agentId: string): Promise<MockAgent> {
  console.log(`Initializing agent ${agentId}...`);

  // Create agent instance
  const agent = new MockAgent(agentId);

  // Initialize heartbeat service
  const heartbeat = new AgentHeartbeatService(agentId);

  try {
    // Start heartbeat with data callback
    heartbeat.startHeartbeat(async () => ({
      loadPercent: agent.getCurrentLoad(),
      activeTasks: agent.getActiveTaskCount(),
      availableBudget: agent.getWalletBalance(),
      acceptsTasks: agent.isAcceptingTasks(),
      contextUsedPercent: agent.getContextUsage(),
    }));

    console.log(`Agent ${agentId} heartbeat started successfully`);

    // Set up graceful shutdown
    process.on("SIGTERM", () => {
      console.log(`Received SIGTERM for agent ${agentId}`);
      heartbeat.stopHeartbeat();
      agent.shutdown();
      process.exit(0);
    });

    process.on("SIGINT", () => {
      console.log(`Received SIGINT for agent ${agentId}`);
      heartbeat.stopHeartbeat();
      agent.shutdown();
      process.exit(0);
    });

    return agent;
  } catch (error) {
    console.error(`Failed to initialize agent ${agentId}:`, error);
    heartbeat.stopHeartbeat();
    throw error;
  }
}

// Example of running the agent
if (require.main === module) {
  const agentId = process.argv[2] || "demo-agent-001";

  initializeAgent(agentId)
    .then((agent) => {
      console.log(`Agent ${agentId} is running...`);
      console.log("Press Ctrl+C to shutdown gracefully");
    })
    .catch((error) => {
      console.error("Failed to start agent:", error);
      process.exit(1);
    });
}
