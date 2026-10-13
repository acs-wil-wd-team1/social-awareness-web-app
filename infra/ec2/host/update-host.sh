#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run as root.' >&2; exit 1; }
[[ $# -eq 3 && "$2" =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]{0,80}$ ]] || { echo 'Usage: update-host.sh EXTRACTED_PACKAGE RELEASE_ID EXISTING_PUBLIC_IPV4' >&2; exit 1; }
package_dir=$(realpath -- "$1")
public_ip=$3
[[ -x /opt/node/bin/node && -f /etc/causeconnect/app.env && -f /opt/causeconnect-host/verify-release.py ]] || { echo 'An existing CauseConnect host is required; this is not bootstrap.' >&2; exit 1; }
python3 /opt/causeconnect-host/verify-release.py --directory "$package_dir" --release-id "$2"
host_dir="$package_dir/infra/ec2/host"
[[ -d "$host_dir" && "$host_dir" != /opt/causeconnect-host ]] || { echo 'Use the extracted, reviewed release package.' >&2; exit 1; }
exec 9>/run/lock/causeconnect-deploy.lock
flock -n 9 || { echo 'Another deployment is running.' >&2; exit 1; }

# Refuse to replace a different/custom site or switch the existing public address.
python3 - "$public_ip" <<'PY'
import ipaddress
import re
import sys
from pathlib import Path
address = str(ipaddress.IPv4Address(sys.argv[1]))
site = Path('/etc/nginx/sites-available/causeconnect')
if site.is_symlink() or not site.is_file():
    raise SystemExit('Expected regular CauseConnect site configuration.')
source = site.read_text()
names = re.findall(r'^\s*server_name\s+([^;]+);', source, re.M)
if len(names) != 2 or any(name.strip() != address for name in names):
    raise SystemExit('Address or existing site shape differs; inspect before updating.')
if 'ssl_certificate /etc/letsencrypt/live/causeconnect-ip/fullchain.pem;' not in source or 'root /srv/causeconnect/current/frontend/dist;' not in source:
    raise SystemExit('Existing HTTPS site does not match this application.')
PY

for script in "$host_dir/"*.sh; do bash -n "$script"; done
install -m 0755 "$host_dir/"*.sh /opt/causeconnect-host/
install -m 0644 "$host_dir/"*.py "$host_dir/"*.cjs "$host_dir/"*.conf "$host_dir/"*.service "$host_dir/"*.timer "$host_dir/"*.sql /opt/causeconnect-host/
/opt/causeconnect-host/configure-uploads.sh
install -m 0644 /opt/causeconnect-host/causeconnect.service /opt/causeconnect-host/causeconnect-backup.service \
  /opt/causeconnect-host/causeconnect-backup.timer /opt/causeconnect-host/causeconnect-image-cleanup.service \
  /opt/causeconnect-host/causeconnect-image-cleanup.timer /etc/systemd/system/
install -m 0644 /opt/causeconnect-host/nginx-proxy.conf /etc/nginx/causeconnect-proxy.conf
old_site=$(mktemp /etc/nginx/sites-available/.causeconnect-before-uploads.XXXXXX)
next_site=$(mktemp /etc/nginx/sites-available/.causeconnect-next.XXXXXX)
cp -- /etc/nginx/sites-available/causeconnect "$old_site"
sed "s/__PUBLIC_IP__/$public_ip/g" /opt/causeconnect-host/nginx-https.conf > "$next_site"
chmod 0644 "$next_site"
mv -- "$next_site" /etc/nginx/sites-available/causeconnect
if ! nginx -t; then
  cp -- "$old_site" /etc/nginx/sites-available/causeconnect
  echo 'New Nginx configuration failed; previous site restored. Inspect before deploying.' >&2
  exit 1
fi
systemctl daemon-reload
systemctl reload nginx
echo 'Existing host files updated. No API restart, migration, AWS resource or certificate change was performed.'
echo 'Deploy the same verified release next; its activation starts the image cleanup timer.'
