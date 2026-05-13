import { getAccessToken } from '../lib/auth.ts';

interface FolderContentsRelationship {
  data: { type: string; id: string };
}

interface FolderItem {
  type: string;
  id: string;
  attributes?: {
    name?: string;
    displayName?: string;
    lastModifiedTime?: string;
    fileType?: string;
    storageSize?: number;
  };
  relationships?: {
    tip?: FolderContentsRelationship;
  };
}

interface IncludedVersion {
  type: string;
  id: string;
  attributes: {
    name: string;
    displayName?: string;
    lastModifiedTime?: string;
    fileType?: string;
    storageSize?: number;
  };
  relationships?: {
    storage?: {
      data?: {
        id: string;
      };
    };
  };
}

interface FolderContentsResponse {
  data: FolderItem[];
  included?: IncludedVersion[];
  links?: {
    next?: { href: string };
  };
}

interface Hub {
  id: string;
  attributes: { name: string };
}

interface HubsResponse {
  data: Hub[];
}

interface Project {
  id: string;
  attributes: { name: string };
}

interface ProjectsResponse {
  data: Project[];
  links?: {
    next?: { href: string };
  };
}

export interface ListedProject {
  hubId: string;
  hubName: string;
  projectId: string;
  projectName: string;
}

interface TopFolder {
  id: string;
  attributes: {
    name: string;
    extension?: {
      data?: {
        folderType?: string;
      };
    };
  };
}

interface TopFoldersResponse {
  data: TopFolder[];
}

export interface ListedFolder {
  id: string;
  name: string;
  folderType: string | null;
}

export async function listProjects(): Promise<ListedProject[]> {
  const token = await getAccessToken();

  const hubsRes = await fetch('https://developer.api.autodesk.com/project/v1/hubs', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!hubsRes.ok) {
    const body = await hubsRes.text();
    throw new Error(`Failed to list hubs (${hubsRes.status}): ${body}`);
  }
  const hubsPayload = (await hubsRes.json()) as HubsResponse;
  const hubs = hubsPayload.data ?? [];

  const results: ListedProject[] = [];

  for (const hub of hubs) {
    let page = 0;
    while (true) {
      const params = new URLSearchParams();
      params.set('page[limit]', '200');
      params.set('page[number]', String(page));
      const url = `https://developer.api.autodesk.com/project/v1/hubs/${encodeURIComponent(hub.id)}/projects?${params.toString()}`;

      const projRes = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!projRes.ok) {
        const body = await projRes.text();
        throw new Error(`Failed to list projects for hub ${hub.id} (${projRes.status}): ${body}`);
      }
      const projPayload = (await projRes.json()) as ProjectsResponse;
      for (const proj of projPayload.data ?? []) {
        results.push({
          hubId: hub.id,
          hubName: hub.attributes.name,
          projectId: proj.id.replace(/^b\./, ''),
          projectName: proj.attributes.name,
        });
      }
      if (!projPayload.links?.next) break;
      page++;
    }
  }

  return results;
}

async function findHubForProject(projectId: string, token: string): Promise<string> {
  const hubsRes = await fetch('https://developer.api.autodesk.com/project/v1/hubs', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!hubsRes.ok) {
    const body = await hubsRes.text();
    throw new Error(`Failed to list hubs (${hubsRes.status}): ${body}`);
  }
  const hubsPayload = (await hubsRes.json()) as HubsResponse;
  const dmProjectId = `b.${projectId.replace(/^b\./, '')}`;

  for (const hub of hubsPayload.data ?? []) {
    const url = `https://developer.api.autodesk.com/project/v1/hubs/${encodeURIComponent(hub.id)}/projects/${encodeURIComponent(dmProjectId)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) return hub.id;
  }
  throw new Error(`Project ${projectId} not found in any accessible hub`);
}

export async function listTopFolders(projectId: string): Promise<ListedFolder[]> {
  const token = await getAccessToken();
  const hubId = await findHubForProject(projectId, token);
  const dmProjectId = `b.${projectId.replace(/^b\./, '')}`;

  const url = `https://developer.api.autodesk.com/project/v1/hubs/${encodeURIComponent(hubId)}/projects/${encodeURIComponent(dmProjectId)}/topFolders`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to list top folders (${res.status}): ${body}`);
  }
  const payload = (await res.json()) as TopFoldersResponse;
  return (payload.data ?? []).map(f => ({
    id: f.id,
    name: f.attributes.name,
    folderType: f.attributes.extension?.data?.folderType ?? null,
  }));
}

function parseSinceDuration(since: string): string {
  const match = since.match(/^(\d+)(h|d|m)$/i);
  if (!match) {
    throw new Error(`Invalid --since format: "${since}". Use e.g. 24h, 7d, 30m`);
  }
  const n = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const ms = unit === 'h' ? n * 3_600_000 : unit === 'd' ? n * 86_400_000 : n * 60_000;
  return new Date(Date.now() - ms).toISOString();
}

export interface ListedItem {
  id: string;
  name: string;
  lastModifiedTime: string | null;
  fileType: string | null;
  storageSize: number | null;
  storageUrn: string | null;
}

export async function listFolderItems(
  projectId: string,
  folderId: string,
  opts: { ext?: string; since?: string; type?: string }
): Promise<ListedItem[]> {
  const token = await getAccessToken();
  const dmProjectId = `b.${projectId.replace(/^b\./, '')}`;
  // Strip any trailing URL fragment accidentally included from ACC URL copy (e.g. &viewModel)
  const cleanFolderId = folderId.split('&')[0];
  const sinceIso = opts.since ? parseSinceDuration(opts.since) : undefined;
  const filterType =
    opts.type === 'folders' ? 'folders' : opts.type === 'items' ? 'items' : undefined;
  const extFilter = opts.ext
    ? opts.ext.startsWith('.')
      ? opts.ext.toLowerCase()
      : `.${opts.ext.toLowerCase()}`
    : undefined;

  const results: ListedItem[] = [];
  let page = 0;

  while (true) {
    const params = new URLSearchParams();
    params.set('page[limit]', '200');
    params.set('page[number]', String(page));
    if (filterType) params.set('filter[type]', filterType);

    const url =
      `https://developer.api.autodesk.com/data/v1/projects/${encodeURIComponent(dmProjectId)}/folders/${encodeURIComponent(cleanFolderId)}/contents?${params.toString()}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Failed to list folder contents (${res.status}): ${body}`);
    }

    const payload = (await res.json()) as FolderContentsResponse;
    const data = payload.data ?? [];
    const included = payload.included ?? [];

    // Build lookup: version URN → version object
    const versionMap = new Map<string, IncludedVersion>();
    for (const inc of included) {
      if (inc.type === 'versions') {
        versionMap.set(inc.id, inc);
      }
    }

    for (const item of data) {
      const tipId = item.relationships?.tip?.data?.id;
      const version = tipId ? versionMap.get(tipId) : undefined;
      // Folders carry their own attributes; files resolve name/metadata via tip version
      const name = version?.attributes?.name ?? item.attributes?.name ?? item.attributes?.displayName ?? '';
      const lastModifiedTime = version?.attributes?.lastModifiedTime ?? item.attributes?.lastModifiedTime ?? null;

      // Skip items where we have a timestamp and it's before the cutoff
      if (sinceIso && lastModifiedTime !== null && lastModifiedTime < sinceIso) {
        continue;
      }

      // Skip items where --since is active but we couldn't resolve a timestamp at all
      if (sinceIso && lastModifiedTime === null) {
        continue;
      }

      if (extFilter && !name.toLowerCase().endsWith(extFilter)) {
        continue;
      }

      results.push({
        id: item.id,
        name,
        lastModifiedTime,
        fileType: version?.attributes?.fileType ?? null,
        storageSize: version?.attributes?.storageSize ?? null,
        storageUrn: version?.relationships?.storage?.data?.id ?? null,
      });
    }

    if (!payload.links?.next) break;
    page++;
  }

  results.sort((a, b) => {
    if (!a.lastModifiedTime && !b.lastModifiedTime) return 0;
    if (!a.lastModifiedTime) return 1;
    if (!b.lastModifiedTime) return -1;
    return b.lastModifiedTime.localeCompare(a.lastModifiedTime);
  });

  return results;
}

export async function lsCommand(
  projectId: string | undefined,
  folderId: string | undefined,
  opts: { ext?: string; since?: string; type?: string; json?: boolean }
): Promise<void> {
  if (!projectId) {
    const projects = await listProjects();
    if (opts.json) {
      console.log(JSON.stringify(projects, null, 2));
    } else {
      console.log(formatProjectsTable(projects));
    }
    return;
  }
  if (!folderId) {
    const folders = await listTopFolders(projectId);
    if (opts.json) {
      console.log(JSON.stringify(folders, null, 2));
    } else {
      console.log(formatTopFoldersTable(folders));
    }
    return;
  }
  const items = await listFolderItems(projectId, folderId, opts);
  if (opts.json) {
    console.log(JSON.stringify(items, null, 2));
  } else {
    console.log(formatTable(items));
  }
}

function formatProjectsTable(projects: ListedProject[]): string {
  if (projects.length === 0) return '(no projects found)';

  const rows = projects.map(p => [p.hubName, p.projectName, p.projectId]);
  const headers = ['HUB', 'PROJECT', 'PROJECT ID'];
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map(r => r[i].length)));
  const pad = (s: string, w: number) => s.padEnd(w);
  const sep = widths.map(w => '-'.repeat(w)).join('  ');
  const header = headers.map((h, i) => pad(h, widths[i])).join('  ');
  const body = rows.map(r => r.map((c, i) => pad(c, widths[i])).join('  ')).join('\n');

  return `${header}\n${sep}\n${body}`;
}

function formatTopFoldersTable(folders: ListedFolder[]): string {
  if (folders.length === 0) return '(no folders found)';

  const rows = folders.map(f => [f.name, f.id, f.folderType ?? '-']);
  const headers = ['NAME', 'FOLDER ID', 'TYPE'];
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map(r => r[i].length)));
  const pad = (s: string, w: number) => s.padEnd(w);
  const sep = widths.map(w => '-'.repeat(w)).join('  ');
  const header = headers.map((h, i) => pad(h, widths[i])).join('  ');
  const body = rows.map(r => r.map((c, i) => pad(c, widths[i])).join('  ')).join('\n');

  return `${header}\n${sep}\n${body}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function formatTable(items: ListedItem[]): string {
  if (items.length === 0) return '(no items found)';

  const rows = items.map(item => [
    item.name,
    item.id,
    item.lastModifiedTime ? item.lastModifiedTime.replace('T', ' ').replace(/\.\d+Z$/, ' UTC') : '-',
    item.storageSize !== null ? formatBytes(item.storageSize) : '-',
    item.fileType ?? '-',
  ]);

  const headers = ['NAME', 'ID', 'MODIFIED', 'SIZE', 'TYPE'];
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map(r => r[i].length)));
  const pad = (s: string, w: number) => s.padEnd(w);
  const sep = widths.map(w => '-'.repeat(w)).join('  ');
  const header = headers.map((h, i) => pad(h, widths[i])).join('  ');
  const body = rows.map(r => r.map((c, i) => pad(c, widths[i])).join('  ')).join('\n');

  return `${header}\n${sep}\n${body}`;
}
