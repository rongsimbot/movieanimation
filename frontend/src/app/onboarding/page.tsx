'use client';

import { useState } from 'react';
import { Rocket, CheckCircle, ArrowRight, ClipboardList, Users, Zap, Star, Shield } from 'lucide-react';

const features = [
  {
    icon: <Zap className="w-5 h-5 text-amber-400" />,
    title: 'AI Video Generation',
    desc: 'Generate animated scenes from your script using Sora, Runway, Seedance, and Luma APIs.',
  },
  {
    icon: <ClipboardList className="w-5 h-5 text-blue-400" />,
    title: 'Script Parsing',
    desc: 'AI-powered script breakdown into scenes, characters, and dialogue automatically.',
  },
  {
    icon: <Star className="w-5 h-5 text-purple-400" />,
    title: 'Timeline Editor',
    desc: 'Drag-and-drop scene arrangement with professional transitions and timing controls.',
  },
  {
    icon: <Shield className="w-5 h-5 text-green-400" />,
    title: 'Export Pipeline',
    desc: 'Final render in 720p/1080p/4K with MP4, MOV, and WebM format support.',
  },
];

const expectations = [
  'You will have full access to all MovieAnimation.ai features during the beta period.',
  'You may encounter bugs or rough edges — this is expected! Please report them.',
  'Your feedback directly shapes the product roadmap and feature priorities.',
  'Beta testers get 3 months of Pro tier free when we launch publicly.',
  'You can cancel or leave the beta at any time — no obligations.',
  'We will send occasional email updates about new features and fixes.',
];

const steps = [
  { num: '1', title: 'Watch the Quick Start Video', desc: '3-minute overview of creating your first movie' },
  { num: '2', title: 'Create Your First Project', desc: 'Upload a script or start from a template' },
  { num: '3', title: 'Generate Your First Scene', desc: 'Use AI to create an animated video clip' },
  { num: '4', title: 'Share Your Feedback', desc: 'Tell us what worked, what didn\'t, and what you want next' },
];

export default function BetaOnboardingPage() {
  const [accepted, setAccepted] = useState(false);
  const [step, setStep] = useState<'intro' | 'welcome' | 'complete'>('intro');
  const [feedback, setFeedback] = useState('');

  const handleOnboard = () => {
    // Track onboarding completion
    fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/analytics/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType: 'beta_onboarding_complete',
        metadata: { source: 'onboarding_page', feedback },
      }),
    }).catch(() => {}); // Fire and forget
    setStep('complete');
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-4xl mx-auto px-6 py-12">
        
        {/* Hero */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-purple-500 to-blue-500 rounded-2xl mb-6 shadow-lg shadow-purple-500/20">
            <Rocket className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-5xl font-bold text-white mb-4">
            Welcome to the Beta
          </h1>
          <p className="text-xl text-zinc-400 max-w-2xl mx-auto">
            You are one of the first creators to access MovieAnimation.ai. 
            Your feedback will help shape the future of AI-powered filmmaking.
          </p>
        </div>

        {/* Progress Indicator */}
        <div className="flex items-center justify-center gap-4 mb-12">
          {['intro', 'welcome', 'complete'].map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                step === s || (step === 'complete' && i < 2) || (step === 'welcome' && i < 1)
                  ? 'bg-purple-600 text-white'
                  : 'bg-zinc-800 text-zinc-500'
              }`}>
                {step === 'complete' || (step !== s && (
                  (step === 'complete' && i < 2) || (step === 'welcome' && i < 1)
                )) ? <CheckCircle className="w-4 h-4" /> : i + 1}
              </div>
              {i < 2 && <div className="w-12 h-0.5 bg-zinc-800" />}
            </div>
          ))}
        </div>

        {/* Step 1: Intro */}
        {step === 'intro' && (
          <div className="space-y-8">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8">
              <div className="flex items-center gap-3 mb-6">
                <Users className="w-6 h-6 text-purple-400" />
                <h2 className="text-2xl font-bold text-white">What to Expect</h2>
              </div>
              <ul className="space-y-3">
                {expectations.map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-zinc-300">
                    <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8">
              <div className="flex items-center gap-3 mb-6">
                <Zap className="w-6 h-6 text-amber-400" />
                <h2 className="text-2xl font-bold text-white">Features at Your Fingertips</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {features.map((f, i) => (
                  <div key={i} className="bg-zinc-800/50 rounded-xl p-4 flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">{f.icon}</div>
                    <div>
                      <h3 className="font-semibold text-white mb-1">{f.title}</h3>
                      <p className="text-sm text-zinc-400">{f.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-center">
              <button
                onClick={() => setStep('welcome')}
                className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-8 py-4 rounded-xl font-bold text-lg transition-all hover:scale-105"
              >
                Get Started
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Welcome / Setup */}
        {(step === 'welcome' || step === 'complete') && (
          <div className="space-y-8">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8">
              <h2 className="text-2xl font-bold text-white mb-6">Your First 4 Steps</h2>
              <div className="space-y-4">
                {steps.map((s, i) => (
                  <div key={i} className="flex items-center gap-4 bg-zinc-800/50 rounded-xl p-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                      step === 'complete' ? 'bg-green-600 text-white' : 'bg-purple-600 text-white'
                    }`}>
                      {step === 'complete' ? <CheckCircle className="w-5 h-5" /> : s.num}
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">{s.title}</h3>
                      <p className="text-sm text-zinc-400">{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {step === 'welcome' && (
              <>
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8">
                  <label className="block text-lg font-semibold text-white mb-3">
                    What kind of movies are you planning to create?
                  </label>
                  <textarea
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="Tell us about your goals — short films, marketing videos, educational content, social media clips..."
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl p-4 text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 min-h-[100px] resize-y"
                  />
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={accepted}
                      onChange={(e) => setAccepted(e.target.checked)}
                      className="mt-1 w-5 h-5 accent-purple-600 rounded"
                    />
                    <span className="text-sm text-zinc-400">
                      I understand this is a beta product and may have bugs. I agree to provide 
                      constructive feedback and will not share confidential information through the platform.
                    </span>
                  </label>
                </div>

                <div className="flex justify-center gap-4">
                  <button
                    onClick={() => setStep('intro')}
                    className="px-6 py-3 rounded-xl text-zinc-400 hover:text-white transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleOnboard}
                    disabled={!accepted}
                    className={`flex items-center gap-2 px-8 py-4 rounded-xl font-bold text-lg transition-all ${
                      accepted
                        ? 'bg-purple-600 hover:bg-purple-700 text-white hover:scale-105'
                        : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                    }`}
                  >
                    <Rocket className="w-5 h-5" />
                    Start Creating
                  </button>
                </div>
              </>
            )}

            {/* Step 3: Complete */}
            {step === 'complete' && (
              <div className="bg-gradient-to-r from-purple-600/20 to-blue-600/20 border border-purple-500/30 rounded-2xl p-8 text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-green-600 rounded-full mb-4">
                  <CheckCircle className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-3xl font-bold text-white mb-3">You are All Set!</h2>
                <p className="text-zinc-300 text-lg mb-6 max-w-lg mx-auto">
                  Your beta account is active. Head to your dashboard to start creating your first movie.
                </p>
                <div className="flex justify-center gap-4">
                  <a
                    href="/dashboard"
                    className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-8 py-4 rounded-xl font-bold text-lg transition-all"
                  >
                    Go to Dashboard
                    <ArrowRight className="w-5 h-5" />
                  </a>
                  <a
                    href="/help"
                    className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white px-8 py-4 rounded-xl font-bold text-lg transition-all"
                  >
                    View Help Center
                  </a>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-16 text-sm text-zinc-600">
          MovieAnimation.ai Beta • Version 1.7.0 • Questions? <a href="mailto:support@movieanimation.ai" className="text-purple-400 hover:text-purple-300">Contact Support</a>
        </div>
      </div>
    </div>
  );
}
