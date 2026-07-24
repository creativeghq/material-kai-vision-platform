/**
 * Terms of Service — public page at /terms.
 * Registered outside <AuthGuard> in App.tsx.
 */

import { LegalShell } from './LegalShell';

const LAST_UPDATED = '24 July 2026';

export default function TermsOfServicePage() {
  return (
    <LegalShell title="Terms of Service" lastUpdated={LAST_UPDATED}>
      <p>
        These Terms of Service ("Terms") govern your access to and use of the{' '}
        <strong>MaterialsHub</strong> platform, websites, applications and services (together, the
        "Services"). By creating an account or using the Services, you agree to these Terms. If you
        are using the Services on behalf of an organisation, you represent that you are authorised to
        bind that organisation.
      </p>

      <h2>1. The Services</h2>
      <p>
        MaterialsHub provides a materials sourcing, catalog, quoting, project and business-management
        platform for design and construction professionals, including AI-assisted features. We may
        add, change or remove features at any time to improve the Services.
      </p>

      <h2>2. Accounts</h2>
      <ul>
        <li>You must provide accurate, current information and keep it up to date.</li>
        <li>You are responsible for safeguarding your login credentials and for all activity under your account.</li>
        <li>You must notify us promptly of any unauthorised use or security breach.</li>
        <li>You must be at least 16 years old and legally able to enter into a contract.</li>
      </ul>

      <h2>3. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use the Services for any unlawful, harmful, infringing or fraudulent purpose.</li>
        <li>Upload content you do not have the right to use, or that infringes third-party rights.</li>
        <li>Attempt to gain unauthorised access to the Services, other accounts or our systems.</li>
        <li>Interfere with, disrupt or overload the Services or circumvent usage limits.</li>
        <li>Reverse engineer, scrape or copy the Services except as permitted by law.</li>
        <li>Resell or provide the Services to third parties except as expressly permitted.</li>
      </ul>

      <h2>4. Your content</h2>
      <p>
        You retain all rights to the content you submit ("Your Content"), including products,
        catalogs, quotes, documents, images and customer data. You grant us a limited licence to
        host, process, transmit and display Your Content solely to operate and provide the Services
        to you. You are responsible for the accuracy and legality of Your Content and for having the
        necessary rights and consents, including for any personal data of your contacts and customers.
      </p>
      <p>
        To keep the Platform secure and efficient, we automatically remove generated and temporary
        files once they are no longer needed — for example, when you delete, close or mark the
        related item as completed, or after a period of inactivity. Documents that can be regenerated
        (such as quote, catalog, presentation-sheet and client-view PDFs) may be deleted from storage
        and are recreated automatically when next needed. AI-generated images and videos that you do
        not save may be removed after a period of inactivity. Records we are required to keep by law,
        such as invoices and tax documents, are retained accordingly. You are responsible for
        downloading or saving any content you wish to retain outside the Platform. Full details are
        set out in our <a href="/privacy">Privacy Policy</a>.
      </p>

      <h2>5. AI features</h2>
      <p>
        Certain features generate output using artificial intelligence. AI output may be inaccurate,
        incomplete or unsuitable for a particular purpose. You are responsible for reviewing and
        verifying AI-generated results — including prices, specifications, quotes and documents —
        before relying on or acting upon them. The Services are a tool and do not constitute
        professional, legal, financial or engineering advice.
      </p>

      <h2>6. Credits, plans and payment</h2>
      <ul>
        <li>Some features are paid or consume credits. Applicable prices and credit costs are shown in the Platform.</li>
        <li>Fees are billed through our payment provider. You authorise us to charge the payment method on file.</li>
        <li>Unless stated otherwise, fees are non-refundable and credits are non-transferable.</li>
        <li>Taxes may apply and are your responsibility unless we are legally required to collect them.</li>
        <li>We may change pricing prospectively with reasonable notice.</li>
      </ul>

      <h2>7. Third-party services</h2>
      <p>
        The Services may integrate with third-party providers (e.g. payment, email, AI, e-invoicing,
        social and data providers). Your use of those integrations may be subject to their own terms,
        and we are not responsible for third-party services.
      </p>

      <h2>8. Intellectual property</h2>
      <p>
        The Services, including all software, design, text, graphics and trademarks, are owned by
        MaterialsHub or its licensors and are protected by intellectual-property laws. Except for the
        limited right to use the Services under these Terms, no rights are granted to you.
      </p>

      <h2>9. Suspension and termination</h2>
      <p>
        You may stop using the Services and delete your account at any time. We may suspend or
        terminate your access if you breach these Terms, if required by law, or to protect the
        Services or other users. On termination, your right to use the Services ends; certain
        provisions (such as payment, liability and dispute terms) survive.
      </p>

      <h2>10. Disclaimers</h2>
      <p>
        The Services are provided "as is" and "as available" without warranties of any kind, whether
        express or implied, including fitness for a particular purpose, non-infringement and
        uninterrupted or error-free operation, to the maximum extent permitted by law.
      </p>

      <h2>11. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, MaterialsHub will not be liable for any indirect,
        incidental, special, consequential or punitive damages, or for loss of profits, revenue,
        data or goodwill. Our total aggregate liability arising from or relating to the Services will
        not exceed the amounts you paid to us in the twelve (12) months preceding the event giving
        rise to the claim. Nothing in these Terms excludes liability that cannot be excluded by law.
      </p>

      <h2>12. Indemnity</h2>
      <p>
        You agree to indemnify and hold MaterialsHub harmless from claims, damages and expenses
        arising out of Your Content, your use of the Services, or your breach of these Terms or of
        applicable law.
      </p>

      <h2>13. Changes to these Terms</h2>
      <p>
        We may update these Terms from time to time. Material changes will be notified through the
        Platform or by email. Your continued use of the Services after changes take effect
        constitutes acceptance of the updated Terms.
      </p>

      <h2>14. Governing law</h2>
      <p>
        These Terms are governed by the laws of Greece, without regard to conflict-of-law rules, and
        the competent courts of Greece will have exclusive jurisdiction, unless mandatory local law
        provides otherwise. Nothing in this section limits any statutory consumer rights that apply
        to you.
      </p>

      <h2>15. Contact</h2>
      <p>
        Questions about these Terms? Email{' '}
        <a href="mailto:support@materialshub.gr">support@materialshub.gr</a>.
      </p>
    </LegalShell>
  );
}
