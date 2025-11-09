#!/bin/bash

set -e

API_NAME="ethnos-api"
PID_FILE="/tmp/${API_NAME}.pid"
LOG_FILE="logs/server.log"
ENV_FILE="/etc/node-backend.env"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

load_env() {
    if [ ! -f "$ENV_FILE" ]; then
        error "Environment file ${ENV_FILE} not found"
        exit 1
    fi

    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
}

load_env
API_PORT="${PORT:-3000}"

is_running() {
    if [ -f "$PID_FILE" ]; then
        local pid=$(cat "$PID_FILE")
        if ps -p "$pid" > /dev/null 2>&1; then
            return 0
        else
            rm -f "$PID_FILE"
            return 1
        fi
    fi
    return 1
}

cleanup_ports() {
    local ports=("$API_PORT" "6379")
    
    for port in "${ports[@]}"; do
        log "Checking port $port..."
        
        local pids=$(lsof -ti:$port 2>/dev/null || true)
        
        if [ -n "$pids" ]; then
            warning "Found processes on port $port: $pids"
            
            for pid in $pids; do
                local process_info=$(ps -p $pid -o pid,ppid,cmd --no-headers 2>/dev/null || echo "Unknown process")
                log "Killing process: $process_info"
                
                kill $pid 2>/dev/null || true
                sleep 2
                
                if kill -0 $pid 2>/dev/null; then
                    warning "Force killing process $pid on port $port"
                    kill -9 $pid 2>/dev/null || true
                fi
            done
            
            sleep 1
            if lsof -i:$port &>/dev/null; then
                error "Failed to free port $port"
            else
                log "Port $port is now available"
            fi
        else
            log "Port $port is available"
        fi
    done
}

kill_all_processes() {
    log "Killing all related processes..."
    local patterns=("node.*ethnos" "npm.*start" "node.*app.js" "node.*src/app.js")
    
    for pattern in "${patterns[@]}"; do
        local pids=$(pgrep -f "$pattern" 2>/dev/null || true)
        if [ -n "$pids" ]; then
            warning "Killing processes matching '$pattern': $pids"
            echo $pids | xargs kill 2>/dev/null || true
            sleep 1
            echo $pids | xargs kill -9 2>/dev/null || true
        fi
    done
    
    cleanup_ports
}

clear_cache() {
    log "Clearing application cache and temporary files..."
    local cache_dirs=(
        ".npm"
        "node_modules/.cache"
        ".node_repl_history"
        ".v8flags.*"
    )
    
    local app_cache_dirs=(
        "logs/cache"
        "temp"
        "tmp"
        ".tmp"
        "uploads/temp"
        "uploads/tmp"
    )
    
    local template_patterns=(
        "*.tmp"
        "*.cache"
        "*.lock"
        ".DS_Store"
        "Thumbs.db"
    )
    
    for dir in "${cache_dirs[@]}"; do
        if [ -d "$dir" ]; then
            log "Removing Node.js cache directory: $dir"
            rm -rf "$dir"
        fi
    done
    
    for dir in "${app_cache_dirs[@]}"; do
        if [ -d "$dir" ]; then
            log "Removing application cache directory: $dir"
            rm -rf "$dir"
        fi
    done
    
    for pattern in "${template_patterns[@]}"; do
        if ls $pattern 1> /dev/null 2>&1; then
            log "Removing files matching pattern: $pattern"
            rm -f $pattern
        fi
    done
    
    if command -v npm &> /dev/null; then
        log "Clearing npm cache..."
        npm cache clean --force 2>/dev/null || true
    fi
    
    if command -v redis-cli &> /dev/null && pgrep redis-server > /dev/null; then
        log "Flushing Redis cache..."
        redis-cli FLUSHALL 2>/dev/null || warning "Could not flush Redis cache"
    fi
    local swagger_cache_files=(
        "swagger-output.json"
        "swagger-spec.json"
        ".swagger-codegen-ignore"
    )
    
    for file in "${swagger_cache_files[@]}"; do
        if [ -f "$file" ]; then
            log "Removing Swagger cache file: $file"
            rm -f "$file"
        fi
    done
    
    if [ -d "src/cache" ]; then
        log "Clearing application cache directory..."
        rm -rf src/cache/*
    fi
    
    if [ -d "logs" ]; then
        find logs -name "*.gz" -mtime +7 -delete 2>/dev/null || true
        log "Cleaned old compressed log files"
    fi

    local env_cache_dirs=(
        ".env.cache"
        ".env.local.cache"
        "config/cache"
    )
    
    for dir in "${env_cache_dirs[@]}"; do
        if [ -d "$dir" ]; then
            log "Removing environment cache: $dir"
            rm -rf "$dir"
        fi
    done
    
    log "Cache cleanup completed!"
}

force_clean_install() {
    log "Performing force clean installation..."
    
    if is_running; then
        stop_server
    fi
    
    kill_all_processes
    clear_cache
    
    if [ -f "package-lock.json" ]; then
        log "Removing package-lock.json for fresh dependency resolution..."
        rm -f package-lock.json
    fi
    
    if [ -d "node_modules" ]; then
        log "Removing node_modules directory..."
        rm -rf node_modules
    fi
    
    log "Clearing npm cache..."
    npm cache clean --force
    
    log "Installing dependencies from scratch..."
    npm install
    
    log "Force clean installation completed!"
}

hard_restart() {
    log "Performing hard restart with complete cache clearing..."
    
    if is_running; then
        stop_server
    fi
    
    kill_all_processes
    clear_cache
    sleep 3
    start_server
    
    log "Hard restart completed!"
}

start_server() {
    if is_running; then
        warning "Server is already running (PID: $(cat $PID_FILE))"
        return 1
    fi

    log "Starting ethnos.app API server..."
    if ! command -v node &> /dev/null; then
        error "Node.js is not installed"
        exit 1
    fi

    if ! command -v npm &> /dev/null; then
        error "npm is not installed"
        exit 1
    fi

    cleanup_ports
    log "Checking database connection..."
    # Create temporary MySQL config file
    MYSQL_CONFIG=$(mktemp)
    cat > "$MYSQL_CONFIG" <<EOF
[client]
host=${DB_HOST:-localhost}
port=${DB_PORT:-3306}
user=${DB_USER}
password=${DB_PASSWORD}
database=${DB_NAME:-data_db}
EOF
    
    if ! mysql --defaults-file="$MYSQL_CONFIG" -e "SELECT 1;" &> /dev/null; then
        rm -f "$MYSQL_CONFIG"
        error "Database connection failed"
        exit 1
    fi
    rm -f "$MYSQL_CONFIG"

    # Create logs directory
    mkdir -p logs

    # Start server in background
    nohup npm start > "$LOG_FILE" 2>&1 &
    local pid=$!
    echo $pid > "$PID_FILE"
    
    # Wait a moment and check if it started successfully
    sleep 3
    if is_running; then
        log "Server started successfully (PID: $pid)"
        log "API available at: http://localhost:$API_PORT"
        log "Health check: http://localhost:$API_PORT/health"
        log "Documentation: http://localhost:$API_PORT/docs"
        return 0
    else
        error "Failed to start server"
        if [ -f "$LOG_FILE" ]; then
            echo "Last 10 lines of log:"
            tail -10 "$LOG_FILE"
        fi
        return 1
    fi
}

stop_server() {
    if ! is_running; then
        warning "Server is not running"
        return 1
    fi

    local pid=$(cat "$PID_FILE")
    log "Stopping server (PID: $pid)..."
    
    kill "$pid"
    
    # Wait for graceful shutdown
    local count=0
    while [ $count -lt 10 ] && is_running; do
        sleep 1
        ((count++))
    done
    
    if is_running; then
        warning "Forcing server shutdown..."
        kill -9 "$pid"
        sleep 1
    fi
    
    rm -f "$PID_FILE"
    log "Server stopped successfully"
}

restart_server() {
    log "Restarting server..."
    stop_server
    kill_all_processes
    log "Clearing basic temporary files..."
    rm -f *.tmp *.lock 2>/dev/null || true
    
    sleep 2
    start_server
}

status_server() {
    if is_running; then
        local pid=$(cat "$PID_FILE")
        log "Server is running (PID: $pid)"
        
        # Test API endpoint
        if curl -s "http://localhost:$API_PORT/health" > /dev/null; then
            log "API is responding correctly"
        else
            warning "API is not responding"
        fi
        
        # Show memory usage
        local memory=$(ps -p "$pid" -o rss= | awk '{print $1/1024 " MB"}')
        log "Memory usage: $memory"
        
        return 0
    else
        warning "Server is not running"
        return 1
    fi
}

test_server() {
    log "Running API tests..."
    
    # Check if server is running, if not start it
    if ! is_running; then
        log "Starting server for tests..."
        start_server
        local started_for_test=true
    fi

    sleep 2

    echo ""
    log "=== Security Tests ==="
    
    echo "1. Security monitoring stats:"
    curl -s http://localhost:$API_PORT/security/stats | jq -r '.status // .message'
    
    echo -e "\n2. Rate limiting test (5 rapid requests):"
    for i in {1..5}; do
        curl -s "http://localhost:$API_PORT/search/works?q=test&limit=1" > /dev/null
        echo -n "."
    done
    echo " Done"
    
    echo ""
    log "=== API Endpoint Tests ==="
    
    echo "1. Health check:"
    curl -s http://localhost:$API_PORT/health | jq -r '.status'
    
    echo -e "\n2. Search works:"
    curl -s "http://localhost:$API_PORT/search/works?q=machine%20learning&limit=3" \
        | jq -r '.data | length'
    echo "Results found"
    
    echo -e "\n3. Get works:"
    curl -s "http://localhost:$API_PORT/works?limit=3" \
        | jq -r '.data | length'
    echo "Works retrieved"
    
    if [ "$started_for_test" = true ]; then
        echo ""
        log "Stopping server (was started for tests)..."
        stop_server
    fi
    
    log "Tests completed!"
}

show_logs() {
    if [ -f "$LOG_FILE" ]; then
        log "Showing last 50 lines of server logs:"
        tail -50 "$LOG_FILE"
    else
        warning "Log file not found: $LOG_FILE"
    fi
}

# Main script logic
case "${1:-}" in
    start)
        start_server
        ;;
    stop)
        stop_server
        ;;
    restart)
        restart_server
        ;;
    cleanup)
        kill_all_processes
        ;;
    clear-cache)
        clear_cache
        ;;
    clean-install)
        force_clean_install
        ;;
    hard-restart)
        hard_restart
        ;;
    status)
        status_server
        ;;
    test)
        test_server
        ;;
    logs)
        show_logs
        ;;
    *)
        echo "ethnos.app API Server Management"
        echo ""
        echo "Usage: $0 {start|stop|restart|cleanup|clear-cache|clean-install|hard-restart|status|test|logs}"
        echo ""
        echo "Commands:"
        echo "  start         - Start the API server"
        echo "  stop          - Stop the API server"
        echo "  restart       - Restart the API server (normal restart)"
        echo "  cleanup       - Force kill all related processes and free ports"
        echo "  clear-cache   - Clear all cache files and temporary data"
        echo "  clean-install - Force clean reinstallation (removes node_modules, clears cache)"
        echo "  hard-restart  - Complete restart with full cache clearing"
        echo "  status        - Show server status"
        echo "  test          - Run authentication and API tests"
        echo "  logs          - Show recent server logs"
        echo ""
        echo "Cache Management:"
        echo "  - clear-cache: Removes Node.js, Redis, Swagger, and application caches"
        echo "  - clean-install: Full dependency reinstallation from scratch"
        echo "  - hard-restart: Complete restart ensuring no cached templates/structures"
        echo ""
        echo "API Features:"
        echo "  - Rate limiting (configurável via /etc/node-backend.env):"
        echo "    * Geral (RATE_LIMIT_GENERAL) padrão 600/min"
        echo "    * Busca (RATE_LIMIT_SEARCH) padrão 120/min"
        echo "    * Métricas (RATE_LIMIT_METRICS) padrão 300/min (localhost bypass)"
        echo "    * Relacionais (RATE_LIMIT_RELATIONAL) padrão 240/min"
        echo "  - Speed limiting via express-slow-down (SLOW_DOWN_*)"
        echo "  - Endpoints internos exigem X-Access-Key (API_KEY)"
        echo ""
        exit 1
        ;;
esac

exit $?
