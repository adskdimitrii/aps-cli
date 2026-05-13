const GRAPHQL_ENDPOINT = 'https://developer.api.autodesk.com/aec/graphql';

export interface GraphQLResponse<T = unknown> {
  data?: T;
  errors?: Array<{ message: string; locations?: unknown; path?: unknown }>;
}

export async function runQuery<T = unknown>(
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>,
  region?: string
): Promise<GraphQLResponse<T>> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
  if (region) headers['Region'] = region;

  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables: variables ?? {} }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GraphQL request failed (${res.status}): ${body}`);
  }

  return res.json() as Promise<GraphQLResponse<T>>;
}
