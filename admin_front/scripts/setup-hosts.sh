#!/bin/bash
set -euo pipefail

HOSTS_FILE="/etc/hosts"
ENTRY="127.0.0.1 admin.localhost"
COMMENT="# Admin front local dev"

if grep -q "admin.localhost" "$HOSTS_FILE"; then
  echo "[INFO] hosts entry already present: $ENTRY"
  exit 0
fi

echo "[INFO] Adding admin front hosts entry (sudo required)"
sudo sh -c "printf '\n%s\n%s\n' '$COMMENT' '$ENTRY' >> '$HOSTS_FILE'"
echo "[OK] Added $ENTRY to $HOSTS_FILE"
