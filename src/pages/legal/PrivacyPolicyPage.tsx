/**
 * Privacy Policy — public page at /privacy.
 * Registered outside <AuthGuard> in App.tsx.
 */

import { LegalShell } from './LegalShell';

const LAST_UPDATED = '24 July 2026';

export default function PrivacyPolicyPage() {
  return (
    <LegalShell title="Privacy Policy" lastUpdated={LAST_UPDATED}>
      <p>
        This Privacy Policy explains how <strong>MaterialsHub</strong> ("we", "us", "our", the
        "Platform") collects, uses, shares and protects personal data when you use our website,
        applications and services (together, the "Services"). We are committed to processing your
        data lawfully, transparently and only for the purposes described here.
      </p>
      <p>
        By using the Services you agree to the practices described in this Policy. If you do not
        agree, please do not use the Services.
      </p>

      <h2>1. Who we are</h2>
      <p>
        MaterialsHub operates a materials sourcing, catalog, quoting and business-management
        platform for design and construction professionals. For any privacy question, or to
        exercise your rights, contact us at{' '}
        <a href="mailto:support@materialshub.gr">support@materialshub.gr</a>.
      </p>

      <h2>2. Data we collect</h2>
      <h3>Information you provide</h3>
      <ul>
        <li><strong>Account and profile data</strong> — name, email address, password, company details, VAT/tax identifiers, business address and role.</li>
        <li><strong>Business content</strong> — products, catalogs, quotes, invoices, projects, moodboards, documents, images and files you upload or create.</li>
        <li><strong>Contacts and customers</strong> — information about your customers, suppliers and contacts that you add to the Platform.</li>
        <li><strong>Communications</strong> — messages, support requests and feedback you send us.</li>
        <li><strong>Payment information</strong> — billing details processed by our payment provider (we do not store full card numbers).</li>
      </ul>
      <h3>Information collected automatically</h3>
      <ul>
        <li><strong>Usage data</strong> — pages viewed, features used, actions taken and timestamps.</li>
        <li><strong>Device and log data</strong> — IP address, browser type, operating system and diagnostic information.</li>
        <li><strong>Cookies and similar technologies</strong> — used to keep you signed in, remember preferences and measure performance.</li>
      </ul>
      <h3>Information from third parties</h3>
      <ul>
        <li>Authentication providers when you sign in via a third party.</li>
        <li>Public business registries (e.g. tax authorities) when you request business-detail lookups.</li>
        <li>Connected integrations you authorise (e.g. email, social publishing or e-invoicing services).</li>
      </ul>

      <h2>3. How we use your data</h2>
      <ul>
        <li>Provide, operate, maintain and improve the Services.</li>
        <li>Create and manage your account and workspace.</li>
        <li>Process quotes, invoices, payments and business transactions you initiate.</li>
        <li>Power AI-assisted features such as search, material analysis, document processing and assistants.</li>
        <li>Send service, security and transactional communications.</li>
        <li>Provide customer support and respond to your requests.</li>
        <li>Monitor usage, prevent fraud and abuse, and keep the Platform secure.</li>
        <li>Comply with legal, tax and regulatory obligations.</li>
      </ul>

      <h2>4. Legal bases for processing</h2>
      <p>Where applicable law (including the EU/EEA GDPR) requires a legal basis, we rely on:</p>
      <ul>
        <li><strong>Contract</strong> — to provide the Services you have signed up for.</li>
        <li><strong>Legitimate interests</strong> — to secure, improve and operate the Platform.</li>
        <li><strong>Legal obligation</strong> — to meet accounting, tax and other legal duties.</li>
        <li><strong>Consent</strong> — where we ask for it (e.g. certain cookies or optional communications). You may withdraw consent at any time.</li>
      </ul>

      <h2>5. AI processing</h2>
      <p>
        Some features use artificial intelligence, including third-party AI providers, to analyse
        content you submit (such as text, product data and images) and generate results. Content is
        sent to these providers only to deliver the requested feature. We do not use your private
        business content to train foundational models. AI output may contain inaccuracies and should
        be reviewed before you rely on it.
      </p>

      <h2>6. How we share data</h2>
      <p>We do not sell your personal data. We share it only as follows:</p>
      <ul>
        <li><strong>Service providers</strong> — hosting, database, storage, email delivery, payment processing, analytics and AI providers who process data on our behalf under contract.</li>
        <li><strong>Within your workspace</strong> — content is visible to other members of the workspaces you belong to, according to their permissions.</li>
        <li><strong>Recipients you choose</strong> — e.g. when you send a quote, invoice, catalog or shared link to a customer.</li>
        <li><strong>Legal and safety</strong> — where required by law, regulation, legal process, or to protect rights, property or safety.</li>
        <li><strong>Business transfers</strong> — in connection with a merger, acquisition or sale of assets, subject to this Policy.</li>
      </ul>

      <h2>7. International transfers</h2>
      <p>
        Your data may be processed in countries other than your own. Where data is transferred
        outside the EU/EEA, we use appropriate safeguards such as Standard Contractual Clauses or an
        equivalent lawful transfer mechanism.
      </p>

      <h2>8. Data retention</h2>
      <p>
        We keep personal data for as long as your account is active and as needed to provide the
        Services, then for any additional period required to meet legal, tax, accounting or dispute-
        resolution obligations. When data is no longer needed, we delete or anonymise it.
      </p>
      <p>
        To keep the Platform secure and efficient, we automatically remove generated and temporary
        files once they are no longer needed. In particular:
      </p>
      <ul>
        <li>
          <strong>Regenerable documents</strong> — quote, catalog, presentation-sheet and
          client-view PDFs and similar exports may be deleted from storage after a short period of
          inactivity (typically around one week), or when you delete, close or mark the related item
          as completed. These documents are recreated automatically the next time you open or send
          them, so no information is lost.
        </li>
        <li>
          <strong>AI-generated media</strong> — images, edits and videos created in the assistant or
          other generation tools that you do not save are removed after a period of inactivity
          (typically around 30 days), or when you delete the related conversation or item. Media you
          save (for example, to a moodboard or project) is retained with that item.
        </li>
        <li>
          <strong>Temporary and intermediate files</strong> — uploads, previews and processing
          artifacts that are no longer referenced are cleared automatically on a routine schedule.
        </li>
        <li>
          <strong>Legal and financial records</strong> — invoices, credit notes, delivery notes and
          other tax or accounting documents are retained for the period required by applicable law,
          even after related items are removed elsewhere.
        </li>
      </ul>
      <p>
        You remain responsible for downloading or otherwise saving any content you wish to keep
        outside the Platform. When you delete your account, we delete or anonymise your data except
        for records we are required to retain by law.
      </p>

      <h2>9. Your rights</h2>
      <p>Depending on your location, you may have the right to:</p>
      <ul>
        <li>Access the personal data we hold about you.</li>
        <li>Correct inaccurate or incomplete data.</li>
        <li>Delete your data ("right to be forgotten").</li>
        <li>Restrict or object to certain processing.</li>
        <li>Receive your data in a portable format.</li>
        <li>Withdraw consent where processing is based on consent.</li>
        <li>Lodge a complaint with your local data protection authority.</li>
      </ul>
      <p>
        To exercise any of these rights, email{' '}
        <a href="mailto:support@materialshub.gr">support@materialshub.gr</a>. You can also delete
        your account from within the Platform.
      </p>

      <h2>10. Security</h2>
      <p>
        We use technical and organisational measures — including encryption in transit, access
        controls, tenant isolation and least-privilege practices — to protect your data. No method of
        transmission or storage is completely secure, so we cannot guarantee absolute security.
      </p>

      <h2>11. Cookies</h2>
      <p>
        We use strictly necessary cookies to run the Platform (e.g. to keep you signed in) and, where
        permitted, cookies to remember preferences and measure performance. You can control cookies
        through your browser settings; disabling some cookies may affect functionality.
      </p>

      <h2>12. Children</h2>
      <p>
        The Services are intended for business users and are not directed to children under 16. We do
        not knowingly collect data from children. If you believe a child has provided us data, contact
        us and we will delete it.
      </p>

      <h2>13. Changes to this Policy</h2>
      <p>
        We may update this Policy from time to time. Material changes will be notified through the
        Platform or by email. The "Last updated" date above reflects the latest version.
      </p>

      <h2>14. Contact</h2>
      <p>
        Questions about this Policy or your data? Email{' '}
        <a href="mailto:support@materialshub.gr">support@materialshub.gr</a>.
      </p>
    </LegalShell>
  );
}
