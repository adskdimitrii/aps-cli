import { getAccessToken } from '../lib/auth.ts';
import { parseAccUrl } from '../lib/url-parser.ts';
import { runQuery } from '../lib/graphql.ts';
import type { GraphQLResponse } from '../lib/graphql.ts';

interface ItemTipResponse {
  data?: {
    attributes?: {
      name?: string;
      displayName?: string;
    };
  };
}

interface HubResult {
  id: string;
  name: string;
}

interface HubsData {
  hubs: {
    pagination: { cursor: string | null };
    results: HubResult[];
  };
}

interface ProjectsPageData {
  projects: {
    pagination: { cursor: string | null };
    results: Array<{
      id: string;
      name: string;
      alternativeIdentifiers: {
        dataManagementAPIProjectId: string;
      } | null;
    }>;
  };
}

const HUBS_QUERY = `
query GetHubs($cursor: String) {
  hubs(pagination: { cursor: $cursor }) {
    pagination { cursor }
    results {
      id
      name
    }
  }
}
`;

const PROJECTS_PAGE_QUERY = `
query GetProjectsPage($hubId: ID!, $cursor: String) {
  projects(hubId: $hubId, pagination: { cursor: $cursor }) {
    pagination { cursor }
    results {
      id
      name
      alternativeIdentifiers {
        dataManagementAPIProjectId
      }
    }
  }
}
`;

async function resolveFileNameFromEntityId(
  accessToken: string,
  dmProjectId: string,
  entityId: string
): Promise<string | null> {
  const encodedProjectId = encodeURIComponent(dmProjectId);
  const encodedEntityId = encodeURIComponent(entityId);
  const endpoint = `https://developer.api.autodesk.com/data/v1/projects/${encodedProjectId}/items/${encodedEntityId}/tip`;

  const res = await fetch(endpoint, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to resolve entityId via Data API (${res.status}): ${body}`);
  }

  const payload = (await res.json()) as ItemTipResponse;
  return payload.data?.attributes?.displayName ?? payload.data?.attributes?.name ?? null;
}

export async function urlCommand(accUrl: string): Promise<void> {
  const token = await getAccessToken();
  const ctx = parseAccUrl(accUrl);

  // ACC project UUID in the URL maps to the Data Management API project ID with a "b." prefix
  const dmProjectId = `b.${ctx.projectId}`;

  process.stderr.write(`Searching for project with Data Management ID: ${dmProjectId}\n\n`);

  // Step 1: collect all hubs (paginated)
  const hubs: HubResult[] = [];
  let hubCursor: string | null = null;
  while (true) {
    const hubResult: GraphQLResponse<HubsData> = await runQuery<HubsData>(token, HUBS_QUERY, hubCursor ? { cursor: hubCursor } : undefined, 'us');
    if (!hubResult.data && hubResult.errors && hubResult.errors.length > 0) {
      const messages = hubResult.errors.map((e: { message: string }) => e.message).join(', ');
      throw new Error(`GraphQL errors fetching hubs: ${messages}`);
    }
    hubs.push(...(hubResult.data?.hubs?.results ?? []));
    hubCursor = hubResult.data?.hubs?.pagination?.cursor ?? null;
    if (!hubCursor) break;
  }

  // Step 2: for each hub, paginate through projects to find a match
  for (const hub of hubs) {
    let cursor: string | null = null;
    while (true) {
      const pageResult: GraphQLResponse<ProjectsPageData> = await runQuery<ProjectsPageData>(
        token, PROJECTS_PAGE_QUERY, { hubId: hub.id, ...(cursor ? { cursor } : {}) }, 'us'
      );
      const projects = pageResult.data?.projects?.results ?? [];
      cursor = pageResult.data?.projects?.pagination?.cursor ?? null;

      for (const project of projects) {
        const altId = project.alternativeIdentifiers?.dataManagementAPIProjectId;
        if (altId === dmProjectId) {
          const result: Record<string, string | null> = {
            hubId: hub.id,
            hubName: hub.name,
            projectId: project.id,
            projectName: project.name,
            entityId: ctx.entityId,
            fileName: null,
          };

          if (ctx.entityId) {
            result.fileName = await resolveFileNameFromEntityId(token, dmProjectId, ctx.entityId);
            if (!result.fileName) {
              process.stderr.write(`No file found for entityId in project: ${ctx.entityId}\n`);
            }
          }

          console.log(JSON.stringify(result, null, 2));
          return;
        }
      }
      if (!cursor) break;
    }
  }

  throw new Error(
    `No project found matching Data Management ID: ${dmProjectId}\n` +
      `Searched ${hubs.length} hub(s). Make sure you are logged in with access to this project.`
  );
}
