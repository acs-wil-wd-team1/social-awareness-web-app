#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run as root.' >&2; exit 1; }
# Never remove files while a paired backup or deployment is in progress.
exec 9>/run/lock/causeconnect-deploy.lock
flock -n -s 9 || exit 0
exec 8>/run/lock/causeconnect-backup.lock
flock -n 8 || exit 0
[[ -f /srv/causeconnect/current/backend/src/services/campaignImages.js ]] || exit 0
systemd-run --quiet --wait --pipe --collect --uid=causeconnect \
  --property=EnvironmentFile=/etc/causeconnect/app.env --property=UMask=0077 \
  --property=NoNewPrivileges=yes --property=ProtectHome=yes --property=PrivateTmp=yes \
  --property=ProtectSystem=strict --property=ReadWritePaths=/srv/causeconnect/shared/uploads \
  --property=MemoryMax=192M --property=RuntimeMaxSec=120 \
  /opt/node/bin/node /opt/causeconnect-host/prune-images.cjs
