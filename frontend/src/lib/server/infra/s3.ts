import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';

// The S3 connection, free of SvelteKit's aliases so a script run under plain
// `bun` reaches the same bucket the same way: the seed stores its pictures
// through it. The app reads it through `storage.ts`.

/** The connection the `S3_*` variables describe, read here and nowhere else. */
export function s3Settings(env: Record<string, string | undefined>) {
  return {
    endpoint: env.S3_ENDPOINT,
    // Signs URLs with a hostname the browser can resolve. In Docker,
    // S3_ENDPOINT points to the internal hostname (e.g. http://garage:3900),
    // which would produce signed URLs the browser cannot reach.
    publicEndpoint: env.S3_PUBLIC_ENDPOINT ?? env.S3_ENDPOINT,
    region: env.S3_REGION ?? 'garage',
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    bucket: env.S3_BUCKET || 'jump-files',
  };
}

export type S3Settings = ReturnType<typeof s3Settings>;

// Bound how long an S3 call may wait to CONNECT, and cap retries. Without this
// the SDK waits on the OS default (tens of seconds) when the endpoint is
// unreachable or unresponsive, and on a request-scoped read like the avatar
// proxy that hang holds a browser connection: six of them saturate the
// per-origin pool and the whole page stalls (every other request goes pending).
// A bounded connect makes a missing/down S3 fail fast (then surface as a 404)
// instead of wedging the app. `requestTimeout` stays 0 (unbounded transfer) so
// large uploads/downloads (diplomas, PDFs) are never cut off mid-stream.
const S3_CONNECTION_TIMEOUT_MS = 3000;
const S3_MAX_ATTEMPTS = 2;

export function s3Client(settings: S3Settings, endpoint: string): S3Client {
  return new S3Client({
    endpoint,
    region: settings.region,
    credentials: {
      accessKeyId: settings.accessKeyId!,
      secretAccessKey: settings.secretAccessKey!,
    },
    forcePathStyle: true,
    maxAttempts: S3_MAX_ATTEMPTS,
    requestHandler: new NodeHttpHandler({
      connectionTimeout: S3_CONNECTION_TIMEOUT_MS,
      requestTimeout: 0,
    }),
  });
}

export async function putObject(
  client: S3Client,
  bucket: string,
  key: string,
  body: Buffer | Uint8Array | ReadableStream,
  contentType?: string,
): Promise<void> {
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ...(contentType && { ContentType: contentType }),
    }),
  );
}
