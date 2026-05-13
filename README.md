# aps-cli

A command-line tool for querying Autodesk Platform Services (APS) APIs.

## [BUILD OPTION 1] Open in a Dev Container

Open the repository in VS Code and run **Dev Containers: Reopen in Container**.
Reference: [containers.dev](https://containers.dev/)
This workspace is configured in `.devcontainer/devcontainer.json`.

## [BUILD OPTION 2] Local Build Requirements (Without Dev Container)

To build this project locally (without the provided dev container), install:

- Node.js 22+
- Git
- Bash-compatible shell (Linux/macOS terminal, or WSL/Git Bash on Windows)

### Install TypeScript Compiler Globally

Install the TypeScript compiler (`tsc`) globally:

```bash
npm install -g typescript
```

Verify installation:

```bash
tsc --version
```

## Setup

### 1. Clone Agent Friendly APS Docs & Build

```bash
git clone https://github.com/adskdimitrii/aps-ai-friendly-docs docs
npm install
npm run build
```

### 2. Configure & Log In

#### Option A — Interactive browser login (3-legged OAuth):

[Register a Traditional Web App](https://aps.autodesk.com/en/docs/oauth/v2/tutorials/create-app/) at the [APS Developer Portal](https://aps.autodesk.com/myapps) with:
- **Callback URL**: `http://localhost:7482/callback`

```bash
node ./dist/index.js configure --client-id <YOUR-CLIENT-ID> --client-secret <YOUR-CLIENT-SECRET>
node ./dist/index.js login
```

#### Option B — Import an existing token (3-legged OAuth - for OpenClaw style Agents using YOUR identity OR an Active Directory Service Account):

[Register a Traditional Web App](https://aps.autodesk.com/en/docs/oauth/v2/tutorials/create-app/) at the [APS Developer Portal](https://aps.autodesk.com/myapps) with:
- **Callback URL**: `https://aps-oauth.azurewebsites.net`

Use [https://aps-oauth.azurewebsites.net](https://aps-oauth.azurewebsites.net/) to create an access token. This workflow will enable using the CLI with OpenClaw style agents where the user can't use the login workflow.

```bash
node ./dist/index.js configure --client-id <YOUR-CLIENT-ID> --client-secret <YOUR-CLIENT-SECRET> --token ~/Downloads/token.json
```

#### Option C — Secure Service Account (SSA - For OpenClaw style agents using Autodesk Secure Service Account):

[Register a Server-to-Server App](https://aps.autodesk.com/en/docs/oauth/v2/tutorials/create-app/) at the [APS Developer Portal](https://aps.autodesk.com/myapps)

Creates a service account identity tied to your APS application. No browser login required — the CLI generates and signs JWT assertions automatically. Ideal for headless/automated environments.

```bash
node ./dist/index.js configure --client-id <YOUR-CLIENT-ID> --client-secret <YOUR-CLIENT-SECRET> --ssa
```

After running this command **COPY** the `SSA Email Address` the CLI creates and store it for later.

### 3. Grant APS Access to Forma

#### Grant APS Access

[Add your APS Client ID to your Forma Account](https://aps.autodesk.com/en/docs/acc/v1/tutorials/getting-started/manage-access-to-acc/)

### Grant SSA Access **[OPTIONAL]**

If using **SSA** auth option you must now grant the `SSA Email Address` access to Forma resources just like you would for a user. It's recommended to limit access to the lowest required level.

### Using the APS CLI Manually

```bash
node ./dist/index.js --help
```

### Teaching your Agent to Use the CLI

Edit the path in `skills/aps-cli/SKILL.md` to the full path on your local machine where the `./dist/index.js` is located. Tell the agent to learn this skill as `aps-cli`.

---

## Design Philosophy

### CLIs over MCPs for Agentic Workflows

MCP servers and CLIs are both wrappers around REST APIs — but CLIs are a more natural fit for AI agents. LLMs are extensively post-trained on shell usage and unix toolchains, giving them strong intuition for chaining commands, parsing output, and composing scripts to accomplish complex tasks. When an agent understands the goal, it self-implements strategies using the tools it already knows best.

```
REST API
   │
   ├── MCP Server ──► Agent calls tool directly
   │                  (custom protocol, fragile context)
   │
   └── CLI ──────────► Agent runs shell commands
                       (unix patterns, scriptable, chainable)
```

Agents naturally reach for scripts and pipelines when a task grows in complexity — and a well-designed CLI meets them there.

### Credential Isolation

Once a user authenticates, the agent should never need to see the OAuth token. The CLI handles credential storage, refresh, and injection transparently. Sensitive values are encrypted at rest and never surfaced in command output.

```
  Human                CLI                  APS API
    │                   │                      │
    ├──── aps login ───►│                      │
    │◄─── (browser) ────┤                      │
    │                   ├──── store token ─────┤
    │                   │     (encrypted)      │
    │                   │                      │
  Agent               CLI                  APS API
    │                   │                      │
    ├── aps query .. ──►│                      │
    │                   ├── inject token ─────►│
    │◄────── data ──────┤◄──────── data ───────┤
    │                   │                      │
    │  (token never     │
    │   visible here)   │
```

The boundary between "human authenticates" and "agent operates" is a key security property of this design.

SSA (Secure Service Accounts) takes this isolation a step further. Rather than delegating a human user's identity to the agent, SSA creates a dedicated service identity — scoped to your APS application — that can be granted access to Forma resources independently. The agent authenticates as this service account using JWT assertions signed by a private key managed by the CLI; no user credentials or browser session are ever involved. Because the SSA identity exists separately from any human account, its access can be provisioned at the minimum required permission level and revoked without affecting any user. This makes SSA the recommended option for production agentic workflows where strong credential isolation and auditability are required.

```
  APS Application
    │
    └── SSA Identity (service account email)
          │
          ├── Provisioned to Hub
          │     │
          │     └── Granted project-level access (e.g. viewer only)
          │           │
          │           └── Agent operates within this scope
          │                 (cannot exceed granted permissions)
          │
          └── Revocable independently of any human user
```

### A Minimal, Focused Interface

Fewer commands mean a cleaner context window. From experience, agent performance on complex tasks improves as the interface simplifies — extraneous commands dilute the signal of what's actually useful. This CLI ships only what's needed to navigate APS data; nothing more.

If you need to add new commands I would recommend the following:

1. Clone https://github.com/adskdimitrii/aps-ai-friendly-docs
2. Find the API(s) you are looking for in the offline docs.
3. Prompt a coding agent with the following:

```
Add a new command to the aps-cli to help accomplish a new workflow:

<DESCRIBE-WORKFLOW>

Refer to the APS Documentation here:

<PATH-TO-RELEVANT-DOCS>
```

### Extensibility as a First Principle

Real-world use cases vary. A project manager, a cost engineer, and an automation developer all need different vocabulary from the same underlying API. This CLI is designed to be augmented — help text, commands, and output can be tailored to the business domain of the agent's task.

Since coding agents excel at extending CLIs given API documentation, missing functionality is typically one prompt away. The framework eliminates boilerplate so every augmentation starts from a working foundation:

```
Base CLI (this repo)
    │
    ├── aps ls          ← navigate ACC file structure
    ├── aps query       ← run AEC Data Model GraphQL queries
    └── ...
    │
    ▼ Agent augments for domain-specific task
    │
    ├── aps cost        ← (generated from cost API docs)
    ├── aps assets      ← (generated from assets API docs)
    └── aps <whatever>  ← one prompt, no boilerplate
```

The result is a CLI that is both immediately useful and fluid enough to grow with the task.

## License

See [LICENSE](LICENSE) for details.
