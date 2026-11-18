# agents-hub

A Node.js service for defining AI agents and running them against a local Ollama model. Each run executes in an isolated, throwaway Docker sandbox.

## Prerequisites

- Node.js and npm
- MongoDB (agent definitions are stored here)
- A Qdrant Cloud cluster (cloud.qdrant.io) for the vector store, plus an Ollama embedding model (`ollama pull nomic-embed-text`)
- Docker daemon (sandbox for each run)
- Ollama server with the model your agent uses (e.g. `qwen3:8b`)

## Setup

```bash
npm install
cp .env.example .env   # then adjust values
```

Key variables: `MONGODB_URI` (required), `QDRANT_URL` and `QDRANT_API_KEY` (required), `QDRANT_COLLECTION`, `EMBEDDING_MODEL`, `EMBEDDING_DIMENSIONS` (must match the embedding model), `PORT` (default 3000), `OLLAMA_URL`, `WORKSPACE_ROOT`, `DOCKER_IMAGE`, `DOCKER_MEMORY`, `DOCKER_CPUS`, `DOCKER_TIMEOUT`.

## Running

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the API on `http://localhost:3000` |
| `npm run dev:web` | Start the UI dev server on `http://localhost:5173` (proxies `/api` to the API) |
| `npm run build:web` | Build the UI into `apps/api/public`, served by the API at `http://localhost:3000` |

## Agent management UI

The React UI lets you list, create, update, and delete agents through the `/api/agents` endpoints.

## API

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/health` | Health check |
| `GET` | `/api/agents` | List agents |
| `POST` | `/api/agents` | Create an agent (`name` and `instructions` required) |
| `GET` | `/api/agents/:id` | Get an agent |
| `PUT` | `/api/agents/:id` | Update an agent |
| `DELETE` | `/api/agents/:id` | Delete an agent |
| `POST` | `/api/agents/:id/memory` | Ingest a `.txt`/`.md` file into the agent's memory (multipart field `file`, or JSON `{ "name", "text" }`) |
| `GET` | `/api/agents/:id/memory/search?q=...` | Semantic search over the agent's memory |
| `POST` | `/api/agents/run` | Run an agent: `{ "name": "<agent name>", "task": "<task>" }` |

Example:

```bash
curl -X POST localhost:3000/api/agents/run \
  -H 'content-type: application/json' \
  -d '{"name":"my-agent","task":"Create hello.js that prints hello"}'
```

## Agent memory (text files)

Upload a text file to an agent; it is split into ~800-character overlapping chunks, embedded with Ollama, and stored in Qdrant scoped to that agent. Re-uploading a file with the same name replaces its chunks. Enable the `search_memory` tool on the agent so it can query this memory during a run.

```bash
curl -F "file=@notes.txt" localhost:3000/api/agents/<agent-id>/memory
curl "localhost:3000/api/agents/<agent-id>/memory/search?q=refund+policy"
```

## How it works

1. A run request looks up the agent by name in MongoDB.
2. A Docker container is created with no network, a read-only root filesystem, dropped capabilities, and CPU/memory/PID limits. A per-run host directory is mounted at `/workspace`.
3. The agent loop sends the agent's instructions and the task to Ollama, executes the tool calls it returns (`list_files`, `read_file`, `write_file`, all running inside the container), and repeats until the model answers or `maxSteps` is reached.
4. The container is destroyed when the run finishes.
