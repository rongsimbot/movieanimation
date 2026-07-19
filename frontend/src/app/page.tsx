"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { loginUser, storeAuth, isAuthenticated, LoginParams } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Film,
  Wand2,
  Users,
  Zap,
  Sparkles,
  ArrowRight,
  ChevronDown,
  Play,
  Mail,
  Lock,
  Loader2,
  Camera,
  Clapperboard,
  MonitorPlay,
} from "lucide-react";

export default function LandingPage() {
  const router = useRouter();
  const heroRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Check if already authenticated
  useEffect(() => {
    setMounted(true);
    if (isAuthenticated()) {
      router.push("/dashboard");
    }
  }, [router]);

  // Scroll tracking for navbar background
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans overflow-x-hidden">
      {/* ─── Animated Background Gradient ──────────────────── */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 -left-40 w-[600px] h-[600px] rounded-full bg-purple-600/15 blur-[120px] animate-pulse" />
        <div className="absolute top-1/3 -right-40 w-[500px] h-[500px] rounded-full bg-blue-500/10 blur-[120px] animate-pulse" style={{ animationDelay: "2s" }} />
        <div className="absolute bottom-0 left-1/3 w-[400px] h-[400px] rounded-full bg-amber-500/8 blur-[100px] animate-pulse" style={{ animationDelay: "4s" }} />
      </div>

      {/* ─── Navbar ──────────────────────────────────────── */}
      <nav
        className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
          scrolled
            ? "bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-800/50 shadow-lg shadow-black/20"
            : "bg-transparent"
        }`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shadow-lg shadow-purple-500/25 group-hover:shadow-purple-500/40 transition-shadow">
              <Film className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-bold text-white tracking-tight">
              MovieAnimation<span className="text-purple-400">.ai</span>
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <button
              onClick={() => scrollToSection("features")}
              className="text-sm text-zinc-400 hover:text-white transition-colors hidden sm:block"
            >
              Features
            </button>
            <button
              onClick={() => scrollToSection("how-it-works")}
              className="text-sm text-zinc-400 hover:text-white transition-colors hidden sm:block"
            >
              How It Works
            </button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/auth")}
              className="border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500"
            >
              Sign In
            </Button>
            <Button
              size="sm"
              onClick={() => router.push("/auth?mode=register")}
              className="bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/25"
            >
              Get Started
            </Button>
          </div>
        </div>
      </nav>

      {/* ─── Hero Section ────────────────────────────────── */}
      <section
        ref={heroRef}
        className="relative flex flex-col items-center justify-center min-h-screen pt-24 pb-16 px-6 z-10"
      >
        {/* Badge */}
        <div className="animate-fade-in-up mb-8">
          <span className="inline-flex items-center gap-2 rounded-full border border-zinc-700/50 bg-zinc-900/50 backdrop-blur-sm px-4 py-1.5 text-xs font-medium text-zinc-300">
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            AI-Powered Movie Studio
          </span>
        </div>

        {/* Headline */}
        <h1 className="max-w-4xl text-center text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-tight mb-6 animate-fade-in-up" style={{ animationDelay: "0.15s" }}>
          Turn Your{" "}
          <span className="bg-gradient-to-r from-purple-400 via-blue-400 to-cyan-400 bg-clip-text text-transparent">
            Screenplay
          </span>{" "}
          Into a Movie
        </h1>

        {/* Subheadline */}
        <p
          className="max-w-2xl text-center text-lg sm:text-xl text-zinc-400 mb-10 animate-fade-in-up leading-relaxed"
          style={{ animationDelay: "0.3s" }}
        >
          Upload your script and let AI handle the rest — character generation,
          scene composition, lip-synced dialogue, and cinematic rendering.
          From words on a page to a finished film.
        </p>

        {/* CTAs + Quick Login */}
        <div
          className="flex flex-col items-center gap-6 w-full max-w-lg animate-fade-in-up"
          style={{ animationDelay: "0.45s" }}
        >
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
            <Button
              onClick={() => router.push("/auth?mode=register")}
              className="w-full sm:w-auto h-12 px-8 text-base font-semibold bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white shadow-xl shadow-purple-600/20 hover:shadow-purple-500/30 transition-all duration-300"
            >
              Start Creating Free
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
            <Button
              variant="outline"
              onClick={() => scrollToSection("login")}
              className="w-full sm:w-auto h-12 px-8 text-base border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 bg-zinc-900/50 backdrop-blur-sm"
            >
              <Play className="w-4 h-4 mr-2" />
              Sign In
            </Button>
          </div>
          <p className="text-xs text-zinc-600">No credit card required • Free credits to start</p>
        </div>

        {/* Scroll Indicator */}
        <button
          onClick={() => scrollToSection("features")}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 text-zinc-600 hover:text-zinc-400 transition-colors animate-bounce"
        >
          <ChevronDown className="w-6 h-6" />
        </button>
      </section>

      {/* ─── Features Section ─────────────────────────────── */}
      <section id="features" className="relative z-10 px-6 py-24">
        <div className="mx-auto max-w-7xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Everything You Need to{" "}
              <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                Create Movies
              </span>
            </h2>
            <p className="text-zinc-400 max-w-2xl mx-auto text-lg">
              From script to screen — our AI studio handles every step of the filmmaking process.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => (
              <div
                key={feature.title}
                className="group rounded-2xl border border-zinc-800/50 bg-zinc-900/30 backdrop-blur-sm p-8 hover:border-zinc-700/50 hover:bg-zinc-900/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-purple-500/5"
                style={{ animationDelay: `${i * 0.1}s` }}
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/10 to-blue-500/10 border border-purple-500/20 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-300">
                  <feature.icon className="w-6 h-6 text-purple-400" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── How It Works ─────────────────────────────────── */}
      <section id="how-it-works" className="relative z-10 px-6 py-24">
        <div className="mx-auto max-w-7xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              How It{" "}
              <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                Works
              </span>
            </h2>
            <p className="text-zinc-400 max-w-2xl mx-auto text-lg">
              Four simple steps from idea to finished film.
            </p>
          </div>

          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-8 top-0 bottom-0 w-px bg-gradient-to-b from-purple-500/50 via-blue-500/50 to-transparent hidden lg:block" />

            <div className="space-y-12 lg:space-y-0 lg:grid lg:grid-cols-4 lg:gap-6">
              {steps.map((step, i) => (
                <div key={step.title} className="relative flex lg:flex-col items-start gap-6 lg:gap-4 lg:text-center">
                  {/* Step number circle */}
                  <div className="flex-shrink-0 w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-600/20 to-blue-600/20 border border-purple-500/30 flex items-center justify-center shadow-lg shadow-purple-500/10">
                    <span className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                      {i + 1}
                    </span>
                  </div>
                  <div className="flex-1 lg:flex lg:flex-col lg:items-center">
                    <h3 className="text-lg font-semibold text-white mb-2">
                      {step.title}
                    </h3>
                    <p className="text-sm text-zinc-400 leading-relaxed lg:max-w-[200px]">
                      {step.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── Login Section ────────────────────────────────── */}
      <section id="login" className="relative z-10 px-6 py-24">
        <div className="mx-auto max-w-7xl">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left: Value prop */}
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">
                Ready to Bring Your{" "}
                <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                  Stories
                </span>{" "}
                to Life?
              </h2>
              <p className="text-zinc-400 text-lg mb-8 leading-relaxed">
                Sign in to access your studio, manage your scripts, generate scenes,
                and assemble your movie — all powered by cutting-edge AI.
              </p>
              <div className="space-y-4">
                {benefits.map((b) => (
                  <div key={b} className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-purple-500/10 border border-purple-500/30 flex items-center justify-center flex-shrink-0">
                      <svg className="w-3 h-3 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <span className="text-sm text-zinc-300">{b}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Login Form */}
            <LoginForm router={router} />
          </div>
        </div>
      </section>

      {/* ─── Footer ──────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-zinc-800/50 px-6 py-8">
        <div className="mx-auto max-w-7xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-zinc-500 text-sm">
            <Film className="w-4 h-4" />
            <span>MovieAnimation.ai</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-zinc-500">
            <Link href="/tos" className="hover:text-zinc-300 transition-colors">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-zinc-300 transition-colors">
              Privacy
            </Link>
            <Link href="/help" className="hover:text-zinc-300 transition-colors">
              Help
            </Link>
            <span className="text-zinc-600">
              SimRobotics Corp &copy; {new Date().getFullYear()}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─── Login Form Component ──────────────────────────────────────

function LoginForm({ router }: { router: ReturnType<typeof useRouter> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [focused, setFocused] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await loginUser({ email, password } as LoginParams);

      if (result.ok && result.data) {
        storeAuth(result.data);
        router.push("/dashboard");
      } else {
        setError(result.error || "Invalid credentials. Please try again.");
      }
    } catch {
      setError("Unable to connect. Is the server running?");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-zinc-800/50 bg-zinc-900/40 backdrop-blur-xl p-8 sm:p-10 shadow-2xl shadow-black/20">
      <div className="mb-8">
        <h3 className="text-2xl font-bold text-white mb-1">Welcome Back</h3>
        <p className="text-sm text-zinc-400">
          Sign in to your studio
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400 flex items-center gap-2">
            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {error}
          </div>
        )}

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-zinc-300 mb-2">
            Email
          </label>
          <div
            className={`relative rounded-xl border transition-all duration-200 ${
              focused === "email"
                ? "border-purple-500/50 ring-2 ring-purple-500/10"
                : error
                  ? "border-red-500/30"
                  : "border-zinc-700/50"
            }`}
          >
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(""); }}
              onFocus={() => setFocused("email")}
              onBlur={() => setFocused(null)}
              className="w-full bg-transparent py-3 pl-11 pr-4 text-sm text-white placeholder-zinc-500 outline-none"
              placeholder="you@example.com"
            />
          </div>
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-zinc-300 mb-2">
            Password
          </label>
          <div
            className={`relative rounded-xl border transition-all duration-200 ${
              focused === "password"
                ? "border-purple-500/50 ring-2 ring-purple-500/10"
                : error
                  ? "border-red-500/30"
                  : "border-zinc-700/50"
            }`}
          >
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(""); }}
              onFocus={() => setFocused("password")}
              onBlur={() => setFocused(null)}
              className="w-full bg-transparent py-3 pl-11 pr-4 text-sm text-white placeholder-zinc-500 outline-none"
              placeholder="Your password"
            />
          </div>
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="w-full h-12 text-sm font-semibold bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white shadow-lg shadow-purple-600/20 hover:shadow-purple-500/30 transition-all duration-300"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Signing In...
            </>
          ) : (
            "Sign In to Studio"
          )}
        </Button>
      </form>

      <div className="mt-6 text-center">
        <p className="text-sm text-zinc-400">
          Don&apos;t have an account?{" "}
          <button
            type="button"
            onClick={() => router.push("/auth?mode=register")}
            className="font-medium text-purple-400 hover:text-purple-300 transition-colors"
          >
            Create one free
          </button>
        </p>
      </div>

      <div className="mt-8 pt-6 border-t border-zinc-800/50">
        <p className="text-xs text-zinc-600 text-center">
          Secure authentication via JWT • Your data is encrypted
        </p>
      </div>
    </div>
  );
}

// ─── Data ───────────────────────────────────────────────────────

const features = [
  {
    icon: Wand2,
    title: "AI Script Parsing",
    description:
      "Upload your screenplay and our AI automatically extracts characters, scenes, locations, and dialogue — ready for production.",
  },
  {
    icon: Users,
    title: "Character Generation",
    description:
      "Generate consistent characters with AI image models. Assign voices, appearances, and personalities that persist across scenes.",
  },
  {
    icon: Camera,
    title: "Scene Composition",
    description:
      "AI-powered camera direction — dynamic angles, lighting setups, and shot composition tailored to each scene's emotional tone.",
  },
  {
    icon: Clapperboard,
    title: "Lip-Sync Animation",
    description:
      "ByteDance LatentSync technology delivers natural lip-synced performances. Your characters speak with believable mouth movements.",
  },
  {
    icon: MonitorPlay,
    title: "Timeline Assembly",
    description:
      "Drag-and-drop timeline editor for arranging scenes, adding transitions, and fine-tuning your movie before final export.",
  },
  {
    icon: Zap,
    title: "One-Click Export",
    description:
      "Render your finished film in up to 4K resolution. Share via secure download links or embed directly on any platform.",
  },
];

const steps = [
  {
    title: "Upload Script",
    description:
      "Drop your screenplay (PDF, DOCX, or plain text) and our AI parses characters, scenes, and dialogue automatically.",
  },
  {
    title: "Generate Characters",
    description:
      "AI creates consistent character visuals. Customize appearances, assign voices, and refine each persona.",
  },
  {
    title: "Produce Scenes",
    description:
      "AI generates each scene with dynamic camera angles, lighting, and lip-synced dialogue — frame by frame.",
  },
  {
    title: "Assemble & Export",
    description:
      "Arrange scenes on the timeline, add music and transitions, then export your finished film in high quality.",
  },
];

const benefits = [
  "Parse screenplays with AI in seconds",
  "Generate cinematic scenes from text descriptions",
  "Lip-sync characters with ByteDance LatentSync",
  "Assemble full films with timeline editor",
  "Export in 720p, 1080p, or 4K resolution",
];
