import type { Metadata } from "next";
import Link from "next/link";
import { Film } from "lucide-react";

export const metadata: Metadata = {
  title: "Terms of Service — MovieAnimation.ai",
  description: "Terms of Service for the MovieAnimation.ai AI-powered movie creation platform.",
};

export default function TermsOfService() {
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
        <h1 className="text-4xl font-bold text-white mb-2">Terms of Service</h1>
        <p className="text-zinc-500 mb-10">Last updated: June 7, 2026</p>

        <div className="prose prose-invert prose-zinc max-w-none space-y-8">
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">1. Acceptance of Terms</h2>
            <p className="text-zinc-300 leading-relaxed">
              By accessing or using MovieAnimation.ai (&ldquo;the Service&rdquo;), operated by SimRobotics Corp
              (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;), you agree to be bound by these Terms of Service.
              If you do not agree to these terms, you may not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">2. Description of Service</h2>
            <p className="text-zinc-300 leading-relaxed">
              MovieAnimation.ai is an AI-powered video generation platform that allows users to upload scripts,
              images, and other media to generate animated videos and movies. The Service uses artificial
              intelligence models from multiple providers to generate video content.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">3. User Accounts</h2>
            <p className="text-zinc-300 leading-relaxed">
              You must create an account to use the Service. You are responsible for maintaining the
              confidentiality of your account credentials and for all activities that occur under your
              account. You must provide accurate, complete, and current information during registration
              and keep your account information updated.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">4. User Content</h2>
            <p className="text-zinc-300 leading-relaxed">
              You retain ownership of all content you upload to the Service (&ldquo;User Content&rdquo;),
              including scripts, images, and generated videos. By uploading User Content, you grant us a
              non-exclusive, worldwide, royalty-free license to use, store, and process your content solely
              for the purpose of providing and improving the Service.
            </p>
            <p className="text-zinc-300 leading-relaxed mt-3">
              You represent and warrant that you own or have the necessary rights to all User Content
              you upload, and that your content does not violate any third-party rights or applicable laws.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">5. Acceptable Use</h2>
            <p className="text-zinc-300 leading-relaxed">You agree not to:</p>
            <ul className="list-disc pl-6 text-zinc-300 leading-relaxed mt-2 space-y-2">
              <li>Use the Service to generate illegal, harmful, harassing, or explicit content</li>
              <li>Infringe upon the intellectual property rights of others</li>
              <li>Attempt to bypass usage limits, rate limits, or security measures</li>
              <li>Use the Service to create deepfakes of real persons without their explicit consent</li>
              <li>Resell, sublicense, or redistribute the Service without authorization</li>
              <li>Upload malicious code or attempt to compromise the Service&apos;s infrastructure</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">6. AI-Generated Content</h2>
            <p className="text-zinc-300 leading-relaxed">
              Videos and images generated by the Service are produced by third-party AI models.
              We do not guarantee the accuracy, quality, or appropriateness of AI-generated content.
              Generated content may not perfectly represent uploaded images or descriptions, and users
              should review all output before distribution.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">7. API Usage & Credits</h2>
            <p className="text-zinc-300 leading-relaxed">
              Video generation consumes third-party API credits which are subject to availability and
              cost. We reserve the right to implement usage limits, credit systems, and pricing tiers.
              Current pricing and credit limits are displayed on the Service dashboard. We may modify
              pricing with reasonable notice.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">8. Intellectual Property</h2>
            <p className="text-zinc-300 leading-relaxed">
              The MovieAnimation.ai platform, including its code, design, branding, and user interface,
              is the exclusive property of SimRobotics Corp. You may not copy, modify, distribute, or
              create derivative works of the platform without our express written permission.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">9. Limitation of Liability</h2>
            <p className="text-zinc-300 leading-relaxed">
              THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; WITHOUT WARRANTY OF ANY KIND. TO THE MAXIMUM
              EXTENT PERMITTED BY LAW, SIMROBOTICS CORP SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL,
              SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM YOUR USE OF THE SERVICE, INCLUDING
              BUT NOT LIMITED TO LOSS OF DATA, LOSS OF BUSINESS, OR INTERRUPTION OF SERVICE.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">10. Termination</h2>
            <p className="text-zinc-300 leading-relaxed">
              We reserve the right to suspend or terminate your account at any time for violation of these
              Terms. You may terminate your account at any time through your account settings. Upon
              termination, your right to use the Service will cease immediately, and we may delete your
              User Content after a reasonable retention period.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">11. Changes to Terms</h2>
            <p className="text-zinc-300 leading-relaxed">
              We may modify these Terms at any time. We will notify users of material changes via email
              or through the Service. Continued use of the Service after changes become effective
              constitutes acceptance of the modified Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">12. Contact</h2>
            <p className="text-zinc-300 leading-relaxed">
              For questions about these Terms, contact us at:
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
            <Link href="/privacy" className="hover:text-zinc-300 transition-colors">Privacy Policy</Link>
            <span className="text-zinc-600">SimRobotics Corp &copy; {new Date().getFullYear()}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
