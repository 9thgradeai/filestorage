// Fail fast at boot if required configuration is missing or invalid.

// AWS credentials are deliberately NOT required: the SDK resolves them from
// the default chain (IAM instance role, ~/.aws, env). The bucket has no
// fallback, so it is mandatory for the S3 driver; the local disk driver
// (STORAGE_DRIVER=local) does not need it.
const buildRequired = (): string[] => {
  const required = ['JWT_SECRET'];
  if (process.env.STORAGE_DRIVER !== 'local') required.push('S3_BUCKET_NAME');
  return required;
};

export const validateEnv = (): void => {
  if (process.env.NODE_ENV !== 'production') return;

  const required = buildRequired();
  // OTP email delivery requires an SMTP relay in production.
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    // configured — nothing extra required
  } else if (!process.env.SMTP_HOST) {
    required.push('SMTP_HOST');
  } else if (!process.env.SMTP_USER) {
    required.push('SMTP_USER');
  } else if (!process.env.SMTP_PASS) {
    required.push('SMTP_PASS');
  }

  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables in production: ${missing.join(', ')}`
    );
  }

  if ((process.env.JWT_SECRET || '').length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters in production');
  }
};