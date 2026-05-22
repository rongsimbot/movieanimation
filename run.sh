#!/bin/bash
# MovieAnimation.ai - Development & Production Runner
# Usage: ./run.sh [backend|frontend|all|setup|db|test|stop]

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
VENV_DIR="$PROJECT_DIR/venv"
PID_DIR="/tmp/movieanimation"

mkdir -p "$PID_DIR"

case "$1" in
    setup)
        echo "📦 Setting up MovieAnimation.ai..."
        
        # Python venv
        if [ ! -d "$VENV_DIR" ]; then
            python3 -m venv "$VENV_DIR"
        fi
        source "$VENV_DIR/bin/activate"
        
        # Backend deps
        echo "📦 Installing backend dependencies..."
        PYO3_USE_ABI3_FORWARD_COMPATIBILITY=1 pip install -q fastapi "uvicorn[standard]" psycopg2-binary python-jose[cryptography] bcrypt pydantic[email] slowapi httpx python-dotenv requests pyjwt
        
        # Frontend deps
        echo "📦 Installing frontend dependencies..."
        cd "$FRONTEND_DIR" && npm install --silent 2>&1 | tail -3
        
        # Database
        echo ""
        echo "🗄️  Database: make sure SSH tunnel is running:"
        echo "   ssh -L 5432:localhost:5432 -p 2222 -i ~/.ssh/id_rsa_auto -N simrobotics@localhost"
        echo ""
        echo "✅ Setup complete!"
        ;;
    db)
        echo "🗄️  Applying database schema..."
        pgrep -f "ssh.*-L 5432" > /dev/null || {
            echo "Starting SSH tunnel..."
            ssh -L 5432:localhost:5432 -p 2222 -i ~/.ssh/id_rsa_auto -N -o ServerAliveInterval=60 simrobotics@localhost &
            sleep 2
        }
        PGPASSWORD='SimData_Vector_2026!' psql -h localhost -U sim_admin -d movieanimation_db -f "$PROJECT_DIR/db/schema.sql" 2>&1
        echo "✅ Schema applied!"
        ;;
    backend)
        echo "🚀 Starting backend API on port 8001..."
        pgrep -f "ssh.*-L 5432" > /dev/null || {
            echo "Starting SSH tunnel..."
            ssh -L 5432:localhost:5432 -p 2222 -i ~/.ssh/id_rsa_auto -N -o ServerAliveInterval=60 simrobotics@localhost &
            sleep 2
        }
        source "$VENV_DIR/bin/activate" 2>/dev/null || true
        cd "$BACKEND_DIR"
        nohup python3 -m uvicorn main:app --host 0.0.0.0 --port 8001 --reload > /tmp/movieanimation_api.log 2>&1 &
        echo $! > "$PID_DIR/backend.pid"
        sleep 2
        echo "✅ Backend running at http://localhost:8001"
        echo "   API Docs: http://localhost:8001/api/docs"
        ;;
    frontend)
        echo "🚀 Starting frontend on port 3000..."
        cd "$FRONTEND_DIR"
        nohup npm run dev -- -p 3000 > /tmp/movieanimation_frontend.log 2>&1 &
        echo $! > "$PID_DIR/frontend.pid"
        sleep 3
        echo "✅ Frontend running at http://localhost:3000"
        ;;
    all)
        echo "🚀 Starting MovieAnimation.ai..."
        bash "$0" backend
        bash "$0" frontend
        echo ""
        echo "✅ MovieAnimation.ai is running:"
        echo "   Frontend: http://localhost:3000"
        echo "   Backend:  http://localhost:8001"
        echo "   API Docs: http://localhost:8001/api/docs"
        ;;
    stop)
        echo "🛑 Stopping MovieAnimation.ai..."
        if [ -f "$PID_DIR/backend.pid" ]; then
            kill $(cat "$PID_DIR/backend.pid") 2>/dev/null || true
            rm "$PID_DIR/backend.pid"
        fi
        if [ -f "$PID_DIR/frontend.pid" ]; then
            kill $(cat "$PID_DIR/frontend.pid") 2>/dev/null || true
            rm "$PID_DIR/frontend.pid"
        fi
        fuser -k 8001/tcp 2>/dev/null || true
        fuser -k 3000/tcp 2>/dev/null || true
        echo "✅ Stopped"
        ;;
    test)
        echo "🧪 Testing API endpoints..."
        API="http://localhost:8001"
        echo ""
        echo "--- Health ---"
        curl -s "$API/api/health" | python3 -m json.tool 2>/dev/null || echo "Backend not running"
        echo ""
        echo "--- Status ---"
        curl -s "$API/api/status" | python3 -m json.tool 2>/dev/null || echo "Backend not running"
        ;;
    status)
        echo "📊 MovieAnimation.ai Status:"
        echo ""
        if curl -s http://localhost:8001/api/health > /dev/null 2>&1; then
            echo "✅ Backend: RUNNING (http://localhost:8001)"
            curl -s http://localhost:8001/api/status | python3 -m json.tool 2>/dev/null | head -15
        else
            echo "❌ Backend: NOT RUNNING"
        fi
        echo ""
        if curl -s http://localhost:3000 > /dev/null 2>&1; then
            echo "✅ Frontend: RUNNING (http://localhost:3000)"
        else
            echo "❌ Frontend: NOT RUNNING"
        fi
        echo ""
        if pg_isready -h localhost -p 5432 > /dev/null 2>&1; then
            echo "✅ Database: CONNECTED"
        else
            echo "❌ Database: NOT CONNECTED (need SSH tunnel)"
        fi
        ;;
    *)
        echo "🎬 MovieAnimation.ai v0.1.0-beta"
        echo ""
        echo "Usage: $0 <command>"
        echo ""
        echo "Commands:"
        echo "  setup     - Install all dependencies"
        echo "  db        - Apply database schema"
        echo "  backend   - Start backend API (port 8001)"
        echo "  frontend  - Start frontend dev server (port 3000)"
        echo "  all       - Start both backend and frontend"
        echo "  stop      - Stop all services"
        echo "  test      - Run API connectivity tests"
        echo "  status    - Check running status"
        ;;
esac
