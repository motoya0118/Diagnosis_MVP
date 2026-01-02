#!/bin/bash
set -euo pipefail

HOSTS_FILE="/etc/hosts"
TEMP_FILE="$(mktemp)"

if ! grep -q "admin.localhost" "$HOSTS_FILE"; then
  echo "[INFO] No admin.localhost entry found in $HOSTS_FILE"
  exit 0
fi

echo "[INFO] Removing admin.localhost entry (sudo required)"
sudo sh -c "grep -v 'admin.localhost' '$HOSTS_FILE' > '$TEMP_FILE' && mv '$TEMP_FILE' '$HOSTS_FILE'"
echo "[OK] Removed admin.localhost entry"
