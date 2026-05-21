'use client';

import { useState } from 'react';
import { HelpCircle, BookOpen, Video, Mail, ChevronDown, ChevronRight, ArrowRight, Film, Upload, Users, Download, Wand2 } from 'lucide-react';

interface FAQItem {
  q: string;
  a: string;
}

const faqs: FAQItem[] = [
  {
    q: 'What is MovieAnimation.ai?',
    a: 'MovieAnimation.ai is an AI-powered platform that lets you create complete animated movies from scripts. You upload a script, add character images, and our AI video generation pipeline creates professional animated scenes that you can assemble into a full movie.'
  },
  {
    q: 'How do I create my first movie?',
    a: "Start by creating a project, then upload or write your script. The AI will parse it into scenes. Upload character photos, assign them to characters in your script, then generate each scene using our AI video engines. Finally, use the timeline editor to arrange scenes, add transitions, and export your completed movie."
  },
  {
    q: 'What video generation APIs do you support?',
    a: 'We integrate with multiple APIs: OpenAI Sora 2 (hero/cinematic content), Runway Gen-4.5 (professional polish), Seedance 2.0 (volume/social clips), and Luma Dream Machine. Our smart router automatically selects the best API for each scene based on quality needs and budget.'
  },
  {
    q: 'How much does it cost?',
    a: "Video generation costs vary by API and quality level. You can monitor your spending in real-time on the Cost Dashboard. We offer a Free tier (limited generations), Pro ($29/mo), and Studio ($99/mo) plans. Each plan comes with monthly generation credits."
  },
  {
    q: 'What file formats are supported?',
    a: 'You can upload scripts in PDF, DOCX, or plain text format. Character photos should be clear portrait images (JPG, PNG). Exported movies are available in MP4 (standard), MOV (professional), and WebM (web-optimized) formats at 720p, 1080p, or 4K resolution.'
  },
  {
    q: 'How long does video generation take?',
    a: 'Generation time varies by scene complexity, chosen API, and queue priority. Typical generation takes 1-3 minutes per scene. Pro and Studio tier users get priority in the generation queue. You can track progress in real-time from your project dashboard.'
  },
  {
    q: 'Can I edit generated scenes?',
    a: 'Yes! After scenes are generated, you can review each one, reorder them in the timeline editor, add transitions (cut, fade, dissolve), and adjust timing. You can also regenerate individual scenes with modified prompts if needed.'
  },
  {
    q: 'What kind of scripts work best?',
    a: 'MovieAnimation.ai works best with narrative scripts that have clear scene descriptions, character dialogue, and setting details. The AI parser understands standard screenplay format as well as natural language descriptions. For best results, describe visual elements like character actions, emotions, and environments.'
  }
];

const sections = [
  {
    icon: <BookOpen className="w-5 h-5" />,
    title: 'Getting Started',
    steps: [
      'Create an account and log in',
      'Create a new project with a title and description',
      'Upload your script file (PDF, DOCX, or text)',
      'Click "Parse Script" to let AI break it into scenes',
      'Upload character photos and assign them to roles',
      'Generate video scenes using AI engines',
      'Use the Timeline Editor to arrange and add transitions',
      'Export your final movie'
    ]
  },
  {
    icon: <Film className="w-5 h-5" />,
    title: 'Script Writing Tips',
    steps: [
      'Use clear scene headings (e.g., "INT. LIVING ROOM - DAY")',
      'Describe character actions and emotions vividly',
      'Keep scene descriptions under 200 words for best AI results',
      'Specify camera angles if desired (close-up, wide shot, etc.)',
      'Include setting details: lighting, mood, time of day',
      'AI understands screenplay format automatically'
    ]
  },
  {
    icon: <Upload className="w-5 h-5" />,
    title: 'Uploading Assets',
    steps: [
      'Upload clear, well-lit photos of characters (front-facing works best)',
      'Supported formats: JPG, PNG (up to 10MB each)',
      'You can upload multiple files at once',
      'Organize assets by type: character photos, props, backgrounds',
      'Assign photos to characters from the Character Mapping page',
      'Use the Base64 upload option for quick paste-from-clipboard'
    ]
  },
  {
    icon: <Download className="w-5 h-5" />,
    title: 'Exporting Movies',
    steps: [
      'Arrange all scenes in the Timeline Editor',
      'Add transitions between scenes (Fade, Dissolve, or Cut)',
      'Click "Assemble Movie" to stitch scenes together',
      'Choose export format: MP4 (recommended), MOV, or WebM',
      'Select resolution: 720p, 1080p, or 4K',
      'Download the final movie or share via link'
    ]
  }
];

export default function HelpCenterPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [openSection, setOpenSection] = useState<number | null>(0);

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-purple-500/10 rounded-2xl mb-4">
            <HelpCircle className="w-8 h-8 text-purple-400" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-3">Help Center</h1>
          <p className="text-zinc-400 text-lg max-w-xl mx-auto">
            Everything you need to know about creating movies with MovieAnimation.ai
          </p>
        </div>

        {/* Quick Start Guide */}
        <div className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20 rounded-2xl p-8 mb-12">
          <div className="flex items-center gap-3 mb-4">
            <Wand2 className="w-6 h-6 text-purple-400" />
            <h2 className="text-xl font-bold text-white">Quick Start Guide</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              { step: '1', title: 'Upload Script', desc: 'Upload your movie script or write it directly' },
              { step: '2', title: 'Add Characters', desc: 'Upload photos and assign to script roles' },
              { step: '3', title: 'Generate Scenes', desc: 'AI creates animated video clips' },
              { step: '4', title: 'Export Movie', desc: 'Assemble, add transitions, and download' },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="w-10 h-10 bg-purple-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                  <span className="text-purple-400 font-bold">{item.step}</span>
                </div>
                <h3 className="font-semibold text-white mb-1">{item.title}</h3>
                <p className="text-xs text-zinc-500">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Detailed Guides */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-blue-400" /> How-To Guides
          </h2>
          <div className="space-y-3">
            {sections.map((section, i) => (
              <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <button
                  onClick={() => setOpenSection(openSection === i ? null : i)}
                  className="w-full flex items-center justify-between p-4 hover:bg-zinc-800/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-blue-400">{section.icon}</span>
                    <span className="font-semibold text-white">{section.title}</span>
                  </div>
                  {openSection === i ? (
                    <ChevronDown className="w-5 h-5 text-zinc-500" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-zinc-500" />
                  )}
                </button>
                {openSection === i && (
                  <div className="px-4 pb-4 pt-1">
                    <ol className="space-y-2">
                      {section.steps.map((step, j) => (
                        <li key={j} className="flex items-start gap-3 text-sm text-zinc-300">
                          <span className="text-blue-400 font-mono text-xs mt-0.5">{j + 1}.</span>
                          {step}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Video Tutorials Section */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 mb-12">
          <div className="flex items-center gap-3 mb-4">
            <Video className="w-6 h-6 text-red-400" />
            <h2 className="text-xl font-bold text-white">Video Tutorials</h2>
          </div>
          <p className="text-zinc-400 mb-4">
            Watch step-by-step video guides on how to create your first movie with MovieAnimation.ai.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { title: 'Creating Your First Project', duration: '3:45' },
              { title: 'Writing and Parsing Scripts', duration: '5:20' },
              { title: 'Uploading Character Photos', duration: '2:50' },
              { title: 'Generating AI Video Scenes', duration: '4:15' },
              { title: 'Using the Timeline Editor', duration: '6:30' },
              { title: 'Exporting Your Movie', duration: '3:10' },
            ].map((video, i) => (
              <div key={i} className="bg-zinc-800/50 rounded-lg p-4 flex items-center justify-between hover:bg-zinc-800 transition-colors cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-red-500/10 rounded-lg flex items-center justify-center">
                    <Video className="w-5 h-5 text-red-400" />
                  </div>
                  <div>
                    <p className="text-sm text-white font-medium">{video.title}</p>
                    <p className="text-xs text-zinc-500">{video.duration}</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-zinc-600" />
              </div>
            ))}
          </div>
        </div>

        {/* FAQ */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-6">Frequently Asked Questions</h2>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between p-4 hover:bg-zinc-800/50 transition-colors text-left"
                >
                  <span className="text-white font-medium pr-4">{faq.q}</span>
                  {openFaq === i ? (
                    <ChevronDown className="w-5 h-5 text-zinc-500 flex-shrink-0" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-zinc-500 flex-shrink-0" />
                  )}
                </button>
                {openFaq === i && (
                  <div className="px-4 pb-4">
                    <p className="text-sm text-zinc-300 leading-relaxed">{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Contact */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Mail className="w-6 h-6 text-green-400" />
            <h2 className="text-xl font-bold text-white">Still need help?</h2>
          </div>
          <p className="text-zinc-400 mb-4 max-w-md mx-auto">
            Our support team is here to help you create amazing movies. Reach out and we will get back to you within 24 hours.
          </p>
          <a
            href="mailto:support@movieanimation.ai"
            className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
          >
            <Mail className="w-4 h-4" />
            Contact Support
          </a>
        </div>

        <div className="text-center mt-12 text-sm text-zinc-600">
          MovieAnimation.ai v1.3.0 — Beta Release • Documentation last updated: May 2026
        </div>
      </div>
    </div>
  );
}
