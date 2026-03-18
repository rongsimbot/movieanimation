# MovieAnimation Demo

**AI-powered movie analysis and animated storytelling platform**

## 🎬 Overview

MovieAnimation is a web application that combines AI-driven movie analysis with animated visual storytelling. Upload a movie file or provide a title, and watch as AI generates scene summaries, character arcs, and animated presentations.

## ✨ Features

- 🎥 **Movie Upload & Analysis** - Upload movie files for AI-powered analysis
- 🤖 **AI Scene Breakdown** - Automatic scene detection and summarization
- 📊 **Character Arc Tracking** - Identify and visualize character development
- 🎨 **Animated Presentations** - Generate animated slideshows from analysis
- 📝 **Script Generation** - AI-generated narration and storytelling

## 🛠 Tech Stack

**Backend:**
- Flask (Python)
- AI/ML Integration (TBD)
- Video Processing

**Frontend:**
- HTML5/CSS3
- JavaScript
- Responsive Design

## 📂 Repository Structure

```
movieanimation/
├── app.py              # Main Flask application
├── templates/          # HTML templates
├── uploads/            # Uploaded movie files
├── server.log          # Application logs
└── README.md           # This file
```

## 🌿 Branches

- **`main`** - Production-ready code
- **`dev`** - Development branch (active work)
- **`ma-ronnie-dev`** - Ronnie's personal development branch
- **`ma-synclair-dev`** - Synclair's personal development branch

## 🚀 Getting Started

### Prerequisites
- Python 3.8+
- Flask
- Git

### Installation

```bash
# Clone repository
git clone https://github.com/rongsimbot/movieanimation.git
cd movieanimation

# Install dependencies
pip install flask

# Run development server
python app.py
```

Server runs on `http://localhost:8080`

## 📋 Development Workflow

1. **Main Branch** - Protected, production code only
2. **Dev Branch** - Active development, feature integration
3. **Personal Branches** - Individual development work
   - `ma-ronnie-dev` - Ronnie's experiments
   - `ma-synclair-dev` - Synclair's experiments

### Branch Strategy

```bash
# Work on your personal branch
git checkout ma-ronnie-dev  # or ma-synclair-dev

# Make changes and commit
git add .
git commit -m "Add feature X"

# Push to your branch
git push origin ma-ronnie-dev

# When ready, merge to dev for testing
git checkout dev
git merge ma-ronnie-dev
git push origin dev

# After QA, merge dev to main
```

## 👥 Team

**Developer:** SimRobotics AI Agents  
**Contributors:** Ronnie Gaines, Synclair Gaines  
**Company:** SimRobotics Corp

## 🗺 Roadmap

### Phase 1: Core Features ✅
- [x] Basic Flask app structure
- [x] File upload system
- [x] Branch setup

### Phase 2: AI Integration (In Progress)
- [ ] Movie scene detection
- [ ] AI-powered summarization
- [ ] Character identification

### Phase 3: Animation Engine
- [ ] Animated slideshow generation
- [ ] Voiceover integration
- [ ] Export to video

### Phase 4: Deployment
- [ ] Azure deployment
- [ ] Database integration
- [ ] User authentication

## 📄 License

Proprietary - SimRobotics Corp © 2026

## 📞 Contact

For questions or support, contact: ronnie@simrobotics.com
