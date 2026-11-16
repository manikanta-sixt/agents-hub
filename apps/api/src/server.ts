
import Fastify from "fastify";
import dotenv from "dotenv";
import { runAgent } from "./agent";
import { DockerSandboxManager } from
  "../../../sandbox/docker-manager";
import { randomUUID } from "bullmq/dist/esm/utils";

dotenv.config();

const app = Fastify({
  logger: true
});


app.post("/api/agents/run", async (request, reply) => {
  const body = request.body as {
    task?: string;
  };

  if (!body?.task?.trim()) {
    return reply.code(400).send({
      error: "Task is required"
    });
  }

  const sandbox = new DockerSandboxManager();

  const executionId = randomUUID();

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
      body.task,
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

const port = Number(process.env.PORT || 3000);

app.listen({
  port,
  host: "0.0.0.0"
}).catch(error => {
  app.log.error(error);
  process.exit(1);
});
