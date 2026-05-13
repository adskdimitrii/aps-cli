import { getAccessToken } from '../lib/auth.ts';
import { parseAccUrl } from '../lib/url-parser.ts';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { listFolderItems } from './ls.ts';

interface StorageRelationship {
  data: {
    type: string;
    id: string; // urn:adsk.objects:os.object:{bucketKey}/{objectKey}
  };
}

interface ItemTipData {
  attributes: {
    name: string;
    displayName: string;
  };
  relationships: {
    storage?: StorageRelationship;
  };
}

interface ItemTipResponse {
  data: ItemTipData;
  errors?: Array<{ title: string; detail?: string }>;
}

interface SignedDownloadResponse {
  status: string;
  url: string;
}

function parseStorageUrn(storageUrn: string): { bucketKey: string; objectKey: string } {
  // Format: urn:adsk.objects:os.object:{bucketKey}/{objectKey}
  const prefix = 'urn:adsk.objects:os.object:';
  if (!storageUrn.startsWith(prefix)) {
    throw new Error(`Unexpected storage URN format: ${storageUrn}`);
  }
  const rest = storageUrn.slice(prefix.length);
  const slashIdx = rest.indexOf('/');
  if (slashIdx < 1) {
    throw new Error(`Could not parse bucket key and object key from storage URN: ${storageUrn}`);
  }
  return {
    bucketKey: rest.slice(0, slashIdx),
    objectKey: rest.slice(slashIdx + 1),
  };
}

export async function downloadCommand(
  accUrl: string | undefined,
  opts: { output?: string; projectId?: string; entityId?: string; folderId?: string; ext?: string; since?: string }
): Promise<void> {
  // Folder-download mode: list matching files then download each one
  if (opts.folderId && !opts.entityId) {
    if (!opts.projectId) {
      throw new Error('--project-id is required when using --folder-id');
    }

    const items = await listFolderItems(opts.projectId, opts.folderId, {
      ext: opts.ext,
      since: opts.since,
    });

    if (items.length === 0) {
      process.stderr.write('No matching files found.\n');
      return;
    }

    const outputDir = opts.output ?? process.cwd();
    mkdirSync(outputDir, { recursive: true });
    process.stderr.write(`Found ${items.length} file(s). Downloading to: ${outputDir}\n`);

    const token = await getAccessToken();
    const dmProjectId = `b.${opts.projectId.replace(/^b\./, '')}`;

    const downloadOne = async (item: (typeof items)[number]): Promise<string> => {
      // Use the storage URN already available from the folder listing (no extra API call needed).
      // Fall back to fetching the item tip if it was somehow missing.
      let storageUrn: string;
      if (item.storageUrn) {
        storageUrn = item.storageUrn;
      } else {
        const tipUrl = `https://developer.api.autodesk.com/data/v1/projects/${encodeURIComponent(dmProjectId)}/items/${encodeURIComponent(item.id)}/tip`;
        const tipRes = await fetch(tipUrl, { headers: { Authorization: `Bearer ${token}` } });
        if (!tipRes.ok) {
          const body = await tipRes.text();
          throw new Error(`failed to fetch item tip (${tipRes.status}): ${body}`);
        }
        const tipData = (await tipRes.json()) as ItemTipResponse;
        if (tipData.errors?.length) {
          throw new Error(`API errors: ${tipData.errors.map(e => e.detail ?? e.title).join(', ')}`);
        }
        const storageObj = tipData.data.relationships.storage;
        if (!storageObj) throw new Error('no storage object (may not be downloadable)');
        storageUrn = storageObj.data.id;
      }

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

      const outputPath = join(outputDir, item.name);
      const fileRes = await fetch(signedData.url);
      if (!fileRes.ok) throw new Error(`failed to download from S3 (${fileRes.status})`);

      const arrayBuffer = await fileRes.arrayBuffer();
      writeFileSync(outputPath, Buffer.from(arrayBuffer));
      return outputPath;
    };

    process.stderr.write('\n');
    const results = await Promise.allSettled(items.map(item => downloadOne(item)));
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled') {
        console.log(`Downloaded: ${result.value}`);
      } else {
        const msg = result.reason instanceof Error ? result.reason.message : String(result.reason);
        process.stderr.write(`Skipping ${items[i].name}: ${msg}\n`);
      }
    }
    return;
  }

  const token = await getAccessToken();

  let projectId: string;
  let entityId: string;

  if (opts.projectId && opts.entityId) {
    // Direct params provided — strip any "b." prefix from project ID for consistency
    projectId = opts.projectId.replace(/^b\./, '');
    entityId = opts.entityId;
  } else if (accUrl) {
    const ctx = parseAccUrl(accUrl);
    if (!ctx.entityId) {
      throw new Error(
        'No entityId found in the ACC URL. Make sure the URL contains an entityId query parameter.'
      );
    }
    projectId = ctx.projectId;
    entityId = ctx.entityId;
  } else {
    throw new Error(
      'Provide either an ACC URL or both --project-id and --entity-id.'
    );
  }

  const dmProjectId = `b.${projectId}`;

  // Step 1: Get the item tip to find filename and storage URN
  process.stderr.write(`Fetching item info for entityId: ${entityId}\n`);

  const tipUrl = `https://developer.api.autodesk.com/data/v1/projects/${encodeURIComponent(dmProjectId)}/items/${encodeURIComponent(entityId)}/tip`;
  const tipRes = await fetch(tipUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!tipRes.ok) {
    const body = await tipRes.text();
    throw new Error(`Failed to fetch item tip (${tipRes.status}): ${body}`);
  }

  const tipData = (await tipRes.json()) as ItemTipResponse;

  if (tipData.errors && tipData.errors.length > 0) {
    const msg = tipData.errors.map(e => e.detail ?? e.title).join(', ');
    throw new Error(`API errors fetching item tip: ${msg}`);
  }

  const fileName = tipData.data.attributes.displayName || tipData.data.attributes.name;
  const storageObj = tipData.data.relationships.storage;

  if (!storageObj) {
    throw new Error(`No storage object found for this item. It may not be a downloadable file.`);
  }

  const storageUrn = storageObj.data.id;
  process.stderr.write(`Resolved file: ${fileName}\n`);
  process.stderr.write(`Storage URN: ${storageUrn}\n`);

  // Step 2: Generate a signed S3 download URL
  const { bucketKey, objectKey } = parseStorageUrn(storageUrn);
  const signedUrl = `https://developer.api.autodesk.com/oss/v2/buckets/${encodeURIComponent(bucketKey)}/objects/${encodeURIComponent(objectKey)}/signeds3download`;

  process.stderr.write(`Generating signed download URL...\n`);

  const signedRes = await fetch(signedUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!signedRes.ok) {
    const body = await signedRes.text();
    throw new Error(`Failed to generate signed S3 URL (${signedRes.status}): ${body}`);
  }

  const signedData = (await signedRes.json()) as SignedDownloadResponse;

  if (signedData.status !== 'complete') {
    throw new Error(`Unexpected signed URL status: ${signedData.status}. The file may still be processing.`);
  }

  // Step 3: Download the file from the signed S3 URL (no auth header)
  const outputPath = opts.output ?? join(process.cwd(), fileName);
  process.stderr.write(`Downloading to: ${outputPath}\n`);

  const fileRes = await fetch(signedData.url);

  if (!fileRes.ok) {
    throw new Error(`Failed to download file from S3 (${fileRes.status})`);
  }

  const arrayBuffer = await fileRes.arrayBuffer();
  writeFileSync(outputPath, Buffer.from(arrayBuffer));

  console.log(`Downloaded: ${outputPath}`);
}
