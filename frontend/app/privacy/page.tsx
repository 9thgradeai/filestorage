import Link from 'next/link';

export const metadata = {
  title: 'Privacy Policy',
};

export default function PrivacyPage() {
  return (
    <div className="legal-wrap">
      <div className="legal-card">
        <Link href="/" className="settings-back" aria-label="Vault home">
          <span style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--accent-strong, #6366f1)' }}>Vault</span>
        </Link>

        <h1>Privacy Policy</h1>
        <p className="legal-updated">Last updated: August 21, 2026</p>

        <section>
          <h2>1. Information We Collect</h2>
          <p>We collect information you provide directly:</p>
          <ul>
            <li><strong>Account information:</strong> Name, email address, and password (stored as a bcrypt hash)</li>
            <li><strong>Files you upload:</strong> Stored encrypted at rest in our cloud storage</li>
            <li><strong>Usage data:</strong> Basic analytics such as pages visited and features used</li>
            <li><strong>Session data:</strong> Authentication tokens stored in HttpOnly cookies</li>
          </ul>
        </section>

        <section>
          <h2>2. How We Use Your Information</h2>
          <p>We use your information to:</p>
          <ul>
            <li>Provide, maintain, and improve the Service</li>
            <li>Authenticate your identity and manage your account</li>
            <li>Process file uploads, downloads, and sharing</li>
            <li>Send you service-related communications (e.g., verification codes, password resets)</li>
            <li>Detect and prevent fraud, abuse, and security incidents</li>
          </ul>
        </section>

        <section>
          <h2>3. File Privacy</h2>
          <p>
            Your files are private by default. Only you can access your files unless you explicitly
            share them via a public link or share token. We do not scan, analyze, or use your files
            for advertising or any purpose other than providing the Service to you.
          </p>
        </section>

        <section>
          <h2>4. Data Storage and Security</h2>
          <ul>
            <li>Files are encrypted at rest using AES-256</li>
            <li>All connections are encrypted via TLS/HTTPS</li>
            <li>Authentication uses HttpOnly, Secure, SameSite cookies</li>
            <li>Passwords are hashed with bcrypt (12+ rounds)</li>
            <li>We implement CSRF protection via double-submit cookies</li>
            <li>Rate limiting protects against brute-force attacks</li>
          </ul>
        </section>

        <section>
          <h2>5. Data Sharing</h2>
          <p>
            We do not sell, trade, or rent your personal information to third parties.
            We may share information only in the following circumstances:
          </p>
          <ul>
            <li>With your explicit consent</li>
            <li>To comply with legal obligations or valid legal process</li>
            <li>To protect the rights, property, or safety of Vault, our users, or the public</li>
            <li>With service providers who assist in operating the Service (e.g., cloud hosting), bound by contractual obligations to protect your data</li>
          </ul>
        </section>

        <section>
          <h2>6. Data Retention</h2>
          <p>
            We retain your account data for as long as your account is active.
            When you delete your account, we permanently remove your personal information
            and files within 30 days. Trashed files are permanently deleted after 30 days.
          </p>
        </section>

        <section>
          <h2>7. Your Rights</h2>
          <p>You have the right to:</p>
          <ul>
            <li>Access, correct, or delete your personal information</li>
            <li>Export your data in a portable format</li>
            <li>Object to processing of your personal data</li>
            <li>Withdraw consent at any time</li>
          </ul>
        </section>

        <section>
          <h2>8. Cookies</h2>
          <p>
            We use only essential cookies for authentication (HttpOnly session tokens and CSRF tokens).
            We do not use tracking cookies, advertising cookies, or third-party analytics cookies.
          </p>
        </section>

        <section>
          <h2>9. AI Features</h2>
          <p>
            If you use the AI assistant feature, your messages are processed by a third-party
            AI provider (Groq) to generate responses. Your file metadata (names, types, sizes)
            may be included as context. File contents are not sent to the AI provider.
            Conversation history is stored in memory only and is not persisted.
          </p>
        </section>

        <section>
          <h2>10. Children&apos;s Privacy</h2>
          <p>
            The Service is not intended for users under the age of 13.
            We do not knowingly collect information from children.
          </p>
        </section>

        <section>
          <h2>11. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time.
            We will notify you of any material changes by posting the new policy on this page
            and updating the &quot;Last updated&quot; date.
          </p>
        </section>

        <section>
          <h2>12. Contact</h2>
          <p>
            For questions about this Privacy Policy, please contact us through the application.
          </p>
        </section>
      </div>
    </div>
  );
}
