import 'dotenv/config';

import { DockerSandboxManager } from "../../../sandbox/docker-manager";

import { createWorkspaceTools } from "../../../packages/tools/workspace";


const OLLAMA_URL =
    process.env.OLLAMA_URL || "http://localhost:11434";

const MODEL =
    process.env.LOCAL_MODEL || "qwen3:8b";


const tools = [
    {
        type: "function",
        function: {
            name: "list_files",
            description: "List files in the agent workspace",
            parameters: {
                type: "object",
                properties: {},
                required: []
            }
        }
    },
    {
        type: "function",
        function: {
            name: "read_file",
            description: "Read a file from the workspace",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description: "Relative file path"
                    }
                },
                required: ["path"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "write_file",
            description: "Create or update a workspace file",
            parameters: {
                type: "object",
                properties: {
                    path: { type: "string" },
                    content: { type: "string" }
                },
                required: ["path", "content"]
            }
        }
    }
];

async function executeTool(name: string, args: any, workspaceTools: ReturnType<typeof createWorkspaceTools>) {
    switch (name) {
        case "list_files":
            return await workspaceTools.listFiles();

        case "read_file":
            return await workspaceTools.readFile(args.path);

        case "write_file":
            return await workspaceTools.writeFile(args.path, args.content);

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export async function runAgent(task: string, sandbox: DockerSandboxManager) {
    const workspaceTools = createWorkspaceTools(sandbox);
    const messages: any[] = [
        {
            role: "system",
            content: `
You are a professional autonomous coding agent.

Your responsibilities:
1. Understand the user's task.
2. Inspect existing workspace files.
3. Create an implementation plan.
4. Use tools to create or update files.
5. Verify your work where possible.
6. Explain what you completed.

Rules:
- Only work inside your workspace.
- Never claim that you executed or tested code unless you actually did.
- Use tools when you need to inspect or modify files.
- Ask for clarification if essential requirements are missing.
`
        },
        {
            role: "user",
            content: task
        }
    ];

    const maxSteps = 10;

    for (let step = 0; step < maxSteps; step++) {
        const response = await fetch(
            `${OLLAMA_URL}/api/chat`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: MODEL,
                    messages,
                    tools,
                    stream: false
                })
            }
        );

        if (!response.ok) {
            throw new Error(
                `Ollama error: ${response.status} ${await response.text()}`
            );
        }

        const data: any = await response.json();
        const assistantMessage = data.message;

        messages.push(assistantMessage);

        const toolCalls = assistantMessage.tool_calls || [];

        // No more tools required. Return final answer.
        if (toolCalls.length === 0) {
            return {
                status: "completed",
                output: assistantMessage.content,
                steps: step + 1
            };
        }

        // Execute the requested tools.
        for (const call of toolCalls) {
            const name = call.function.name;
            const args = call.function.arguments || {};

            let result: string;

            try {
                const toolResult = await executeTool(name, args, workspaceTools);
                result = JSON.stringify(toolResult);
            } catch (error) {
                result = JSON.stringify({
                    error: error instanceof Error
                        ? error.message
                        : "Tool execution failed"
                });
            }

            messages.push({
                role: "tool",
                content: result
            });
        }
    }

    return {
        status: "max_steps_reached",
        output: "Agent reached its maximum execution steps.",
        steps: maxSteps
    };
}
