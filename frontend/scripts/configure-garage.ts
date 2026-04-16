/**
 * Configures a Garage S3 instance: cluster layout, API key, bucket.
 * Safe to run on every startup — skips anything already configured.
 *
 * Required env vars:
 *   GARAGE_ADMIN_ENDPOINT  — Garage admin API (e.g. http://garage:3903)
 *   GARAGE_ADMIN_TOKEN     — Bearer token matching garage.toml admin_token
 *
 * Usage: bun run db:garage
 */

import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const GARAGE_ADMIN = process.env.GARAGE_ADMIN_ENDPOINT;
const ADMIN_TOKEN = process.env.GARAGE_ADMIN_TOKEN;
const BUCKET_NAME = 'jump-files';
const KEY_NAME = 'jump-app';

if (!GARAGE_ADMIN || !ADMIN_TOKEN) {
  console.error('Missing GARAGE_ADMIN_ENDPOINT or GARAGE_ADMIN_TOKEN in env.');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${ADMIN_TOKEN}`,
  'Content-Type': 'application/json',
};

async function api<T = unknown>(
  method: string,
  endpoint: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${GARAGE_ADMIN}/v2/${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} /v2/${endpoint} → ${res.status}: ${text}`);
  }
  return text ? JSON.parse(text) : ({} as T);
}

async function main() {
  // 1. Wait for Garage admin API
  let ready = false;
  for (let i = 0; i < 30; i++) {
    try {
      await api('GET', 'GetClusterStatus');
      ready = true;
      break;
    } catch {
      await Bun.sleep(2000);
    }
  }
  if (!ready) {
    console.error('Garage admin API not reachable at ' + GARAGE_ADMIN);
    process.exit(1);
  }

  // 2. Cluster layout — skip if already applied
  const layout = await api<{ version: number }>('GET', 'GetClusterLayout');
  if (layout.version === 0) {
    const status = await api<{ nodes: { id: string }[] }>(
      'GET',
      'GetClusterStatus',
    );
    const nodeId = status.nodes[0]?.id;
    if (!nodeId) {
      console.error('No nodes found in cluster');
      process.exit(1);
    }
    await api('POST', 'UpdateClusterLayout', {
      roles: [
        { id: nodeId, zone: 'dc1', capacity: 1_000_000_000, tags: ['node1'] },
      ],
    });
    await api('POST', 'ApplyClusterLayout', { version: 1 });
    console.log('✓ Cluster layout applied');
  }

  // 3. API key — delete old one if exists, then create fresh
  const keys = await api<{ id: string; name: string }[]>('GET', 'ListKeys');
  const existingKey = keys.find((k) => k.name === KEY_NAME);
  if (existingKey) {
    await api('POST', `DeleteKey?id=${existingKey.id}`);
  }
  const key = await api<{ accessKeyId: string; secretAccessKey: string }>(
    'POST',
    'CreateKey',
    { name: KEY_NAME },
  );
  const keyId = key.accessKeyId;
  console.log(
    '✓ API key created. PLEASE PUT THAT VARIABLES ON YOUR APP .env !',
  );
  console.log(`  S3_ACCESS_KEY_ID=${key.accessKeyId}`);
  console.log(`  S3_SECRET_ACCESS_KEY=${key.secretAccessKey}`);

  // 4. Bucket — skip if already exists
  const buckets = await api<{ id: string; globalAliases: string[] }[]>(
    'GET',
    'ListBuckets',
  );
  let bucketId = buckets.find((b) =>
    b.globalAliases?.includes(BUCKET_NAME),
  )?.id;

  if (!bucketId) {
    const bucket = await api<{ id: string }>('POST', 'CreateBucket', {
      globalAlias: BUCKET_NAME,
    });
    bucketId = bucket.id;
    console.log('✓ Bucket "jump-files" created');
  }

  // 5. Grant key → bucket permissions
  await api('POST', 'AllowBucketKey', {
    bucketId,
    accessKeyId: keyId,
    permissions: { read: true, write: true, owner: true },
  });

  console.log('✓ Garage configured');
}

main().catch((e) => {
  console.error('Configure garage failed:', e);
  process.exit(1);
});
