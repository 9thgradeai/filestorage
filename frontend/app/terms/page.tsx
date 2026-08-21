import Link from 'next/link';

export const metadata = {
  title: 'Terms of Service',
};

export default function TermsPage() {
  return (
    <div className="legal-wrap">
      <div className="legal-card">
        <Link href="/" className="settings-back" aria-label="Vault home">
          <span style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--accent-strong, #6366f1)' }}>Vault</span>
        </Link>

        <h1>Terms of Service</h1>
        <p className="legal-updated">Last updated: August 21, 2026</p>

        <section>
          <h2>1. Acceptance of Terms</h2>
          <p>
            By accessing or using Vault (&quot;the Service&quot;), you agree to be bound by these Terms of Service.
            If you do not agree to these terms, do not use the Service.
          </p>
        </section>

        <section>
          <h2>2. Description of Service</h2>
          <p>
            Vault provides secure cloud file storage, including file upload, download, organization,
            sharing via expiring links, and AI-assisted file management. The Service is provided
            &quot;as is&quot; and may be modified or discontinued at any time.
          </p>
        </section>

        <section>
          <h2>3. Account Responsibilities</h2>
          <p>
            You are responsible for maintaining the confidentiality of your account credentials.
            You must notify us immediately of any unauthorized use of your account.
            You are solely responsible for all activity that occurs under your account.
          </p>
        </section>

        <section>
          <h2>4. Acceptable Use</h2>
          <p>You agree not to:</p>
          <ul>
            <li>Upload files that violate any law or regulation</li>
            <li>Upload malicious software, malware, or content designed to harm others</li>
            <li>Attempt to gain unauthorized access to other accounts or systems</li>
            <li>Use the Service to distribute spam or unsolicited communications</li>
            <li>Overload or disrupt the Service infrastructure</li>
          </ul>
        </section>

        <section>
          <h2>5. Content Ownership</h2>
          <p>
            You retain all rights to files you upload to Vault. We do not claim ownership of your content.
            We will not access your files except as necessary to provide the Service or as required by law.
          </p>
        </section>

        <section>
          <h2>6. Storage Limits</h2>
          <p>
            Your account has a storage quota. Files exceeding your quota may not be uploadable.
            We reserve the right to enforce storage limits and may delete files that exceed your quota
            after providing reasonable notice.
          </p>
        </section>

        <section>
          <h2>7. Service Availability</h2>
          <p>
            We strive to maintain high availability but do not guarantee uninterrupted access.
            We may perform maintenance that temporarily disrupts the Service.
            We are not liable for any data loss resulting from service interruptions.
          </p>
        </section>

        <section>
          <h2>8. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, Vault shall not be liable for any indirect,
            incidental, special, consequential, or punitive damages, or any loss of profits or revenues,
            whether incurred directly or indirectly, or any loss of data, use, goodwill, or other
            intangible losses resulting from your use of the Service.
          </p>
        </section>

        <section>
          <h2>9. Termination</h2>
          <p>
            We may suspend or terminate your access to the Service at any time, with or without cause,
            with or without notice. Upon termination, your right to use the Service ceases immediately.
            You may request deletion of your account and data at any time.
          </p>
        </section>

        <section>
          <h2>10. Changes to Terms</h2>
          <p>
            We reserve the right to modify these terms at any time. Continued use of the Service
            after changes constitutes acceptance of the new terms.
          </p>
        </section>

        <section>
          <h2>11. Contact</h2>
          <p>
            For questions about these Terms, please contact us through the application.
          </p>
        </section>
      </div>
    </div>
  );
}
