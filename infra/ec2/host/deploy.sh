#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run as root.' >&2; exit 1; }
[[ $# -eq 2 && "$2" =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]{0,80}$ ]] || { echo 'Usage: deploy.sh EXTRACTED_PACKAGE RELEASE_ID' >&2; exit 1; }
package_dir=$(realpath -- "$1")
release_dir="/srv/causeconnect/releases/$2"
[[ -f "$package_dir/backend/package-lock.json" && -f "$package_dir/frontend/dist/index.html" && -f "$package_dir/release.json" ]] || { echo 'Incomplete app package.' >&2; exit 1; }
python3 /opt/causeconnect-host/verify-release.py --directory "$package_dir" --release-id "$2"
[[ ! -e "$package_dir/backend/.env" && ! -e "$package_dir/backend/node_modules" ]] || { echo 'Do not package secrets or local node_modules.' >&2; exit 1; }
[[ -z "$(find "$package_dir/backend" "$package_dir/frontend/dist" -type l -print -quit)" ]] || { echo 'Release package must not contain symlinks.' >&2; exit 1; }
exec 9>/run/lock/causeconnect-deploy.lock
flock -n 9 || { echo 'Another deployment is running.' >&2; exit 1; }

/opt/causeconnect-host/init-database.sh
/opt/causeconnect-host/configure-uploads.sh
if [[ ! -d "$release_dir" ]]; then
  stage_dir=$(mktemp -d /srv/causeconnect/releases/.stage-XXXXXX)
  cp -a "$package_dir/backend" "$stage_dir/backend"
  cp -- "$package_dir/release.json" "$stage_dir/release.json"
  install -d -m 0755 "$stage_dir/frontend"
  cp -a "$package_dir/frontend/dist" "$stage_dir/frontend/dist"
  chown -R causeconnect-build:causeconnect-build "$stage_dir"
  chmod 0755 "$stage_dir"
  systemd-run --quiet --wait --pipe --collect --uid=causeconnect-build \
    --property=NoNewPrivileges=yes --property=PrivateTmp=yes --property=MemoryMax=512M \
    --setenv=HOME=/var/cache/causeconnect-build --setenv=PATH=/opt/node/bin:/usr/bin:/bin \
    --working-directory="$stage_dir/backend" \
    /opt/node/bin/npm ci --include=dev --include=optional --ignore-scripts --no-audit --no-fund
  # Sharp's Linux optional binaries must decode successfully before touching MySQL.
  systemd-run --quiet --wait --pipe --collect --uid=causeconnect-build \
    --property=NoNewPrivileges=yes --property=PrivateTmp=yes --property=MemoryMax=192M \
    /opt/node/bin/node /opt/causeconnect-host/check-images.cjs "$stage_dir/backend"
  # Migration tools exist only in staging, with separate schema credentials.
  # MySQL DDL may commit before a failure: never undo or restore automatically.
  /opt/causeconnect-host/backup.sh --deploy-lock-held
  systemd-run --quiet --wait --pipe --collect --uid=causeconnect-migrate \
    --property=NoNewPrivileges=yes --property=PrivateTmp=yes \
    --property=EnvironmentFile=/etc/causeconnect/migrations.env \
    --setenv=PATH=/opt/node/bin:/usr/bin:/bin --working-directory="$stage_dir/backend" \
    /opt/node/bin/node node_modules/sequelize-cli/lib/sequelize db:migrate --env production
  mysql causeconnect < /opt/causeconnect-host/categories.sql
  systemd-run --quiet --wait --pipe --collect --uid=causeconnect-build \
    --property=NoNewPrivileges=yes --property=PrivateTmp=yes --property=MemoryMax=512M \
    --setenv=HOME=/var/cache/causeconnect-build --setenv=PATH=/opt/node/bin:/usr/bin:/bin \
    --working-directory="$stage_dir/backend" \
    /opt/node/bin/npm prune --omit=dev --ignore-scripts --no-audit --no-fund
  [[ ! -d "$stage_dir/backend/node_modules/nodemon" && ! -d "$stage_dir/backend/node_modules/sequelize-cli" ]] || {
    echo 'Development tools remain installed. Refusing to publish this release.' >&2; exit 1;
  }
  systemd-run --quiet --wait --pipe --collect --uid=causeconnect \
    --property=NoNewPrivileges=yes --property=EnvironmentFile=/etc/causeconnect/app.env \
    /opt/node/bin/node /opt/causeconnect-host/check-database.cjs "$stage_dir/backend"
  chown -R root:root "$stage_dir"
  chmod -R go-w "$stage_dir"
  printf 'migration-and-runtime-ready-v1\n' > "$stage_dir/.deployment-complete"
  chmod 0444 "$stage_dir/.deployment-complete"
  mv -- "$stage_dir" "$release_dir"
else
  [[ -f "$release_dir/.deployment-complete" ]] || { echo 'Incomplete named release. Inspect it before retrying.' >&2; exit 1; }
  cmp -- "$package_dir/release.json" "$release_dir/release.json"
  diff -qr --exclude=node_modules "$package_dir/backend" "$release_dir/backend" >/dev/null
  diff -qr "$package_dir/frontend/dist" "$release_dir/frontend/dist" >/dev/null
fi

systemd-run --quiet --wait --pipe --collect --uid=causeconnect \
  --property=NoNewPrivileges=yes --property=EnvironmentFile=/etc/causeconnect/app.env \
  /opt/node/bin/node /opt/causeconnect-host/check-database.cjs "$release_dir/backend"

systemctl enable causeconnect.service >/dev/null
# shellcheck source=/dev/null
source /opt/causeconnect-host/activate-release.sh
activate_release "$release_dir"
nginx -t
systemctl reload nginx
systemctl enable --now causeconnect-backup.timer >/dev/null
systemctl enable --now causeconnect-image-cleanup.timer >/dev/null
echo "Release $2 installed. Database connectivity and local API health passed. Public HTTPS/browser verification is still required."
