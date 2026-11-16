
import Fastify from "fastify";
import dotenv from "dotenv";
import { AgentModel } from "./models/agent.model";
import { runAgent } from "./agent";
import { DockerSandboxManager } from
  "../../../sandbox/docker-manager";
import { randomUUID } from "bullmq/dist/esm/utils";

import { connectDatabase } from "./config/database";
import { agentRoutes } from "./routes/agent.routes";

dotenv.config();


const app = Fastify({
  logger: true
});


app.post("/api/agents/run", async (request, reply) => {
  const body = request.body as {
    name?: string;
    task?: string;
  };

  console.log("Received request to run agent:", body);

  const sandbox = new DockerSandboxManager();
  const executionId = randomUUID();

  const agent = await AgentModel.findOne({

    name: body.name

  }); 


  if (!agent) {
    return reply.code(404).send({
      error: "Agent not found"
    });
  }

  try {
    const container = await sandbox.create(
      "coder",
      executionId
    );

    request.log.info({
      executionId,
      containerId: container.containerId,
      workspace: container.workspace
    }, "Agent sandbox created");

    const result = await runAgent(
      agent,
      body.task || "No task provided",
      sandbox
    );

    return {
      executionId,
      containerId: container.containerId,
      ...result
    };

  } catch (error) {
    request.log.error(error);

    return reply.code(500).send({
      executionId,
      error: error instanceof Error
        ? error.message
        : "Agent execution failed"
    });

  } finally {
    await sandbox.destroy();
    request.log.info({ executionId }, "Sandbox cleaned up");
  }
});

app.get("/health", async () => ({
  status: "ok",
  service: "agents-hub"
}));

async function startServer() {
  await connectDatabase();

  // Register Fastify routes here.
  await app.register(agentRoutes);
  await app.listen({
    port: Number(process.env.PORT || 3000),
    host: "0.0.0.0"
  });
}

startServer().catch(error => {
  console.error(error);
  process.exit(1);
});

