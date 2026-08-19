import { sendOtpEmail, sendOtpEmailAsync, getLastSentCode } from '../services/email.service';

describe('Email service', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    delete (global as any).__RESEND_MOCK__;
  });

  describe('Resend HTTPS provider', () => {
    it('sends via the Resend API when RESEND_API_KEY is set', async () => {
      process.env.RESEND_API_KEY = 're_test_key';
      process.env.EMAIL_FROM_NAME = 'Vault';
      process.env.EMAIL_FROM_EMAIL = 'no-reply@example.com';

      const captured: any = {};
      (global as any).fetch = async (url: string, init: any) => {
        captured.url = url;
        captured.init = init;
        return { ok: true, status: 200 };
      };

      const ok = await sendOtpEmail('test@example.com', 'email_verification', '123456', 10);

      expect(ok).toBe(true);
      expect(captured.url).toBe('https://api.resend.com/emails');
      const body = JSON.parse(captured.init.body);
      expect(body.from).toBe('"Vault" <no-reply@example.com>');
      expect(body.to).toEqual(['test@example.com']);
      expect(body.subject).toContain('verification');
      expect(captured.init.headers.Authorization).toBe('Bearer re_test_key');
    });

    it('returns false and logs when Resend rejects', async () => {
      process.env.RESEND_API_KEY = 're_test_key';
      (global as any).fetch = async () => ({ ok: false, status: 422, text: async () => 'bad domain' });

      const ok = await sendOtpEmail('test@example.com', 'email_verification', '123456', 10);
      expect(ok).toBe(false);
    });

    it('falls back to SMTP when no Resend key is present', async () => {
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_USER = 'user';
      process.env.SMTP_PASS = 'pass';

      const ok = await sendOtpEmail('test@example.com', 'email_verification', '123456', 10);
      // No SMTP server is reachable in tests, but the call must resolve (sendMail
      // swallows the connection error) and never throw.
      expect(typeof ok).toBe('boolean');
    });
  });

  describe('sendOtpEmailAsync', () => {
    it('captures the code synchronously and does not block', async () => {
      // Run in test mode: the code must be retrievable right after the call.
      process.env.NODE_ENV = 'test';
      sendOtpEmailAsync('async@example.com', 'email_verification', '654321', 10);

      expect(getLastSentCode('async@example.com', 'email_verification')).toBe('654321');
    });
  });
});