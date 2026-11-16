# agents-hub
A Node.JS AI agent that runs commands in an isolated Docker sandbox , using a local / remote model

## Agent management UI

The React UI lets you list, create, update, and delete agents through the
`/api/agents` endpoints.

- Run the API with `npm run dev`.
- In a second terminal, run the UI with `npm run dev:web` and open
  `http://localhost:5173`.
- For a built UI served by the API, run `npm run build:web` before starting the
  API; the UI is then available at `http://localhost:3000`.

## How it works

CLI - agent loop -