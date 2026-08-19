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
  // OTP email delivery requires a provider in production:
  //  - Resend HTTPS API (works on all Railway plans)
  //  - SendGrid v3 REST API (free trial, no domain, needs a verified Single
  //    Sender via EMAIL_FROM_EMAIL)
  //  - SMTP relay (Railway Pro and above only)
  const hasResend = Boolean(process.env.RESEND_API_KEY);
  const hasSendgrid = Boolean(process.env.SENDGRID_API_KEY);
  const hasSmtp = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  if (!hasResend && !hasSendgrid && !hasSmtp) {
    required.push('RESEND_API_KEY, SENDGRID_API_KEY, or SMTP_HOST');
  }
  if (hasSendgrid && !process.env.EMAIL_FROM_EMAIL) {
    required.push('EMAIL_FROM_EMAIL (SendGrid verified Single Sender)');
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