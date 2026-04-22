import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  type PutObjectCommandInput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { env } from '$env/dynamic/private';

const SIGNED_URL_EXPIRES_IN = 3600; // 1 hour

function getClient(endpoint: string): S3Client {
  return new S3Client({
    endpoint,
    region: env.S3_REGION ?? 'garage',
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID!,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
    },
    forcePathStyle: true,
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

export async function getSignedDownloadUrl(
  bucket: string,
  key: string,
  expiresIn: number = SIGNED_URL_EXPIRES_IN,
): Promise<string> {
  return getSignedUrl(
    s3Public(),
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn },
  );
}

export async function getSignedUploadUrl(
  bucket: string,
  key: string,
  contentType: string,
  expiresIn: number = SIGNED_URL_EXPIRES_IN,
): Promise<string> {
  return getSignedUrl(
    s3Public(),
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn },
  );
}

export async function deleteFile(bucket: string, key: string): Promise<void> {
  await s3().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export interface StorageService {
  save(key: string, data: Buffer | Uint8Array): Promise<string>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

class LocalStorageService implements StorageService {
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  async save(key: string, data: Buffer | Uint8Array): Promise<string> {
    const fullPath = join(this.basePath, key);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, data);
    return key;
  }

  async get(key: string): Promise<Buffer> {
    const fullPath = join(this.basePath, key);
    return readFile(fullPath);
  }

  async delete(key: string): Promise<void> {
    const fullPath = join(this.basePath, key);
    await unlink(fullPath);
  }
}

let instance: StorageService | null = null;

export function getStorage(): StorageService {
  if (!instance) {
    const basePath = env.STORAGE_PATH || './storage';
    instance = new LocalStorageService(basePath);
  }
  return instance;
}
