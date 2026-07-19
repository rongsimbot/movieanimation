import type { Metadata } from "next";
import Link from "next/link";
import { Film } from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy Policy — MovieAnimation.ai",
  description: "Privacy Policy for MovieAnimation.ai — how we collect, use, and protect your data.",
};

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Navbar */}
      <nav className="border-b border-zinc-800/50">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
              <Film className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-bold text-white tracking-tight">
              MovieAnimation<span className="text-purple-400">.ai</span>
            </span>
          </Link>
          <Link
            href="/"
            className="text-sm text-zinc-400 hover:text-white transition-colors"
          >
            ← Back to Studio
          </Link>
        </div>
      </nav>

      {/* Content */}
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-4xl font-bold text-white mb-2">Privacy Policy</h1>
        <p className="text-zinc-500 mb-10">Last updated: June 7, 2026</p>

        <div className="prose prose-invert prose-zinc max-w-none space-y-8">
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">1. Introduction</h2>
            <p className="text-zinc-300 leading-relaxed">
              SimRobotics Corp (&ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;) is committed to
              protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and
              safeguard your personal information when you use MovieAnimation.ai (&ldquo;the Service&rdquo;).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">2. Information We Collect</h2>

            <h3 className="text-lg font-medium text-white mt-4 mb-2">2.1 Account Information</h3>
            <p className="text-zinc-300 leading-relaxed">
              When you register for an account, we collect your name, email address, and an encrypted
              password hash. We never store your password in plain text.
            </p>

            <h3 className="text-lg font-medium text-white mt-4 mb-2">2.2 User Content</h3>
            <p className="text-zinc-300 leading-relaxed">
              We collect and store scripts, images, and other media you upload to the Service, as well
              as the AI-generated videos and assets produced from your content.
            </p>

            <h3 className="text-lg font-medium text-white mt-4 mb-2">2.3 Usage Data</h3>
            <p className="text-zinc-300 leading-relaxed">
              We automatically collect information about how you use the Service, including:
            </p>
            <ul className="list-disc pl-6 text-zinc-300 leading-relaxed mt-2 space-y-1">
              <li>Pages and features accessed</li>
              <li>API calls and generation requests</li>
              <li>Video generation parameters and results</li>
              <li>Performance and error data</li>
              <li>Browser type, device information, and IP address</li>
            </ul>

            <h3 className="text-lg font-medium text-white mt-4 mb-2">2.4 Cookies</h3>
            <p className="text-zinc-300 leading-relaxed">
              We use essential cookies for authentication (JWT tokens stored in your browser) and
              session management. We do not use tracking cookies for advertising purposes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">3. How We Use Your Information</h2>
            <p className="text-zinc-300 leading-relaxed">We use your information to:</p>
            <ul className="list-disc pl-6 text-zinc-300 leading-relaxed mt-2 space-y-2">
              <li>Provide, maintain, and improve the Service</li>
              <li>Process your video generation requests</li>
              <li>Authenticate your account and prevent unauthorized access</li>
              <li>Track API usage and calculate costs for billing purposes</li>
              <li>Send service-related communications (account notifications, updates)</li>
              <li>Monitor and analyze usage patterns to improve performance</li>
              <li>Detect and prevent fraud, abuse, and security incidents</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">4. Third-Party Services</h2>
            <p className="text-zinc-300 leading-relaxed">
              To generate videos, we transmit your script prompts (but not your uploaded images for
              storage) to third-party AI providers including:
            </p>
            <ul className="list-disc pl-6 text-zinc-300 leading-relaxed mt-2 space-y-1">
              <li>OpenAI (Sora 2 API) — Prompt text for video generation</li>
              <li>Runway (Gen-4.5 API) — Prompt text for video generation</li>
              <li>Seedance (2.0 API) — Prompt text and reference images for video generation</li>
              <li>Anthropic (Claude API) — Script text for scene parsing</li>
              <li>ElevenLabs — Text for voice synthesis</li>
            </ul>
            <p className="text-zinc-300 leading-relaxed mt-3">
              Each third-party provider has its own privacy policy governing how they handle data
              transmitted for processing. We do not share your account information or stored User
              Content with these providers beyond what is necessary for generation.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">5. Data Storage & Security</h2>
            <p className="text-zinc-300 leading-relaxed">
              Your data is stored on secure, access-controlled servers. We implement industry-standard
              security measures including:
            </p>
            <ul className="list-disc pl-6 text-zinc-300 leading-relaxed mt-2 space-y-2">
              <li><strong>Encryption:</strong> Passwords are hashed using bcrypt (12 rounds). API communications use HTTPS/TLS.</li>
              <li><strong>Access Control:</strong> Personal data is accessible only to you through authenticated endpoints.</li>
              <li><strong>Infrastructure:</strong> Backend services and databases run on private infrastructure behind VPN tunnels.</li>
              <li><strong>JWT Authentication:</strong> All API requests require valid, time-limited JSON Web Tokens.</li>
            </ul>
            <p className="text-zinc-300 leading-relaxed mt-3">
              While we strive to protect your data, no method of electronic storage or transmission is
              100% secure. We cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">6. Data Retention</h2>
            <p className="text-zinc-300 leading-relaxed">
              We retain your account information and User Content for as long as your account is active.
              Upon account deletion, your personal data is permanently removed within 30 days. Generated
              video files may be retained for up to 90 days for technical and legal purposes. Usage
              analytics data is anonymized after 12 months.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">7. Your Rights</h2>
            <p className="text-zinc-300 leading-relaxed">You have the right to:</p>
            <ul className="list-disc pl-6 text-zinc-300 leading-relaxed mt-2 space-y-2">
              <li><strong>Access:</strong> View your personal data through your account dashboard</li>
              <li><strong>Update:</strong> Modify your profile information at any time</li>
              <li><strong>Delete:</strong> Delete your account and all associated data</li>
              <li><strong>Export:</strong> Download your content (scripts, generated videos, assets)</li>
              <li><strong>Opt Out:</strong> Stop using the Service and request data deletion</li>
            </ul>
            <p className="text-zinc-300 leading-relaxed mt-3">
              To exercise any of these rights, use the self-service features in your account dashboard
              or contact us directly.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">8. Children&apos;s Privacy</h2>
            <p className="text-zinc-300 leading-relaxed">
              The Service is not intended for users under the age of 13. We do not knowingly collect
              personal information from children under 13. If we learn that we have collected such
              information, we will delete it immediately.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">9. International Data Transfers</h2>
            <p className="text-zinc-300 leading-relaxed">
              Your data is stored and processed in the United States. Third-party AI providers may
              process data in other jurisdictions. By using the Service, you consent to the transfer
              of your data to these locations.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">10. Changes to This Policy</h2>
            <p className="text-zinc-300 leading-relaxed">
              We may update this Privacy Policy periodically. Material changes will be communicated
              via email or through a notice on the Service. The &ldquo;Last updated&rdquo; date at the
              top of this page reflects the most recent revision.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">11. Contact Us</h2>
            <p className="text-zinc-300 leading-relaxed">
              If you have questions about this Privacy Policy or our data practices, contact us at:
            </p>
            <p className="text-zinc-400 mt-2">
              SimRobotics Corp<br />
              San Antonio, TX<br />
              Email: rong@simrobotics.com
            </p>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800/50 px-6 py-8">
        <div className="mx-auto max-w-3xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-zinc-500 text-sm">
            <Film className="w-4 h-4" />
            <span>MovieAnimation.ai</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-zinc-500">
            <Link href="/tos" className="hover:text-zinc-300 transition-colors">Terms of Service</Link>
            <span className="text-zinc-600">SimRobotics Corp &copy; {new Date().getFullYear()}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
