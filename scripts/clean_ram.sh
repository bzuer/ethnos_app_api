#!/usr/bin/env bash

set -euo pipefail

log() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*"
}

if [ "$(id -u)" -ne 0 ]; then
  log "Skipping RAM cache drop; requires root privileges"
  exit 0
fi

log "Flushing filesystem buffers"
sync

log "Dropping page cache, dentries, and inodes"
echo 3 > /proc/sys/vm/drop_caches

log "RAM cleanup completed"
