/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, Link } from 'react-router-dom';
import VideoPlayer from './pages/VideoPlayer';
import WorkspaceEditor from './pages/WorkspaceEditor';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Play, 
  Plus, 
  ChevronRight, 
  ChevronDown, 
  Users, 
  Clapperboard, 
  Mic2, 
  Cpu, 
  Upload, 
  FileText, 
  BookOpen, 
  CheckCircle2,
  X,
  Menu,
  Facebook,
  Instagram,
  Twitter,
  Youtube
} from 'lucide-react';
import { convertToEditableScript, extractCharacters, breakIntoChapters, generateCharacterScript } from './services/geminiService';
import { storageService } from './services/storageService';
import { SampleMovie, MovieProject, Character, Chapter } from './types';

// --- Components ---

const Navbar = ({ onStartWizard, onLoginClick, isLoggedIn, onLogout }: { onStartWizard: () => void, onLoginClick?: () => void, isLoggedIn?: boolean, onLogout?: () => void }) => (
  <nav className="fixed top-0 left-0 right-0 z-50 bg-black/50 backdrop-blur-md border-b border-white/10 px-6 py-4 flex items-center justify-between">
    <div className="flex items-center gap-8">
      <a href="/" className="text-2xl font-bold tracking-tighter flex items-center gap-2 hover:opacity-80 transition-opacity">
        <div className="w-8 h-8 bg-brand-primary rounded-lg flex items-center justify-center">
          <Play className="w-5 h-5 text-black fill-current" />
        </div>
        <span>MovieAnimation<span className="text-brand-primary">.ai</span></span>
      </a>
      <div className="hidden md:flex items-center gap-6 text-sm font-medium text-white/70">
        <a href="#" className="hover:text-white transition-colors">Movies</a>
        <a href="#" className="hover:text-white transition-colors">Shows</a>
        <a href="#" className="hover:text-white transition-colors">Live TV</a>
        <a href="#" className="hover:text-white transition-colors">My List</a>
      </div>
    </div>
    <div className="flex items-center gap-4">
      {isLoggedIn ? (
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center border border-brand-primary/50 text-brand-primary">
            <Users className="w-4 h-4" />
          </div>
          <button onClick={() => { if(onLogout) onLogout(); }} className="px-4 py-2 text-sm font-medium hover:text-brand-primary transition-colors border border-white/10 rounded-full hover:border-white/30">Log Out</button>
        </div>
      ) : (
        <button onClick={onLoginClick} className="px-4 py-2 text-sm font-medium hover:text-brand-primary transition-colors">Sign In</button>
      )}
      <button 
        onClick={onStartWizard}
        className="bg-brand-primary text-black px-6 py-2 rounded-full text-sm font-bold hover:bg-brand-primary/90 transition-all transform hover:scale-105"
      >
        Get Started
      </button>
    </div>
  </nav>
);

const LoginModal = ({ onClose, onLogin }: { onClose: () => void, onLogin: () => void }) => {
  const [mode, setMode] = React.useState<"login" | "register">("login");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  const handleSubmit = async () => {
    setLoading(true);
    setError("");
    try {
      const email = (document.getElementById("auth-email") as HTMLInputElement)?.value;
      const password = (document.getElementById("auth-password") as HTMLInputElement)?.value;
      let body: any = { email, password };
      
      if (mode === "register") { 
        body.name = (document.getElementById("auth-name") as HTMLInputElement)?.value || "User"; 
      }
      
      const res = await fetch("/api/" + mode, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      
      if (data.token) {
        localStorage.setItem("token", data.token);
        onLogin(); 
        onClose(); window.scrollTo(0, 0);
      } else {
        setError(data.error || "Authentication failed");
      }
    } catch(e) {
      setError("Server not reachable");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-md bg-[#0a0a0a] border border-white/10 rounded-3xl p-8 shadow-2xl relative"
      >
        <button onClick={onClose} className="absolute top-6 right-6 p-2 hover:bg-white/10 rounded-full transition-colors">
          <X className="w-5 h-5" />
        </button>
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold mb-2">{mode === "login" ? "Welcome Back" : "Create Account"}</h2>
          <p className="text-white/50">{mode === "login" ? "Sign in to access your movies." : "Join MovieAnimation to start creating."}</p>
        </div>
        
        {error && <div className="bg-red-500/20 text-red-400 p-3 rounded-xl mb-4 text-sm text-center border border-red-500/30">{error}</div>}
        
        <div className="flex flex-col gap-4">
          {mode === "register" && (
            <div>
              <label className="text-sm font-bold text-white/50 mb-1 block">Name</label>
              <input id="auth-name" type="text" className="w-full bg-[#1a1a1a] border border-white/20 rounded-xl p-3 text-white focus:border-brand-primary outline-none transition-colors" placeholder="John Doe" />
            </div>
          )}
          <div>
            <label className="text-sm font-bold text-white/50 mb-1 block">Email</label>
            <input id="auth-email" type="email" className="w-full bg-[#1a1a1a] border border-white/20 rounded-xl p-3 text-white focus:border-brand-primary outline-none transition-colors" placeholder="you@example.com" />
          </div>
          <div>
            <label className="text-sm font-bold text-white/50 mb-1 block">Password</label>
            <input id="auth-password" type="password" className="w-full bg-[#1a1a1a] border border-white/20 rounded-xl p-3 text-white focus:border-brand-primary outline-none transition-colors" placeholder="••••••••" />
          </div>
          
          <button 
            onClick={handleSubmit} 
            disabled={loading}
            className="w-full bg-brand-primary text-black font-bold py-4 rounded-xl mt-4 hover:bg-white transition-colors disabled:opacity-50"
          >
            {loading ? "Processing..." : (mode === "login" ? "Sign In" : "Create Account")}
          </button>
        </div>
        
        <p className="text-center mt-6 text-white/50 text-sm">
          <button onClick={() => {setMode(mode === "login" ? "register" : "login"); setError("");}} className="text-brand-primary font-bold hover:underline ml-1">
            {mode === "login" ? "Register a new account" : "Already have an account? Sign in"}
          </button>
        </p>
      </motion.div>
    </div>
  );
};

const AnimationsDashboard = ({ onStartWizard }: { onStartWizard: () => void }) => {
  const [anims, setAnims] = React.useState([]);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [currentPage, setCurrentPage] = React.useState(1);
  const itemsPerPage = 5;

  React.useEffect(() => {
    fetch('/api/animations').then(r => r.json()).then(d => { if (d.success) setAnims(d.animations); });
  }, []);

  const filteredAnims = anims.filter((a: any) => 
    a.animation_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.script_title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalPages = Math.ceil(filteredAnims.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedAnims = filteredAnims.slice(startIndex, startIndex + itemsPerPage);

  React.useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) setCurrentPage(totalPages);
  }, [filteredAnims, currentPage, totalPages]);

  return (
    <div className="min-h-screen pt-32 px-6 md:px-20">
      <div className="max-w-7xl mx-auto w-full">
        <div className="flex items-center justify-between mb-12">
          <div className="text-left">
            <h1 className="text-4xl font-bold mb-2">My Animations</h1>
            <p className="text-white/50">Manage your generated movies and scripts.</p>
          </div>
          <button onClick={onStartWizard} className="bg-brand-primary text-black px-6 py-3 rounded-xl font-bold flex items-center gap-2">
            <Plus className="w-5 h-5" /> Create New Movie
          </button>
        </div>
        
        <div className="mb-6">
          <div className="relative">
            <input
              type="text"
              placeholder="Search animations by name or script..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pl-12 text-white placeholder-white/40 focus:outline-none focus:border-brand-primary/50 focus:ring-2 focus:ring-brand-primary/20 transition-all"
            />
            <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(''); setCurrentPage(1); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
              >
                ✕
              </button>
            )}
          </div>
          <p className="text-white/40 text-sm mt-2">
            Showing {paginatedAnims.length} of {filteredAnims.length} {filteredAnims.length === 1 ? 'animation' : 'animations'}
          </p>
        </div>

        <div className="border-2 border-dashed border-white/10 rounded-3xl bg-black/40 p-6">
          {anims.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-white/30">
              <Clapperboard className="w-12 h-12 mb-4 opacity-50" />
              <p>You have not created any movies yet.</p>
            </div>
          ) : filteredAnims.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-white/30">
              <p>No animations found matching "{searchQuery}"</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {paginatedAnims.map((a: any) => (
                <li key={a.id} className="group relative bg-gradient-to-r from-white/5 to-white/10 hover:from-white/10 hover:to-white/15 rounded-xl p-4 border border-white/10 transition-all duration-300 hover:border-brand-primary/50 hover:shadow-lg hover:shadow-brand-primary/20">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-white mb-2 group-hover:text-brand-primary transition-colors">{a.animation_name}</h3>
                      <p className="text-white/70 text-sm mb-3">{a.script_title}</p>
                      <div className="flex flex-wrap gap-2">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          a.status === 'completed' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                          a.status === 'in_progress' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                          'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                        }`}>
                          {a.status === 'in_progress' ? 'In Progress' : a.status.charAt(0).toUpperCase() + a.status.slice(1)}
                        </span>
                        <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400 border border-blue-500/30">
                          ⏱️ {Math.floor(a.duration_seconds / 60)}:{(a.duration_seconds % 60).toString().padStart(2, '0')}
                        </span>
                        <span className="px-3 py-1 rounded-full text-xs font-medium bg-purple-500/20 text-purple-400 border border-purple-500/30">
                          📚 {a.chapter_count} {parseInt(a.chapter_count) === 1 ? 'Chapter' : 'Chapters'}
                        </span>
                        <span className="px-3 py-1 rounded-full text-xs font-medium bg-pink-500/20 text-pink-400 border border-pink-500/30">
                          👥 {a.character_count} {parseInt(a.character_count) === 1 ? 'Character' : 'Characters'}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-3 ml-6">
                      <Link 
                        to={`/animation/${a.id}`}
                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white rounded-lg font-medium transition-all duration-300 shadow-lg hover:shadow-purple-500/50 hover:scale-105"
                        title="Edit Animation"
                      >
                        <FileText className="w-4 h-4" />
                        <span className="hidden md:inline">Edit</span>
                      </Link>
                      <Link 
                        to={`/player/animation/${a.id}`}
                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-brand-primary to-cyan-400 hover:from-cyan-400 hover:to-brand-primary text-black rounded-lg font-medium transition-all duration-300 shadow-lg hover:shadow-brand-primary/50 hover:scale-105"
                        title="Play Animation"
                      >
                        <Play className="w-4 h-4" />
                        <span className="hidden md:inline">Play</span>
                      </Link>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-6">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-4 py-2 rounded-lg bg-white/5 text-white border border-white/10 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              ← Previous
            </button>
            <div className="flex gap-2">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`w-10 h-10 rounded-lg font-medium transition-all ${
                    currentPage === page
                      ? 'bg-brand-primary text-black'
                      : 'bg-white/5 text-white border border-white/10 hover:bg-white/10'
                  }`}
                >
                  {page}
                </button>
              ))}
            </div>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-4 py-2 rounded-lg bg-white/5 text-white border border-white/10 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
const ProcessFlow = () => {
  const steps = [
    { icon: BookOpen, title: "Upload Story" },
    { icon: FileText, title: "Convert Script" },
    { icon: Clapperboard, title: "Break into Scenes" },
    { icon: Users, title: "Extract Characters" },
    { icon: Play, title: "Generate Movie" }
  ];

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className="mt-16 mx-auto w-full max-w-5xl backdrop-blur-xl bg-black/40 border border-white/10 rounded-3xl p-8 hidden lg:block relative overflow-hidden shadow-2xl"
    >
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-brand-primary/5 blur-[120px] -z-10 rounded-full" />
      <div className="flex items-center justify-between relative">
        <div className="absolute top-8 left-[10%] w-[80%] border-t-2 border-dashed border-white/10 -z-10" />
        {steps.map((step, idx) => (
          <div key={idx} className="flex flex-col items-center gap-4 relative z-10 w-40 group">
            <div className="w-16 h-16 rounded-2xl bg-[#0a0a0a] border border-white/10 text-white/50 group-hover:border-brand-primary group-hover:text-brand-primary group-hover:shadow-[0_0_20px_rgba(255,215,0,0.15)] transition-all duration-300 flex items-center justify-center relative overflow-hidden">
              {React.createElement(step.icon, { className: "w-7 h-7 relative z-10" })}
            </div>
            <span className="text-[11px] font-bold uppercase tracking-widest text-white/50 group-hover:text-white transition-colors duration-300 text-center">
              {step.title}
            </span>
            {idx < steps.length - 1 && (
              <div className="absolute -right-6 top-8 -translate-y-1/2 text-white/20">
                <ChevronRight className="w-6 h-6" />
              </div>
            )}
          </div>
        ))}
      </div>
    </motion.div>
  );
};

const Hero = ({ onStartWizard }: { onStartWizard: () => void }) => (
  <section className="relative min-h-screen pt-32 pb-20 flex items-center px-6 md:px-20 overflow-hidden">
    <div className="absolute inset-0 z-0">
      <img 
        src="https://images.unsplash.com/photo-1600646869918-9d51167eb1af?q=80&w=2070&auto=format&fit=crop&v=5" 
        alt="Cinematic Background" 
        className="w-full h-full object-cover opacity-40"
        referrerPolicy="no-referrer"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-black via-black/60 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
    </div>
    
    <div className="relative z-10 w-full max-w-5xl mx-auto flex flex-col items-center text-center">
      <motion.h1 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-5xl md:text-7xl font-bold leading-tight mb-6"
      >
        Transform Stories into <span className="text-brand-primary">Movies with AI</span>
      </motion.h1>
      <motion.p 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="text-lg md:text-xl text-white/70 mb-8 max-w-2xl mx-auto"
      >
        MovieAnimation.ai converts your stories, scripts, and books into stunning animated movies. Configure characters, scenes, and animations—let AI do the rest.
      </motion.p>
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="flex flex-wrap gap-4 justify-center"
      >
        <button 
          onClick={onStartWizard}
          className="bg-brand-primary text-black px-8 py-4 rounded-xl text-lg font-bold hover:bg-brand-primary/90 transition-all flex items-center gap-2"
        >
          Get the Offer <ChevronRight className="w-5 h-5" />
        </button>
        <button className="bg-white/10 backdrop-blur-md text-white px-8 py-4 rounded-xl text-lg font-bold hover:bg-white/20 transition-all">
          Explore Plans
        </button>
      </motion.div>
      <ProcessFlow />
    </div>
  </section>
);

const MovieSection = ({ title, movies }: { title: string, movies: SampleMovie[] }) => (
  <section className="py-12 px-6 md:px-20">
    <div className="flex items-center justify-between mb-8">
      <h2 className="text-2xl font-bold">{title}</h2>
      <button className="text-brand-primary text-sm font-bold hover:underline">View all</button>
    </div>
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
      {movies.map((movie) => (
        <motion.div 
          key={movie.id}
          whileHover={{ scale: 1.05 }}
          className="group relative aspect-[2/3] rounded-xl overflow-hidden cursor-pointer"
        >
          <img 
            src={movie.thumbnail} 
            alt={movie.title} 
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-4">
            <p className="text-xs font-bold text-brand-primary uppercase tracking-widest mb-1">{movie.category}</p>
            <h3 className="text-sm font-bold leading-tight">{movie.title}</h3>
          </div>
        </motion.div>
      ))}
    </div>
  </section>
);

const PricingSection = () => {
  const plans = [
    { name: 'Basic', price: '$9.99', features: ['1 Device', 'SD Quality', 'Limited Ads', 'Download to watch offline'] },
    { name: 'Pro', price: '$14.99', features: ['2 Devices', 'HD Quality', 'Ad-free streaming', 'Download to watch offline', 'Share with family'], highlight: true },
    { name: 'Ultra', price: '$19.99', features: ['4 Devices', '4K UHD & HDR Quality', 'Ad-free streaming', 'Download to watch offline', 'Share with family', 'Dolby Atmos'] },
  ];

  return (
    <section className="py-20 px-6 md:px-20 bg-brand-secondary/30">
      <h2 className="text-4xl font-bold text-center mb-16">Choose your plan</h2>
      <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
        {plans.map((plan) => (
          <div 
            key={plan.name}
            className={`glass-card p-8 flex flex-col items-center text-center transition-all ${plan.highlight ? 'ring-2 ring-brand-primary scale-105 bg-brand-primary/5' : ''}`}
          >
            <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
            <div className="text-4xl font-bold mb-8 text-brand-primary">{plan.price}<span className="text-sm text-white/50 font-normal">/mo</span></div>
            <ul className="space-y-4 mb-12 text-white/70 text-sm">
              {plan.features.map((f) => <li key={f}>{f}</li>)}
            </ul>
            <button className={`w-full py-3 rounded-xl font-bold transition-all ${plan.highlight ? 'bg-brand-primary text-black hover:bg-brand-primary/90' : 'bg-white/10 hover:bg-white/20'}`}>
              Get {plan.name}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
};

const FAQSection = () => {
  const faqs = [
    { q: 'What is MovieAnimation.ai?', a: 'MovieAnimation.ai is a revolutionary platform that uses AI to convert your stories, scripts, and books into stunning animated movies. You provide the content, and our AI handles the characters, scenes, and animation.' },
    { q: 'Can I cancel anytime?', a: 'Yes, our subscriptions are flexible. You can cancel your plan at any time through your account settings without any hidden fees.' },
    { q: 'What devices are supported?', a: 'You can access MovieAnimation.ai on any modern web browser. The rendered movies can be downloaded and played on any device that supports standard video formats.' },
    { q: 'Do you offer a free trial?', a: 'Yes! We offer a 7-day free trial for new users to explore the platform and create their first short animated clip.' },
  ];

  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="py-20 px-6 md:px-20 max-w-4xl mx-auto">
      <h2 className="text-3xl font-bold mb-12">FAQ</h2>
      <div className="space-y-4">
        {faqs.map((faq, i) => (
          <div key={i} className="glass-card overflow-hidden">
            <button 
              onClick={() => setOpenIndex(openIndex === i ? null : i)}
              className="w-full p-6 flex items-center justify-between text-left hover:bg-white/5 transition-colors"
            >
              <span className="font-bold">{faq.q}</span>
              <ChevronDown className={`w-5 h-5 transition-transform ${openIndex === i ? 'rotate-180' : ''}`} />
            </button>
            <AnimatePresence>
              {openIndex === i && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="px-6 pb-6 text-white/60 text-sm leading-relaxed"
                >
                  {faq.a}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </section>
  );
};

const Footer = () => (
  <footer className="py-12 px-6 md:px-20 border-t border-white/10 bg-black">
    <div className="flex flex-col md:flex-row justify-between items-center gap-8 mb-12">
      <div className="text-xl font-bold tracking-tighter flex items-center gap-2">
        <div className="w-6 h-6 bg-brand-primary rounded flex items-center justify-center">
          <Play className="w-4 h-4 text-black fill-current" />
        </div>
        <span>MovieAnimation<span className="text-brand-primary">.ai</span></span>
      </div>
      <div className="flex gap-8 text-sm text-white/50">
        <a href="#" className="hover:text-white">About Us</a>
        <a href="#" className="hover:text-white">Help Center</a>
        <a href="#" className="hover:text-white">Terms of Service</a>
        <a href="#" className="hover:text-white">Privacy Policy</a>
        <a href="#" className="hover:text-white">Contact</a>
      </div>
      <div className="flex gap-6">
        <Facebook className="w-5 h-5 text-white/50 hover:text-white cursor-pointer" />
        <Instagram className="w-5 h-5 text-white/50 hover:text-white cursor-pointer" />
        <Twitter className="w-5 h-5 text-white/50 hover:text-white cursor-pointer" />
        <Youtube className="w-5 h-5 text-white/50 hover:text-white cursor-pointer" />
      </div>
    </div>
    <p className="text-center text-xs text-white/30">© 2026 MovieAnimation.ai. All rights reserved.</p>
  </footer>
);

// --- Wizard Components ---

const ServiceWizard = ({ onComplete, initialProject }: { onComplete: (project: MovieProject) => void, initialProject?: MovieProject }) => {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [project, setProject] = useState<Partial<MovieProject>>(initialProject || {
    id: crypto.randomUUID(),
    title: 'Untitled Movie',
    originalScript: '',
    editableScript: '',
    characters: [],
    chapters: [],
    status: 'draft'
  });

  useEffect(() => {
    if (project.id) {
      storageService.saveProject(project as MovieProject);
    }
  }, [project]);

  const steps = [
    { id: 'A', title: 'Upload Story', icon: Upload, desc: 'Add or upload your written scripts and stories.' },
    { id: 'B', title: 'Convert to Script', icon: FileText, desc: 'Converting information into an editable script.' },
    { id: "C", title: "Break into Chapters", icon: BookOpen, desc: "Break the story into different chapters." },
    { id: "D", title: "Extract Characters", icon: Users, desc: "Adding the characters that will be in the video." },
    { id: 'E', title: 'List Scenes', icon: Clapperboard, desc: 'Listing the scenes that are part of each chapter.' },
    { id: 'F', title: 'Generate Character Scripts', icon: Mic2, desc: 'Generation of character scripts for the movie.' },
  ];

  const handleNext = async () => {
    setLoading(true);
    try {
      if (step === 0) {
        // Step A -> B
        const editable = await convertToEditableScript(project.originalScript || "");
        setProject(prev => ({ ...prev, editableScript: editable }));
      } else if (step === 1) {
        // Step B -> C
        const chars = await extractCharacters(project.editableScript || "");
        setProject(prev => ({ ...prev, characters: chars.map((c: any, i: number) => ({ id: String(i), ...c })) }));
      } else if (step === 2) {
        // Step C -> D
        const chapters = await breakIntoChapters(project.editableScript || "");
        setProject(prev => ({ ...prev, chapters }));
      } else if (step === 5) {
        onComplete(project as MovieProject);
        return;
      }
      setStep(prev => prev + 1);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8">
      <div className="flex items-center gap-4 mb-8 overflow-x-auto pb-4">
        {steps.map((s, i) => (
          <div key={s.id} className={`flex items-center gap-2 shrink-0 ${i <= step ? 'text-brand-primary' : 'text-white/20'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${i <= step ? 'border-brand-primary bg-brand-primary/10' : 'border-white/10'}`}>
              {i < step ? <CheckCircle2 className="w-5 h-5" /> : <span className="text-xs font-bold">{s.id}</span>}
            </div>
            <span className="text-xs font-bold uppercase tracking-widest hidden sm:block">{s.title}</span>
            {i < steps.length - 1 && <div className={`w-8 h-px ${i < step ? 'bg-brand-primary' : 'bg-white/10'}`} />}
          </div>
        ))}
      </div>

      <div className="min-h-[400px] flex flex-col">
        <div className="flex items-center gap-4 mb-6">
          <div className="p-3 bg-brand-primary/10 rounded-xl">
            {React.createElement(steps[step].icon, { className: "w-6 h-6 text-brand-primary" })}
          </div>
          <div>
            <h3 className="text-2xl font-bold">{steps[step].title}</h3>
            <p className="text-white/50 text-sm">{steps[step].desc}</p>
          </div>
        </div>

        <div className="flex-1 glass-card p-6 mb-8">
          {step === 0 && (
            <textarea 
              className="w-full h-full bg-transparent border-none focus:ring-0 text-lg resize-none placeholder:text-white/20"
              placeholder="Paste your story, script, or book content here..."
              value={project.originalScript}
              onChange={(e) => setProject({ ...project, originalScript: e.target.value })}
            />
          )}
          {step === 1 && (
            <div className="h-[300px] overflow-y-auto prose prose-invert max-w-none">
              <pre className="whitespace-pre-wrap text-sm text-white/80">{project.editableScript}</pre>
            </div>
          )}
          {step === 2 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {project.characters?.map((char) => (
                <div key={char.id} className="p-4 bg-white/5 rounded-xl border border-white/10">
                  <h4 className="font-bold text-brand-primary">{char.name}</h4>
                  <p className="text-xs text-white/50">{char.description}</p>
                </div>
              ))}
            </div>
          )}
          {step >= 3 && step <= 4 && (
            <div className="space-y-6">
              {project.chapters?.map((chapter, i) => (
                <div key={i} className="space-y-2">
                  <h4 className="font-bold flex items-center gap-2">
                    <span className="text-brand-primary">Chapter {i + 1}:</span> {chapter.title}
                  </h4>
                  <div className="grid gap-2 pl-4">
                    {chapter.scenes.map((scene, si) => (
                      <div key={si} className="p-3 bg-white/5 rounded-lg border border-white/5 text-sm">
                        <p className="font-medium">{scene.title}</p>
                        <p className="text-xs text-white/40">{scene.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {step === 5 && (
            <div className="text-center py-12">
              <CheckCircle2 className="w-16 h-16 text-brand-primary mx-auto mb-4" />
              <h4 className="text-xl font-bold mb-2">Ready to Render!</h4>
              <p className="text-white/50">Your script has been processed and characters are ready for animation.</p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-4">
          <button 
            disabled={step === 0 || loading}
            onClick={() => setStep(prev => prev - 1)}
            className="px-6 py-3 rounded-xl font-bold bg-white/5 hover:bg-white/10 disabled:opacity-30"
          >
            Back
          </button>
          <button 
            disabled={loading || (step === 0 && !project.originalScript)}
            onClick={handleNext}
            className="px-8 py-3 rounded-xl font-bold bg-brand-primary text-black hover:bg-brand-primary/90 flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? 'Processing...' : step === 5 ? 'Finish' : 'Next Step'}
            {!loading && <ChevronRight className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </div>
  );
};

const UserWizard = ({ project: initialProject, onClose }: { project: MovieProject | null, onClose: () => void }) => {
  const [step, setStep] = useState(0);
  const [project, setProject] = useState<MovieProject | null>(initialProject);

  const steps = [
    { id: 1, title: "Script & AI Model", icon: FileText, desc: "Type your script and select your AI video model." },
    { id: 2, title: "Character Faces", icon: Users, desc: "Upload photos to map onto your characters." },
        { id: 3, title: "Animation & Scenes", icon: Cpu, desc: "Define motion paths and environments." },
    { id: 4, title: 'Voice', icon: Mic2, desc: 'Assign AI voices and emotional tones.' },
    { id: 5, title: 'Render', icon: Play, desc: 'Final review and movie generation.' },
  ];

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-5xl bg-[#0a0a0a] border border-white/10 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
      >
        <div className="p-6 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-brand-primary rounded-xl flex items-center justify-center">
              <Play className="w-6 h-6 text-black fill-current" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Movie Creation Wizard</h2>
              <p className="text-xs text-white/40">Project: {project?.title || 'New Movie'}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {!project ? (
            <div className="p-8">
              {/* User Wizard Steps Implementation */}
              <div className="flex items-center justify-between mb-12">
                {steps.map((s, i) => (
                  <div key={s.id} className="flex flex-col items-center gap-3 flex-1 relative">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border-2 transition-all ${i <= step ? 'border-brand-primary bg-brand-primary/10 text-brand-primary' : 'border-white/10 text-white/20'}`}>
                      {React.createElement(s.icon, { className: "w-6 h-6" })}
                    </div>
                    <span className={`text-[10px] font-bold uppercase tracking-widest ${i <= step ? 'text-white' : 'text-white/20'}`}>{s.title}</span>
                    {i < steps.length - 1 && (
                      <div className={`absolute top-6 left-[calc(50%+24px)] w-[calc(100%-48px)] h-px ${i < step ? 'bg-brand-primary' : 'bg-white/10'}`} />
                    )}
                  </div>
                ))}
              </div>

              <div className="text-center py-20">
                <h3 className="text-3xl font-bold mb-4">Step {steps[step].id}: {steps[step].title}</h3>
                <p className="text-white/50 max-w-md mx-auto mb-8">{steps[step].desc}</p>
                {step === 0 && (
                  <div className="flex flex-col gap-6 text-left max-w-3xl mx-auto mb-10">
                    <div className="bg-white/5 p-6 rounded-2xl border border-white/10">
                      <h4 className="font-bold mb-3 text-lg text-brand-primary">1. Select AI Video Model</h4>
                      <select className="w-full bg-black/50 border border-white/20 rounded-xl p-4 text-white focus:outline-none focus:border-brand-primary transition-colors cursor-pointer">
                        <option value="luma">Luma Dream Machine (Cinematic & Fast)</option>
                        <option value="kling">Kling AI (Photorealistic & High Temporal Consistency)</option>
                      </select>
                    </div>
                    <div className="bg-white/5 p-6 rounded-2xl border border-white/10 flex-1">
                      <h4 className="font-bold mb-3 text-lg text-brand-primary">2. Type Your Script</h4>
                      <textarea 
                        className="w-full bg-black/50 border border-white/20 rounded-xl p-4 text-white h-48 resize-none focus:outline-none focus:border-brand-primary transition-colors"
                        placeholder="INT. COFFEE SHOP - DAY

A dark, moody coffee shop. A CREATOR sits at a table, intensely focused on a laptop..."
                      ></textarea>
                    </div>
                  </div>
                )}
                
                {step === 1 && (
                  <div className="flex flex-col gap-6 text-left max-w-3xl mx-auto mb-10">
                    <div className="bg-white/5 p-8 rounded-2xl border border-white/10 text-center">
                      <Upload className="w-16 h-16 text-brand-primary mx-auto mb-4" />
                      <h4 className="font-bold mb-2 text-2xl">Upload Character Reference Photos</h4>
                      <p className="text-sm text-white/50 mb-8 max-w-lg mx-auto">Upload clear, front-facing photos of the people you want to feature in your movie. The AI will map their faces onto the characters seamlessly.</p>
                      <div className="flex gap-4 justify-center">
                        <button className="bg-brand-primary text-black px-8 py-4 rounded-full font-bold hover:bg-white transition-colors">
                          Browse Photos...
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
                      <div className="border-2 border-dashed border-white/20 rounded-xl h-32 flex items-center justify-center text-white/30 text-sm hover:border-brand-primary hover:text-brand-primary transition-colors cursor-pointer">+ Add</div>
                      <div className="border-2 border-dashed border-white/10 rounded-xl h-32 flex items-center justify-center text-white/20 text-sm bg-black/30">Slot 2</div>
                      <div className="border-2 border-dashed border-white/10 rounded-xl h-32 flex items-center justify-center text-white/20 text-sm bg-black/30">Slot 3</div>
                      <div className="border-2 border-dashed border-white/10 rounded-xl h-32 flex items-center justify-center text-white/20 text-sm bg-black/30">Slot 4</div>
                    </div>
                  </div>
                )}
                <button 
                  onClick={() => step < 4 ? setStep(step + 1) : onClose()}
                  className="bg-brand-primary text-black px-10 py-4 rounded-2xl font-bold hover:scale-105 transition-all"
                >
                  {step === 4 ? 'Start Rendering' : 'Continue'}
                </button>
              </div>
            </div>
          ) : (
            <ServiceWizard onComplete={(p) => {
              setProject(p);
              storageService.saveProject(p);
            }} />
          )}
        </div>
      </motion.div>
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [showWizard, setShowWizard] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('token') || window.location.pathname === '/animations');

  useEffect(() => {
    if (isLoggedIn) {
      if (window.location.pathname !== '/animations') window.history.pushState({}, '', '/animations');
    } else {
      if (window.location.pathname !== '/') window.history.pushState({}, '', '/');
    }
  }, [isLoggedIn]);
  const [activeProject, setActiveProject] = useState<MovieProject | null>(null);
  const [savedProjects, setSavedProjects] = useState<MovieProject[]>([]);

  useEffect(() => {
    setSavedProjects(storageService.getAllProjects());
  }, [showWizard]);

  const handleLoadProject = (project: MovieProject) => {
    setActiveProject(project);
    setShowWizard(true);
  };

  const handleDeleteProject = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    storageService.deleteProject(id);
    setSavedProjects(storageService.getAllProjects());
  };

  const trendingMovies: SampleMovie[] = [
    { id: '1', title: 'MrBeast Challenge', thumbnail: 'https://images.unsplash.com/photo-1587504258827-e0a974ff6786?q=80&w=2072&auto=format&fit=crop&v=5', category: 'Viral' },
    { id: '2', title: 'I Spent 50 Hours In VR', thumbnail: 'https://images.unsplash.com/photo-1635778302434-07bbc7ba3dc7?q=80&w=2072&auto=format&fit=crop&v=5', category: 'Gaming' },
    { id: '3', title: 'Pro Gamer Setup Tour', thumbnail: 'https://images.unsplash.com/photo-1579367682352-d252b7fcd76c?q=80&w=2011&auto=format&fit=crop&v=5', category: 'Thriller' },
    { id: '4', title: 'How To Go Viral', thumbnail: 'https://images.unsplash.com/photo-1653753336046-72a1d70bb9f7?q=80&w=2002&auto=format&fit=crop&v=5', category: 'Action' },
    { id: '5', title: 'Streaming House Reveal', thumbnail: 'https://images.unsplash.com/photo-1649180543887-158357417159?q=80&w=2070&auto=format&fit=crop&v=5', category: 'Vlog' },
    { id: '6', title: 'Reacting to Drama', thumbnail: 'https://images.unsplash.com/photo-1642726197634-2a21f764220a?q=80&w=2094&auto=format&fit=crop&v=5', category: 'Drama' },
  ];

  const newReleases: SampleMovie[] = [...trendingMovies].reverse();

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/player/animation/:id" element={<VideoPlayer />} />
        <Route path="/animation/:id" element={<WorkspaceEditor />} />
        <Route path="*" element={
          <div className="min-h-screen bg-black text-white selection:bg-brand-primary selection:text-black">
            <Navbar onStartWizard={() => setShowWizard(true)} onLoginClick={() => setShowLogin(true)} isLoggedIn={isLoggedIn} onLogout={() => { localStorage.removeItem('token'); setIsLoggedIn(false); window.location.href = '/'; }} />
            
            <main>
              {isLoggedIn ? (<AnimationsDashboard onStartWizard={() => setShowWizard(true)} />) : (<><Hero onStartWizard={() => setShowLogin(true)} />
        
        <div className="relative z-10 -mt-32">
          {savedProjects.length > 0 && (
            <section className="py-12 px-6 md:px-20">
              <h2 className="text-2xl font-bold mb-8">My Projects</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {savedProjects.map((p) => (
                  <motion.div 
                    key={p.id}
                    whileHover={{ scale: 1.02 }}
                    onClick={() => handleLoadProject(p)}
                    className="glass-card p-6 cursor-pointer group relative"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-3 bg-brand-primary/10 rounded-xl">
                        <Clapperboard className="w-6 h-6 text-brand-primary" />
                      </div>
                      <button 
                        onClick={(e) => handleDeleteProject(e, p.id)}
                        className="p-2 text-white/20 hover:text-red-500 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <h3 className="text-lg font-bold mb-1">{p.title || 'Untitled Movie'}</h3>
                    <p className="text-xs text-white/40 mb-4 truncate">{p.originalScript || 'No script content'}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-brand-primary px-2 py-1 bg-brand-primary/10 rounded">
                        {p.status || 'Draft'}
                      </span>
                      <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-brand-primary transition-colors" />
                    </div>
                  </motion.div>
                ))}
              </div>
            </section>
          )}
          <MovieSection title="Trending Now" movies={trendingMovies} />
          <MovieSection title="New Releases" movies={newReleases} />
        </div>

        <PricingSection />
        
        <div className="py-20 px-6 md:px-20 grid md:grid-cols-2 gap-8 max-w-6xl mx-auto">
          <div className="glass-card p-8 flex items-center gap-6">
            <div className="w-16 h-16 bg-brand-primary/10 rounded-2xl flex items-center justify-center shrink-0">
              <Users className="w-8 h-8 text-brand-primary" />
            </div>
            <div>
              <h3 className="text-xl font-bold mb-1">Parental Controls</h3>
              <p className="text-sm text-white/50">Create profiles for kids, manage ratings, and set screen time limits.</p>
            </div>
          </div>
          <div className="glass-card p-8 flex items-center gap-6">
            <div className="w-16 h-16 bg-brand-primary/10 rounded-2xl flex items-center justify-center shrink-0">
              <Clapperboard className="w-8 h-8 text-brand-primary" />
            </div>
            <div>
              <h3 className="text-xl font-bold mb-1">Watch Anywhere</h3>
              <p className="text-sm text-white/50">Stream on your TV, laptop, tablet, or phone. All your favorites, always with you.</p>
            </div>
          </div>
        </div>

        <FAQSection />
        </>
        )}
      </main>

      <Footer />

      <AnimatePresence>
        {showWizard && (
          <UserWizard 
            project={activeProject} 
            onClose={() => setShowWizard(false)} 
          />
        )}
        {showLogin && (
          <LoginModal 
            onClose={() => setShowLogin(false)} 
            onLogin={() => setIsLoggedIn(true)} 
          />
        )}
      </AnimatePresence>
          </div>
        } />
      </Routes>
    </BrowserRouter>
  );
}
