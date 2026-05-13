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

After running this command **COPY** the `SSA Email Address` the CLI creates and store for later.

### 3. Grant APS Access to Forma

#### Grant APS Access

[Add your APS Client ID to your Forma Account](https://aps.autodesk.com/en/docs/acc/v1/tutorials/getting-started/manage-access-to-acc/)

### Grant SSA Access **[OPTIONAL]**

If using **SSA** auth option you must now grant the `SSA Email Address` access to Forma resources just how you would a user. It's recommended to limit access control lowest required access.

### Using the APS CLI Manually

```bash
node ./dist/index.js --help
```

### Teaching your Agent to Use the CLI

Edit the path in `skill.md` to the fullpath on your local machine where the `./dist/index.js` is located. Tell the agent to learn this skill as `aps-cli`
