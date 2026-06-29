# 🎬 MovieAnimation.ai

**Multi-API AI Video Generation Platform**

Create cinematic videos from scripts using multiple AI providers: Luma Dream Machine, Runway Gen-3, Kling, HeyGen, ElevenLabs, and DALL-E 3.

## 🏗️ Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Next.js UI  │────▶│  Express API  │────▶│  AI Providers    │
│  (Frontend)  │     │  (Backend)    │     │  Luma/Runway/etc │
└─────────────┘     └──────┬───────┘     └─────────────────┘
                           │
                    ┌──────▼───────┐
                    │  PostgreSQL   │
                    │  movieanimation_db │
                    └──────────────┘
```

## 📊 Database Schema (8 Core Tables)

| Table | Purpose |
|-------|---------|
| `users` | Account management, subscriptions (Stripe) |
| `projects` | Video production projects |
| `scripts` | Screenplays with AI enhancement tracking |
| `scenes` | Individual scenes extracted for generation |
| `video_clips` | AI-generated video clips from providers |
| `renders` | Final assembled video compositions |
| `api_usage` | API call tracking & cost accounting |
| `user_assets` | Uploaded media (images, audio, references) |

**Extension Tables:** `beta_testers`, `beta_feedback`, `analytics_events`, `performance_metrics`

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 15+ with pgcrypto extension
- API keys for desired providers

### Setup

```bash
# Clone
git clone https://github.com/rongsimbot/movieanimation.git
cd movieanimation

# Install dependencies
npm install
cd backend && npm install && cd ..

# Configure environment
cp .env.example .env.local
# Edit .env.local with your API keys

# Database setup
# Migration scripts in /migrations/
psql -U sim_admin -d movieanimation_db -f migrations/001_initial_schema.sql

# Run development
npm run dev
```

### Environment Variables

```env
# Database
DATABASE_URL=postgresql://sim_admin:password@localhost:5432/movieanimation_db

# AI Providers
LUMA_API_KEY=luma-xxx
RUNWAY_API_KEY=key_xxx
ANTHROPIC_API_KEY=sk-ant-xxx
OPENAI_API_KEY=sk-proj-xxx
ELEVENLABS_API_KEY=sk_xxx

# Stripe
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
```

## 📁 Project Structure

```
movieanimation/
├── frontend/          # Next.js 14 app
│   ├── src/app/       # Pages & layouts
│   └── src/lib/       # API client
├── backend/           # Express + TypeScript
│   ├── src/
│   │   ├── controllers/
│   │   ├── routes/
│   │   ├── services/
│   │   └── migrations/
│   └── package.json
├── migrations/        # Database migration SQL
│   ├── 001_initial_schema.sql
│   └── 002_phase1_schema_enhancements.sql
├── docs/              # Documentation
├── infrastructure/    # Docker, Nginx configs
├── skills/            # AI agent skill modules
├── research/          # API research notes
├── tools/             # Build & automation scripts
└── docker-compose.prod.yml
```

## 🔌 API Providers

- **Luma Dream Machine** - Text-to-video generation
- **Runway Gen-3** - Image-to-video generation
- **Kling** - High-quality video generation
- **HeyGen** - Avatar & talking-head videos
- **ElevenLabs** - Voice synthesis & cloning
- **OpenAI DALL-E 3** - Image generation for scenes/characters
- **Anthropic Claude** - Script analysis & scene extraction

## 📝 License

MIT

---
*Built with AI Studio • Deployed by SimRobotics*
