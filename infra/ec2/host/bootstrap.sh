#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run as root.' >&2; exit 1; }
# shellcheck source=/dev/null
source /etc/os-release
[[ "$ID:$VERSION_ID:$(uname -m)" == ubuntu:24.04:x86_64 ]] || { echo 'Ubuntu 24.04 x86_64 is required.' >&2; exit 1; }
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends nginx mysql-server python3-venv curl ca-certificates xz-utils openssl unzip unattended-upgrades

# Pin and check the upstream archive; never pipe downloaded code into a shell.
node_version=22.23.2
node_sha256=d60acfe00a2932254bb0ad20e01b0d74397a0875595de719654b214f4b03f307
if [[ ! -x /opt/node/bin/node ]] || [[ "$(/opt/node/bin/node --version)" != "v$node_version" ]]; then
  download_dir=$(mktemp -d /var/tmp/causeconnect-node.XXXXXX)
  trap 'rm -f "$download_dir/node.tar.xz"; rmdir "$download_dir"' EXIT
  curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
    "https://nodejs.org/dist/v$node_version/node-v$node_version-linux-x64.tar.xz" -o "$download_dir/node.tar.xz"
  printf '%s  %s\n' "$node_sha256" "$download_dir/node.tar.xz" | sha256sum --check --status
  tar -xJf "$download_dir/node.tar.xz" -C /opt
  ln -sfn "/opt/node-v$node_version-linux-x64" /opt/node
fi
for command in node npm npx; do ln -sfn "/opt/node/bin/$command" "/usr/local/bin/$command"; done

for service_user in causeconnect causeconnect-build causeconnect-migrate; do
  id "$service_user" >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin "$service_user"
done
install -d -m 0755 /srv/causeconnect/releases /opt/causeconnect-host /var/www/acme
install -d -m 0700 /etc/causeconnect /var/backups/causeconnect
install -d -m 0750 -o causeconnect-build -g causeconnect-build /var/cache/causeconnect-build
python3 -m venv /opt/certbot
/opt/certbot/bin/pip install --disable-pip-version-check 'certbot==5.4.0'

host_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
if [[ "$host_dir" != /opt/causeconnect-host ]]; then
  install -m 0755 "$host_dir/"*.sh /opt/causeconnect-host/
  install -m 0644 "$host_dir/"*.py "$host_dir/"*.cjs "$host_dir/"*.conf "$host_dir/"*.service "$host_dir/"*.timer "$host_dir/"*.sql /opt/causeconnect-host/
fi
install -m 0644 "$host_dir/mysql.conf" /etc/mysql/mysql.conf.d/zz-causeconnect.cnf
if [[ ! -f /etc/nginx/sites-available/causeconnect ]]; then
  install -m 0644 "$host_dir/nginx-http.conf" /etc/nginx/sites-available/causeconnect
fi
ln -sfn /etc/nginx/sites-available/causeconnect /etc/nginx/sites-enabled/causeconnect
if [[ -L /etc/nginx/sites-enabled/default ]]; then unlink /etc/nginx/sites-enabled/default; fi
install -m 0644 "$host_dir/causeconnect.service" "$host_dir/causeconnect-backup.service" "$host_dir/causeconnect-backup.timer" \
  "$host_dir/causeconnect-certbot.service" "$host_dir/causeconnect-certbot.timer" \
  "$host_dir/causeconnect-image-cleanup.service" "$host_dir/causeconnect-image-cleanup.timer" /etc/systemd/system/
install -d -m 0755 /etc/systemd/journald.conf.d
printf '[Journal]\nSystemMaxUse=100M\nRuntimeMaxUse=30M\nMaxRetentionSec=7day\n' > /etc/systemd/journald.conf.d/causeconnect.conf
systemctl daemon-reload
systemctl restart mysql systemd-journald
nginx -t
systemctl enable --now mysql nginx
systemctl reload nginx
echo 'Host dependencies installed. Existing site configuration retained. No app secrets or accounts were created.'
