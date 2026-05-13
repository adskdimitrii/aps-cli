# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build       # Compile TypeScript to dist/
npm run typecheck   # Type-check without emitting
npm start           # Run directly via Node (--experimental-strip-types)
```

The CLI binary runs TypeScript directly — no build step required for development:
```bash
node --experimental-strip-types src/index.ts <command>
# or after `npm link` / global install:
aps <command>
```

No test framework is configured.

## Architecture

A Node.js/TypeScript CLI for Autodesk Platform Services (APS) APIs. Zero runtime dependencies except `commander`. Uses native `fetch`, `crypto`, and `http` from Node.js 18+.

**Entry flow:** `bin/aps` → `src/index.ts` (Commander registration) → `src/commands/*.ts`

### src/commands/
Each file exports a single async function registered in `src/index.ts`:
- `configure.ts` — stores APS client credentials (client ID + secret)
- `login.ts` — 3-legged OAuth: opens browser, spins up local HTTP server on port 7482 to catch callback, exchanges code for tokens
- `logout.ts` — clears stored token
- `url.ts` — resolves an ACC URL to hub/project IDs via paginated GraphQL calls
- `query.ts` — runs an arbitrary GraphQL query against the AEC Data Model API
- `query-docs.ts` — prints links to AEC Data Model documentation by category

### src/lib/
- `auth.ts` — credential/token storage (AES-256-GCM encrypted JSON in `/tmp/`), auto-refresh on expiry, env var overrides (`APS_CLIENT_ID`, `APS_CLIENT_SECRET`, `APS_REDIRECT_URI`)
- `graphql.ts` — thin `runQuery<T>()` wrapper around `fetch` to `https://developer.api.autodesk.com/aec/graphql`
- `url-parser.ts` — parses an ACC URL into `{ projectId, entityId, folderUrn, viewableGuid }`

### src/types.d.ts
Ambient declarations for Node.js built-ins (process, fs, crypto, http, etc.) — the project avoids `@types/node` at runtime.

## APS / AEC Data Model Key Concepts

- ACC URL `projectId` (e.g. `06f1b420-…`) is the Data Management API UUID. The AEC Data Model uses `urn:adsk.workspace:prod.project:{uuid}`. Resolve by querying `projects(hubId)` and matching `alternativeIdentifiers.dataManagementAPIProjectId` = `b.{URL_UUID}`.
- ACC URL `entityId` (e.g. `urn:adsk.wipprod:dm.lineage:…`) = `fileUrn` in AEC Data Model element groups.
- Standard 4-step query pattern: `hubs` → `projects(hubId)` → `elementGroupsByProject(filter:{fileUrn})` → `elementGroupAtTip(elementGroupId)` (paginated, 50/page).
- `units` on `PropertyDefinition` is a nested object, not a scalar — always select subfields.

## Testing

If the CLI requires login, ask the user to login and tell you when they have completed this step. If you run into any errors as you test, try to correct and re-run tests.

1. Build the app
2. Run `aps url "https://acc.autodesk.com/docs/files/projects/8e2088c1-9879-43ff-b56f-66065b0fce42?folderUrn=urn%3Aadsk.wipprod%3Afs.folder%3Aco.wmdJC-0tQ1WRQBO5SO9dxw&entityId=urn%3Aadsk.wipprod%3Adm.lineage%3AONx_Rdu-RA29oK8oQd9fIw&viewModel=detail&moduleId=folders"`
3. Using the CLI get a list of sheets in the following file.