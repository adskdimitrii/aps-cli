export interface AccUrlContext {
  projectId: string;
  entityId: string | null;
  folderUrn: string | null;
  viewableGuid: string | null;
}

export function parseAccUrl(raw: string): AccUrlContext {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Invalid URL: ${raw}`);
  }

  // Extract project UUID from path: /docs/files/projects/{uuid}
  const pathMatch = url.pathname.match(/\/projects\/([a-f0-9-]{36})/i);
  if (!pathMatch) {
    throw new Error(
      'Could not extract project ID from URL. Expected path format: /projects/{uuid}'
    );
  }
  const projectId = pathMatch[1];

  const entityId = url.searchParams.get('entityId');
  const folderUrn = url.searchParams.get('folderUrn');
  const viewableGuid = url.searchParams.get('viewableGuid');

  return { projectId, entityId, folderUrn, viewableGuid };
}
