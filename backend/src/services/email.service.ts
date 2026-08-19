import nodemailer, { Transporter } from 'nodemailer';
import { logger } from '../config/logger';

// Email delivery is pluggable by environment:
//  - production: a real SMTP relay is required (validated at boot in env.ts).
//  - development: if SMTP is unset we log the email body to the console so the
//    OTP flow is usable locally without a mail server.
//  - test: codes are captured in-memory so suites can assert the full OTP flow
//    end-to-end without touching the network.

const isProduction = process.env.NODE_ENV === 'production';

const smtpConfigured = (): boolean =>
  Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

let transporter: Transporter | null = null;

const getTransporter = (): Transporter | null => {
  if (!smtpConfigured()) return null;
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER!,
      pass: process.env.SMTP_PASS!,
    },
    // Reject unknown certs in production; relax when explicitly opted out.
    tls: process.env.SMTP_TLS_REJECT_UNAUTHORIZED === 'false' ? { rejectUnauthorized: false } : undefined,
  });
  return transporter;
};

// In test mode the latest code per (email, purpose) is kept so integration
// tests can drive the full register → OTP → verify flow deterministically.
const sentCodes = new Map<string, string>();
const codeKey = (email: string, purpose: string) => `${purpose}:${email.toLowerCase()}`;

export const getLastSentCode = (email: string, purpose: string): string | undefined =>
  sentCodes.get(codeKey(email, purpose));

interface SendEmailParams {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export const sendEmail = async ({ to, subject, text, html }: SendEmailParams): Promise<boolean> => {
  const t = getTransporter();
  if (!t) {
    if (isProduction) {
      logger.error({ to, subject }, 'SMTP not configured — email not sent');
      return false;
    }
    logger.warn({ to, subject, text }, 'SMTP not configured — email logged to console');
    return true;
  }

  try {
    await t.sendMail({
      from: `"${process.env.SMTP_FROM_NAME || 'Vault'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
      to,
      subject,
      text,
      html,
    });
    return true;
  } catch (err) {
    logger.error({ err, to, subject }, 'Failed to send email');
    return false;
  }
};

// Build a small branded HTML + plain-text email that carries a one-time code.
export const sendOtpEmail = async (to: string, purpose: string, code: string, ttlMinutes: number): Promise<boolean> => {
  const subject =
    purpose === 'password_reset' ? 'Your password reset code' : 'Your verification code';

  const text = [
    'Hello,',
    '',
    purpose === 'password_reset'
      ? 'You requested a password reset for your Vault account.'
      : 'Welcome to Vault! Confirm your email address to activate your account.',
    '',
    `Your one-time code is: ${code}`,
    `This code expires in ${ttlMinutes} minutes.`,
    '',
    'If you did not request this, you can safely ignore this email.',
  ].join('\n');

  const html = `
    <div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #0f172a; background: #ffffff;">
      <h2 style="margin: 0 0 8px; font-size: 20px; font-weight: 700;">${subject}</h2>
      <p style="margin: 0 0 20px; font-size: 14px; line-height: 1.6; color: #334155;">
        ${purpose === 'password_reset'
          ? 'Use the code below to reset your password.'
          : 'Use the code below to verify your email and activate your account.'}
      </p>
      <div style="display: inline-block; padding: 14px 28px; border-radius: 8px; background: #ecfdf5; border: 1px solid #a7f3d0; font-size: 28px; font-weight: 800; letter-spacing: 8px; color: #047857;">
        ${code}
      </div>
      <p style="margin: 20px 0 0; font-size: 13px; line-height: 1.6; color: #64748b;">
        This code expires in <strong>${ttlMinutes} minutes</strong>. If you did not request this,
        you can safely ignore this email.
      </p>
    </div>
  `;

  // In test mode capture the code so suites can drive the OTP flow.
  if (process.env.NODE_ENV === 'test') {
    sentCodes.set(codeKey(to, purpose), code);
  }

  return sendEmail({ to, subject, text, html });
};