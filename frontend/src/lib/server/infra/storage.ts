import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  type PutObjectCommandInput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { env } from '$env/dynamic/private';

const SIGNED_URL_EXPIRES_IN = 3600; // 1 hour

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

function getClient(endpoint: string): S3Client {
  return new S3Client({
    endpoint,
    region: env.S3_REGION ?? 'garage',
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID!,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
    },
    forcePathStyle: true,
    maxAttempts: S3_MAX_ATTEMPTS,
    requestHandler: new NodeHttpHandler({
      connectionTimeout: S3_CONNECTION_TIMEOUT_MS,
      requestTimeout: 0,
    }),
  });
}

let client: S3Client | null = null;
let publicClient: S3Client | null = null;

function s3(): S3Client {
  if (!client) client = getClient(env.S3_ENDPOINT!);
  return client;
}

// Separate client that signs URLs with a hostname resolvable from the browser.
// In Docker, S3_ENDPOINT points to the internal hostname (e.g. http://garage:3900),
// which would produce signed URLs the browser cannot reach.
function s3Public(): S3Client {
  if (!publicClient) {
    publicClient = getClient(env.S3_PUBLIC_ENDPOINT ?? env.S3_ENDPOINT!);
  }
  return publicClient;
}

export async function uploadFile(
  bucket: string,
  key: string,
  body: Buffer | Uint8Array | ReadableStream,
  contentType?: string,
): Promise<void> {
  const params: PutObjectCommandInput = {
    Bucket: bucket,
    Key: key,
    Body: body,
    ...(contentType && { ContentType: contentType }),
  };
  await s3().send(new PutObjectCommand(params));
}

export interface DownloadUrlOptions {
  expiresIn?: number;
  /**
   * Human-readable filename the browser should save the object as
   * (Content-Disposition override). Keep it ASCII so no RFC 5987 encoding is
   * needed. Overrides the opaque S3 key for the download.
   */
  filename?: string;
  /**
   * Content-Disposition type paired with `filename`. `attachment` (default)
   * forces a download; `inline` lets the browser render the object in-tab
   * (e.g. an admin previewing a PDF). Ignored when `filename` is unset.
   */
  disposition?: 'attachment' | 'inline';
  /** Override the object's served Content-Type for this download. */
  contentType?: string;
}

export async function getSignedDownloadUrl(
  bucket: string,
  key: string,
  opts: DownloadUrlOptions = {},
): Promise<string> {
  const {
    expiresIn = SIGNED_URL_EXPIRES_IN,
    filename,
    disposition = 'attachment',
    contentType,
  } = opts;
  return getSignedUrl(
    s3Public(),
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ...(contentType && { ResponseContentType: contentType }),
      ...(filename && {
        ResponseContentDisposition: `${disposition}; filename="${filename}"`,
      }),
    }),
    { expiresIn },
  );
}

export async function deleteFile(bucket: string, key: string): Promise<void> {
  await s3().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export interface StorageService {
  save(
    key: string,
    data: Buffer | Uint8Array,
    contentType?: string,
  ): Promise<string>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  /** Time-limited URL the browser can open directly. */
  getDownloadUrl(key: string, opts?: DownloadUrlOptions): Promise<string>;
}

class S3StorageService implements StorageService {
  private bucket: string;

  constructor(bucket: string) {
    this.bucket = bucket;
  }

  async save(
    key: string,
    data: Buffer | Uint8Array,
    contentType?: string,
  ): Promise<string> {
    await uploadFile(this.bucket, key, data, contentType);
    return key;
  }

  async get(key: string): Promise<Buffer> {
    const result = await s3().send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!result.Body) {
      throw new Error(`Object not found: ${key}`);
    }
    const bytes = await result.Body.transformToByteArray();
    return Buffer.from(bytes);
  }

  async delete(key: string): Promise<void> {
    await deleteFile(this.bucket, key);
  }

  getDownloadUrl(key: string, opts?: DownloadUrlOptions): Promise<string> {
    return getSignedDownloadUrl(this.bucket, key, opts);
  }
}

/**
 * True when an error from {@link StorageService.get} means the object simply is
 * not there (deleted, or a row pointing at a key that was never written), as
 * opposed to a transient storage incident (timeout, throttling, 5xx) that the
 * S3 client already retried. Callers that tolerate a missing object but must
 * not mask infra failures (e.g. the bulk onboarding-PDF export) branch on this.
 */
export function isObjectNotFound(err: unknown): boolean {
  if (err instanceof Error && err.message.startsWith('Object not found:')) {
    return true;
  }
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404;
}

let instance: StorageService | null = null;

export function getStorage(): StorageService {
  if (!instance) {
    instance = new S3StorageService(env.S3_BUCKET || 'jump-files');
  }
  return instance;
}
