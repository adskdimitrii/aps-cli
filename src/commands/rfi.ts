import { Command } from 'commander';
import { getAccessToken } from '../lib/auth.ts';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const RFI_BASE = 'https://developer.api.autodesk.com/construction/rfis/v3/projects';

// --- Types ---

interface RfiSummary {
  id: string;
  customIdentifier?: string;
  title: string;
  status: string;
  workflowType?: string;
  priority?: string | null;
  dueDate?: string | null;
  assignedTo?: Array<{ id: string; type: string }>;
  managerId?: string | null;
  discipline?: string | null;
  category?: string | null;
  question?: string | null;
  officialResponse?: string | null;
  officialResponseStatus?: string | null;
  locationDescription?: string | null;
  costImpact?: string | null;
  scheduleImpact?: string | null;
  reference?: string | null;
  commentsCount?: number;
  attachmentsCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

interface RfiSearchResponse {
  results: RfiSummary[];
  pagination?: { limit: number; offset: number; totalResults: number };
}

interface RfiComment {
  id: string;
  body: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface RfiCommentsResponse {
  results: RfiComment[];
  pagination?: { limit: number; offset: number; totalResults: number };
}

interface RfiAttachment {
  attachmentId: string;
  attachmentType: string;
  displayName: string;
  fileName: string;
  storageUrn: string;
  fileSize?: number | null;
  fileType?: string | null;
  createdOn?: string | null;
}

interface RfiAttachmentsResponse {
  results: RfiAttachment[];
  pagination?: { limit: number; offset: number; totalResults: number };
}

interface RfiType {
  id: string;
  name: string;
  status: string;
  wfType?: string | null;
}

interface RfiTypesResponse {
  results: RfiType[];
  pagination?: { limit: number; offset: number; totalResults: number };
}

interface SignedDownloadResponse {
  status: string;
  url: string;
}

// --- Helpers ---

function stripBPrefix(projectId: string): string {
  return projectId.replace(/^b\./, '');
}

function formatTable(headers: string[], rows: string[][]): string {
  if (rows.length === 0) return '(no results)';
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map(r => (r[i] ?? '').length))
  );
  const pad = (s: string, w: number) => (s ?? '').padEnd(w);
  const sep = widths.map(w => '-'.repeat(w)).join('  ');
  const header = headers.map((h, i) => pad(h, widths[i])).join('  ');
  const body = rows.map(r => r.map((c, i) => pad(c, widths[i])).join('  ')).join('\n');
  return `${header}\n${sep}\n${body}`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}

function truncate(s: string | null | undefined, maxLen: number): string {
  if (!s) return '';
  return s.length > maxLen ? s.slice(0, maxLen - 1) + '…' : s;
}

function parseStorageUrn(storageUrn: string): { bucketKey: string; objectKey: string } {
  const prefix = 'urn:adsk.objects:os.object:';
  if (!storageUrn.startsWith(prefix)) {
    throw new Error(`Unexpected storage URN format: ${storageUrn}`);
  }
  const rest = storageUrn.slice(prefix.length);
  const slashIdx = rest.indexOf('/');
  if (slashIdx < 1) {
    throw new Error(`Could not parse bucket/object key from storage URN: ${storageUrn}`);
  }
  return { bucketKey: rest.slice(0, slashIdx), objectKey: rest.slice(slashIdx + 1) };
}

async function downloadStorageUrn(
  storageUrn: string,
  fileName: string,
  outputDir: string,
  token: string,
): Promise<string> {
  const { bucketKey, objectKey } = parseStorageUrn(storageUrn);
  const signedUrl = `https://developer.api.autodesk.com/oss/v2/buckets/${encodeURIComponent(bucketKey)}/objects/${encodeURIComponent(objectKey)}/signeds3download`;

  const signedRes = await fetch(signedUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!signedRes.ok) {
    const body = await signedRes.text();
    throw new Error(`failed to generate signed URL (${signedRes.status}): ${body}`);
  }

  const signedData = (await signedRes.json()) as SignedDownloadResponse;
  if (signedData.status !== 'complete') {
    throw new Error(`unexpected signed URL status: ${signedData.status}`);
  }

  const outputPath = join(outputDir, fileName);
  const fileRes = await fetch(signedData.url);
  if (!fileRes.ok) throw new Error(`failed to download from S3 (${fileRes.status})`);

  const arrayBuffer = await fileRes.arrayBuffer();
  writeFileSync(outputPath, Buffer.from(arrayBuffer));
  return outputPath;
}

// --- Command registration ---

export function registerRfiCommands(program: Command): void {
  const rfi = program
    .command('rfi')
    .description('Query RFI (Request for Information) data in an ACC project')
    .addHelpText('after', '\nRequires an active login. Run `aps login` first.');

  // ── search ──────────────────────────────────────────────────────────────────
  rfi
    .command('search <project-id>')
    .description('Search and list RFIs in a project')
    .option('--search <text>', 'Filter by text in title, question, or official response')
    .option(
      '--status <status>',
      'Filter by status (repeatable). Values: draft, submitted, open, answered, closed, void …',
      (v: string, prev: string[]) => [...prev, v],
      [] as string[],
    )
    .option(
      '--priority <priority>',
      'Filter by priority (repeatable). Values: High, Normal, Low',
      (v: string, prev: string[]) => [...prev, v],
      [] as string[],
    )
    .option('--limit <n>', 'Max results to return (default 50, max 200)', '50')
    .option('--offset <n>', 'Number of results to skip', '0')
    .option('--json', 'Output raw JSON')
    .addHelpText('after', `
Examples:
  aps rfi search <projectId>
  aps rfi search <projectId> --status open --status submitted
  aps rfi search <projectId> --search "door" --json`)
    .action(async (
      projectId: string,
      opts: { search?: string; status: string[]; priority: string[]; limit: string; offset: string; json?: boolean },
    ) => {
      const token = await getAccessToken();
      const pid = stripBPrefix(projectId);

      const body: Record<string, unknown> = {
        limit: parseInt(opts.limit, 10),
        offset: parseInt(opts.offset, 10),
      };
      if (opts.search) body.search = opts.search;

      const filter: Record<string, unknown> = {};
      if (opts.status.length) filter.status = opts.status;
      if (opts.priority.length) filter.priority = opts.priority;
      if (Object.keys(filter).length) body.filter = filter;

      const url = `${RFI_BASE}/${encodeURIComponent(pid)}/search:rfis`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`RFI search failed (${res.status}): ${errBody}`);
      }

      const data = (await res.json()) as RfiSearchResponse;

      if (opts.json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }

      const rfis = data.results ?? [];
      const total = data.pagination?.totalResults;
      if (total !== undefined) {
        process.stderr.write(`Showing ${rfis.length} of ${total} RFIs\n`);
      }

      const rows = rfis.map(r => [
        r.customIdentifier ?? '',
        truncate(r.title, 50),
        r.status ?? '',
        r.priority ?? '',
        fmtDate(r.dueDate),
      ]);

      console.log(formatTable(['CUSTOM ID', 'TITLE', 'STATUS', 'PRIORITY', 'DUE DATE'], rows));
    });

  // ── get ─────────────────────────────────────────────────────────────────────
  rfi
    .command('get <project-id> <rfi-id>')
    .description('Get details for a single RFI')
    .option('--json', 'Output raw JSON')
    .addHelpText('after', `
Examples:
  aps rfi get <projectId> <rfiId>
  aps rfi get <projectId> <rfiId> --json`)
    .action(async (projectId: string, rfiId: string, opts: { json?: boolean }) => {
      const token = await getAccessToken();
      const pid = stripBPrefix(projectId);

      const url = `${RFI_BASE}/${encodeURIComponent(pid)}/rfis/${encodeURIComponent(rfiId)}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Failed to get RFI (${res.status}): ${errBody}`);
      }

      const r = (await res.json()) as RfiSummary;

      if (opts.json) {
        console.log(JSON.stringify(r, null, 2));
        return;
      }

      const fields: [string, string][] = [
        ['ID', r.id],
        ['Custom ID', r.customIdentifier ?? ''],
        ['Title', r.title],
        ['Status', r.status],
        ['Workflow Type', r.workflowType ?? ''],
        ['Priority', r.priority ?? ''],
        ['Due Date', fmtDate(r.dueDate)],
        ['Cost Impact', r.costImpact ?? ''],
        ['Schedule Impact', r.scheduleImpact ?? ''],
        ['Discipline', r.discipline ?? ''],
        ['Category', r.category ?? ''],
        ['Reference', r.reference ?? ''],
        ['Official Response Status', r.officialResponseStatus ?? ''],
        ['Comments', r.commentsCount != null ? String(r.commentsCount) : ''],
        ['Attachments', r.attachmentsCount != null ? String(r.attachmentsCount) : ''],
        ['Location', r.locationDescription ?? ''],
        ['Created At', fmtDate(r.createdAt)],
        ['Updated At', fmtDate(r.updatedAt)],
      ];

      const labelWidth = Math.max(...fields.map(([l]) => l.length));
      for (const [label, value] of fields) {
        if (value) console.log(`${label.padEnd(labelWidth)}  ${value}`);
      }
      if (r.question) {
        console.log('\nQuestion:\n' + r.question);
      }
      if (r.officialResponse) {
        console.log('\nOfficial Response:\n' + r.officialResponse);
      }
    });

  // ── comments ────────────────────────────────────────────────────────────────
  rfi
    .command('comments <project-id> <rfi-id>')
    .description('List comments on an RFI')
    .option('--limit <n>', 'Max comments to return (default 50)', '50')
    .option('--offset <n>', 'Number of comments to skip', '0')
    .option('--json', 'Output raw JSON')
    .addHelpText('after', `
Examples:
  aps rfi comments <projectId> <rfiId>
  aps rfi comments <projectId> <rfiId> --json`)
    .action(async (
      projectId: string,
      rfiId: string,
      opts: { limit: string; offset: string; json?: boolean },
    ) => {
      const token = await getAccessToken();
      const pid = stripBPrefix(projectId);

      const params = new URLSearchParams({ limit: opts.limit, offset: opts.offset });
      const url = `${RFI_BASE}/${encodeURIComponent(pid)}/rfis/${encodeURIComponent(rfiId)}/comments?${params}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Failed to get comments (${res.status}): ${errBody}`);
      }

      const data = (await res.json()) as RfiCommentsResponse;

      if (opts.json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }

      const comments = data.results ?? [];
      const total = data.pagination?.totalResults;
      if (total !== undefined) {
        process.stderr.write(`Showing ${comments.length} of ${total} comments\n`);
      }

      const rows = comments.map(c => [
        fmtDate(c.createdAt),
        c.createdBy ?? '',
        truncate(c.body, 80),
      ]);

      console.log(formatTable(['DATE', 'CREATED BY', 'BODY'], rows));
    });

  // ── attachments ─────────────────────────────────────────────────────────────
  rfi
    .command('attachments <project-id> <rfi-id>')
    .description('List attachments on an RFI')
    .option(
      '--type <attachmentType>',
      'Filter by attachment type (repeatable). Values: rfiResponse, rfiOfficialResponse, rfiWebHiddenFiles, bridgeFiles',
      (v: string, prev: string[]) => [...prev, v],
      [] as string[],
    )
    .option('--json', 'Output raw JSON')
    .addHelpText('after', `
Examples:
  aps rfi attachments <projectId> <rfiId>
  aps rfi attachments <projectId> <rfiId> --type rfiOfficialResponse --json`)
    .action(async (projectId: string, rfiId: string, opts: { type: string[]; json?: boolean }) => {
      const token = await getAccessToken();
      const pid = stripBPrefix(projectId);

      const params = new URLSearchParams();
      params.set('limit', '200');
      for (const t of opts.type) {
        params.append('filter[attachmentTypes]', t);
      }

      const url = `${RFI_BASE}/${encodeURIComponent(pid)}/rfis/${encodeURIComponent(rfiId)}/attachments?${params}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Failed to get attachments (${res.status}): ${errBody}`);
      }

      const data = (await res.json()) as RfiAttachmentsResponse;

      if (opts.json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }

      const attachments = data.results ?? [];
      const rows = attachments.map(a => [
        a.displayName || a.fileName,
        a.attachmentType,
        a.fileSize != null ? `${Math.round(a.fileSize / 1024)} KB` : '',
        fmtDate(a.createdOn),
      ]);

      console.log(formatTable(['NAME', 'TYPE', 'SIZE', 'DATE'], rows));
    });

  // ── types ────────────────────────────────────────────────────────────────────
  rfi
    .command('types <project-id>')
    .description('List RFI types configured for a project')
    .option('--json', 'Output raw JSON')
    .addHelpText('after', `
Examples:
  aps rfi types <projectId>
  aps rfi types <projectId> --json`)
    .action(async (projectId: string, opts: { json?: boolean }) => {
      const token = await getAccessToken();
      const pid = stripBPrefix(projectId);

      const url = `${RFI_BASE}/${encodeURIComponent(pid)}/rfi-types?limit=200`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Failed to get RFI types (${res.status}): ${errBody}`);
      }

      const data = (await res.json()) as RfiTypesResponse;

      if (opts.json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }

      const types = data.results ?? [];
      const rows = types.map(t => [t.id, t.name, t.status, t.wfType ?? '']);
      console.log(formatTable(['ID', 'NAME', 'STATUS', 'WORKFLOW TYPE'], rows));
    });

  // ── download-attachments ─────────────────────────────────────────────────────
  rfi
    .command('download-attachments <project-id> <rfi-id>')
    .description('Download attachment files from an RFI to disk')
    .option('-o, --output <dir>', 'Output directory (default: current directory)')
    .option(
      '--type <attachmentType>',
      'Filter by attachment type (repeatable). Values: rfiResponse, rfiOfficialResponse, rfiWebHiddenFiles, bridgeFiles',
      (v: string, prev: string[]) => [...prev, v],
      [] as string[],
    )
    .addHelpText('after', `
Lists attachments on the RFI, generates signed S3 download URLs, and writes
each file to the output directory.

Examples:
  aps rfi download-attachments <projectId> <rfiId>
  aps rfi download-attachments <projectId> <rfiId> --type rfiOfficialResponse -o ./downloads/`)
    .action(async (projectId: string, rfiId: string, opts: { output?: string; type: string[] }) => {
      const token = await getAccessToken();
      const pid = stripBPrefix(projectId);

      const params = new URLSearchParams();
      params.set('limit', '200');
      for (const t of opts.type) {
        params.append('filter[attachmentTypes]', t);
      }

      const listUrl = `${RFI_BASE}/${encodeURIComponent(pid)}/rfis/${encodeURIComponent(rfiId)}/attachments?${params}`;
      const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } });

      if (!listRes.ok) {
        const errBody = await listRes.text();
        throw new Error(`Failed to list attachments (${listRes.status}): ${errBody}`);
      }

      const listData = (await listRes.json()) as RfiAttachmentsResponse;
      const attachments = listData.results ?? [];

      if (attachments.length === 0) {
        process.stderr.write('No attachments found.\n');
        return;
      }

      const outputDir = opts.output ?? process.cwd();
      mkdirSync(outputDir, { recursive: true });
      process.stderr.write(`Found ${attachments.length} attachment(s). Downloading to: ${outputDir}\n`);

      const results = await Promise.allSettled(
        attachments.map(a =>
          downloadStorageUrn(a.storageUrn, a.fileName || a.displayName, outputDir, token)
        ),
      );

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const name = attachments[i].fileName || attachments[i].displayName;
        if (result.status === 'fulfilled') {
          console.log(`Downloaded: ${result.value}`);
        } else {
          const msg = result.reason instanceof Error ? result.reason.message : String(result.reason);
          process.stderr.write(`Skipping ${name}: ${msg}\n`);
        }
      }
    });
}
