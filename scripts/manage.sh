#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_SCRIPT="$ROOT_DIR/server.sh"
DATA_CHECK_SCRIPT="$ROOT_DIR/scripts/check-data-integrity.js"
# Canonical Sphinx configuration (consolidated)
SPHINX_CONFIG="${SPHINX_CONFIG:-$ROOT_DIR/config/sphinx-unified.conf}"
SPHINX_PID_FILE="$ROOT_DIR/logs/sphinx.pid"
SPHINX_RUNTIME_DIR="${SPHINX_RUNTIME_DIR:-$ROOT_DIR/runtime/sphinx}"
SPHINX_INDEX_USER="${SPHINX_INDEX_USER:-server}"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
  echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $*"
}

warn() {
  echo -e "${YELLOW}[WARN]${NC} $*" >&2
}

err() {
  echo -e "${RED}[ERROR]${NC} $*" >&2
}

require_command() {
  if ! command -v "$1" &>/dev/null; then
    err "Required command '$1' not found in PATH"
    exit 1
  fi
}

ensure_sphinx_runtime_dirs() {
  mkdir -p "$SPHINX_RUNTIME_DIR" "$SPHINX_RUNTIME_DIR/binlog"
  chmod 750 "$SPHINX_RUNTIME_DIR" "$SPHINX_RUNTIME_DIR/binlog" 2>/dev/null || warn "Could not set restrictive permissions on $SPHINX_RUNTIME_DIR"

  if [ "$(id -u)" -eq 0 ] && id "$SPHINX_INDEX_USER" >/dev/null 2>&1; then
    chown "$SPHINX_INDEX_USER":"$SPHINX_INDEX_USER" "$SPHINX_RUNTIME_DIR" "$SPHINX_RUNTIME_DIR/binlog" 2>/dev/null || warn "Could not change ownership of $SPHINX_RUNTIME_DIR to $SPHINX_INDEX_USER"
  fi
}

ensure_sphinx_log_dir() {
  mkdir -p "$ROOT_DIR/logs"
  chmod 750 "$ROOT_DIR/logs" 2>/dev/null || warn "Could not set restrictive permissions on $ROOT_DIR/logs"

  if [ "$(id -u)" -eq 0 ] && id "$SPHINX_INDEX_USER" >/dev/null 2>&1; then
    chown -R "$SPHINX_INDEX_USER":"$SPHINX_INDEX_USER" "$ROOT_DIR/logs" 2>/dev/null || warn "Could not change ownership of $ROOT_DIR/logs to $SPHINX_INDEX_USER"
  fi

  if [ ! -w "$ROOT_DIR/logs" ]; then
    err "Sphinx log directory $ROOT_DIR/logs is not writable. Adjust permissions, e.g.: sudo chown -R $SPHINX_INDEX_USER:$SPHINX_INDEX_USER $ROOT_DIR/logs"
    exit 1
  fi
}

require_server_index_privilege() {
  local cmd_ref=${1:-index}
  local current_user
  current_user=$(id -un)

  if [ "$current_user" != "$SPHINX_INDEX_USER" ]; then
    err "Full Sphinx indexing must be executed as '$SPHINX_INDEX_USER' (current: '$current_user')."
    err "Re-run using: sudo -u $SPHINX_INDEX_USER $(basename "$0") $cmd_ref"
    exit 1
  fi
}

cmd_deploy() {
  log "Starting deploy sequence"

  if [ ! -x "$SERVER_SCRIPT" ]; then
    err "server.sh not executable or missing"
    exit 1
  fi

  log "Stopping existing server (if running)"
  if command -v pm2 >/dev/null 2>&1; then
    pm2 stop ethnos-api || true
  else
    "$SERVER_SCRIPT" stop || true
  fi

  log "Clearing caches"
  "$SERVER_SCRIPT" clear-cache || true

  log "Installing dependencies"
  npm install --no-fund

  log "Generating documentation cache"
  npm run docs:generate >/dev/null 2>&1 || warn "Swagger generation failed; continuing"

  log "Rebuilding Sphinx indexes"
  cmd_index

  log "Running full endpoint test suite"
  npm run test

  log "Restarting server"
  if command -v pm2 >/dev/null 2>&1; then
    pm2 restart ethnos-api --update-env || pm2 start "$ROOT_DIR/ecosystem.config.js" --env production
    pm2 save || true
  else
    "$SERVER_SCRIPT" restart
  fi

  log "Deploy completed"
}

cmd_start() {
  if command -v pm2 >/dev/null 2>&1; then
    log "Starting via PM2 (production)"
    pm2 start "$ROOT_DIR/ecosystem.config.js" --env production
    pm2 save || true
  else
    "$SERVER_SCRIPT" start
  fi
}

cmd_stop() {
  if command -v pm2 >/dev/null 2>&1; then
    log "Stopping via PM2"
    pm2 stop ethnos-api || true
    pm2 save || true
  else
    "$SERVER_SCRIPT" stop
  fi
}

cmd_restart() {
  if command -v pm2 >/dev/null 2>&1; then
    log "Restarting via PM2 (update env)"
    pm2 restart ethnos-api --update-env || pm2 start "$ROOT_DIR/ecosystem.config.js" --env production
    pm2 save || true
  else
    "$SERVER_SCRIPT" restart
  fi
}

cmd_index() {
  require_server_index_privilege index
  require_command indexer
  if [ ! -f "$SPHINX_CONFIG" ]; then
    err "Sphinx configuration not found at $SPHINX_CONFIG"
    exit 1
  fi

  ensure_sphinx_runtime_dirs
  log "Running Sphinx indexer"
  indexer --config "$SPHINX_CONFIG" --rotate --all
  log "Sphinx indexes rebuilt"
}

cmd_index_fast() {
  require_command indexer
  if [ ! -f "$SPHINX_CONFIG" ]; then
    err "Sphinx configuration not found at $SPHINX_CONFIG"
    exit 1
  fi
  ensure_sphinx_runtime_dirs
  log "Running Sphinx indexer (fast)"
  # Only index existing fast targets (venues_metrics_poc removed in unified config)
  indexer --config "$SPHINX_CONFIG" --rotate works_poc persons_poc || {
    warn "Fast index failed; falling back to --all";
    indexer --config "$SPHINX_CONFIG" --rotate --all;
  }
  log "Sphinx fast indexes rebuilt"
}

cmd_sphinx_start() {
  require_command searchd
  ensure_sphinx_log_dir
  ensure_sphinx_runtime_dirs
  
  # Detect port conflicts before starting
  local in_use_pid=
  in_use_pid=$(ss -lntp 2>/dev/null | awk '/:9312|:9306/ {if (match($0, /pid=([0-9]+)/, m)) {print m[1]; exit}}') || true
  if [ -n "${in_use_pid:-}" ]; then
    warn "Ports 9312/9306 already bound by PID ${in_use_pid}."
    if [ "${1:-}" = "--force" ]; then
      warn "--force supplied: attempting to stop existing searchd/process."
      if kill -0 "$in_use_pid" 2>/dev/null; then
        kill "$in_use_pid" || true
        sleep 1
        if kill -0 "$in_use_pid" 2>/dev/null; then
          warn "Process still alive; sending SIGKILL."
          kill -9 "$in_use_pid" || true
        fi
      fi
    else
      err "Port in use. Use: $(basename "$0") sphinx stop  OR  $(basename "$0") sphinx start --force"
      return 1
    fi
  fi
  
  if [ -f "$SPHINX_PID_FILE" ] && ps -p "$(cat "$SPHINX_PID_FILE" 2>/dev/null)" >/dev/null 2>&1; then
    warn "searchd already running (PID: $(cat "$SPHINX_PID_FILE"))"
    return 0
  fi
  log "Starting searchd with $SPHINX_CONFIG"
  searchd --config "$SPHINX_CONFIG" || {
    err "Failed to start searchd"; return 1;
  }
  sleep 1
  if [ -f "$SPHINX_PID_FILE" ]; then
    log "searchd started (PID: $(cat "$SPHINX_PID_FILE"))"
  else
    warn "PID file not found; verifying process via ports"
    ss -lnt | awk 'NR==1 || /9306|9312/' || true
  fi
}

cmd_sphinx_stop() {
  require_command searchd
  local pid=""
  if [ -f "$SPHINX_PID_FILE" ]; then
    pid=$(cat "$SPHINX_PID_FILE" 2>/dev/null || true)
    if [ -n "$pid" ]; then
      log "Stopping searchd (PID: $pid)"
    fi
  else
    warn "PID file not found; attempting graceful stop via config"
  fi

  # Try graceful stop via searchd
  searchd --config "$SPHINX_CONFIG" --stopwait || searchd --config "$SPHINX_CONFIG" --stop || true
  sleep 1

  # If still running (or no pid file), try to detect by ports
  if [ -z "$pid" ] || ps -p "$pid" >/dev/null 2>&1; then
    # Port-based detection
    local port_pid=""
    port_pid=$(ss -lntp 2>/dev/null | awk '/:9312|:9306/ {if (match($0, /pid=([0-9]+)/, m)) {print m[1]; exit}}') || true
    if [ -z "$port_pid" ]; then
      # Fallback by process name + config
      port_pid=$(pgrep -f "searchd.*$(basename "$SPHINX_CONFIG")" || true)
    fi
    if [ -n "$port_pid" ]; then
      warn "Force killing searchd/process holding ports (PID: $port_pid)"
      kill "$port_pid" 2>/dev/null || true
      sleep 1
      if kill -0 "$port_pid" 2>/dev/null; then
        warn "Still alive; sending SIGKILL (PID: $port_pid)"
        kill -9 "$port_pid" 2>/dev/null || true
      fi
    fi
  fi

  # Cleanup PID file if present and process gone
  if [ -f "$SPHINX_PID_FILE" ]; then
    local curpid
    curpid=$(cat "$SPHINX_PID_FILE" 2>/dev/null || true)
    if [ -n "$curpid" ] && ! ps -p "$curpid" >/dev/null 2>&1; then
      rm -f "$SPHINX_PID_FILE" || true
    fi
  fi
  log "searchd stopped"
}

cmd_sphinx_status() {
  if [ -f "$SPHINX_PID_FILE" ] && ps -p "$(cat "$SPHINX_PID_FILE")" >/dev/null 2>&1; then
    log "searchd running (PID: $(cat "$SPHINX_PID_FILE"))"
  else
    warn "searchd not running"
  fi
  ss -lnt | awk 'NR==1 || /9306|9312/' || true
}

cmd_test_endpoints() {
  log "Executing endpoint regression suite"
  npm run test
}

cmd_test_data() {
  require_command node
  if [ ! -f "$DATA_CHECK_SCRIPT" ]; then
    err "Data integrity script missing at $DATA_CHECK_SCRIPT"
    exit 1
  fi

  log "Validating database structures"
  node "$DATA_CHECK_SCRIPT"
}

usage() {
  cat <<USAGE
Ethnos unified control script

Usage: $(basename "$0") <command> [options]

Commands:
  deploy                 Stop, clear caches, reinstall deps, reindex Sphinx, test, and restart
  start                  Start the API server
  stop                   Stop the API server
  restart                Restart the API server
  index                  Rebuild Sphinx indexes (requires indexer)
  index:fast             Rebuild only works/persons indexes
  sphinx start|stop|status  Manage searchd lifecycle (use `sphinx start --force` to kill port holders)
  test --endpoints       Run Jest endpoint suite
  test --data            Validate required tables, views, and indexes in the database

Examples:
  $(basename "$0") deploy
  $(basename "$0") test --endpoints
  $(basename "$0") test --data
USAGE
}

main() {
  local cmd=${1:-}
  shift || true

  case "$cmd" in
    deploy)
      cmd_deploy
      ;;
    start)
      cmd_start
      ;;
    stop)
      cmd_stop
      ;;
    restart)
      cmd_restart
      ;;
    index)
      cmd_index
      ;;
    index:fast)
      cmd_index_fast
      ;;
    sphinx)
      # Subcommands for Sphinx lifecycle; pass through extra args to handlers
      case "${1:-}" in
        start)
          shift || true
          cmd_sphinx_start "$@"
          ;;
        stop)
          shift || true
          cmd_sphinx_stop "$@"
          ;;
        status)
          shift || true
          cmd_sphinx_status "$@"
          ;;
        *) usage; exit 1 ;;
      esac
      ;;
    test)
      case "${1:-}" in
        --endpoints)
          cmd_test_endpoints
          ;;
        --data)
          cmd_test_data
          ;;
        *)
          usage
          exit 1
          ;;
      esac
      ;;
    help|--help|-h|'')
      usage
      ;;
    *)
      err "Unknown command: $cmd"
      usage
      exit 1
      ;;
  esac
}

main "$@"
