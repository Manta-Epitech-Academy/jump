import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  type PutObjectCommandInput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '$env/dynamic/private';

const SIGNED_URL_EXPIRES_IN = 3600; // 1 hour

function getClient(): S3Client {
  return new S3Client({
    endpoint: env.S3_ENDPOINT!,
    region: env.S3_REGION ?? 'garage',
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID!,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
    },
    forcePathStyle: true,
  });
}

let client: S3Client | null = null;

function s3(): S3Client {
  if (!client) client = getClient();
  return client;
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
    s3(),
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
    s3(),
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
