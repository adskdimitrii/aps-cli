import { getAccessToken } from '../lib/auth.ts';
import { runQuery } from '../lib/graphql.ts';

export async function query(queryStr: string, vars: Record<string, string>): Promise<void> {
  const token = await getAccessToken();
  const result = await runQuery(token, queryStr, vars, 'us');
  console.log(JSON.stringify(result, null, 2));
}
