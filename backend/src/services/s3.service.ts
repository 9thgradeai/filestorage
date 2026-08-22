import { Readable } from 'stream';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import dotenv from 'dotenv';

dotenv.config();

// Server-side encryption: default to SSE-S3 (AES256). Set S3_KMS_KEY_ID to use
// a customer-managed KMS key instead.
const sseConfig = process.env.S3_KMS_KEY_ID
  ? { ServerSideEncryption: 'aws:kms' as const, SSEKMSKeyId: process.env.S3_KMS_KEY_ID }
  : { ServerSideEncryption: 'AES256' as const };

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials:
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
      : undefined, // fall back to default credential chain (IAM roles, etc.)
});

const bucket = (): string => {
  if (!process.env.S3_BUCKET_NAME) {
    throw new Error('S3_BUCKET_NAME is not configured');
  }
  return process.env.S3_BUCKET_NAME;
};

export const s3Upload = async (
  key: string,
  body: Buffer | Readable,
  contentType: string
) => {
  // No ACL parameter: buckets created since April 2023 default to
  // "Bucket owner enforced" (ACLs disabled) and REJECT any request that
  // carries one — this silently broke every upload while reads kept working.
  // Omitting it keeps behavior correct for both ACL-enabled legacy buckets
  // (objects default to private) and ACL-disabled buckets.
  const command = new PutObjectCommand({
    Bucket: bucket(),
    Key: key,
    Body: body,
    ContentType: contentType,
    ...sseConfig,
  });

  await s3Client.send(command);
  return { key };
};

export const s3Delete = async (key: string) => {
  const command = new DeleteObjectCommand({
    Bucket: bucket(),
    Key: key,
  });

  await s3Client.send(command);
};

export const s3Download = async (key: string): Promise<Readable> => {
  const command = new GetObjectCommand({
    Bucket: bucket(),
    Key: key,
  });

  const response = await s3Client.send(command);
  if (!response.Body) {
    throw new Error(`S3 object ${key} has no body`);
  }
  return response.Body as Readable;
};

export const generateShareableLink = async (key: string, expiresIn: number = 3600) => {
  const command = new GetObjectCommand({
    Bucket: bucket(),
    Key: key,
  });

  const url = await getSignedUrl(s3Client, command, { expiresIn });
  return url;
};