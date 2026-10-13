#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run as root.' >&2; exit 1; }
[[ $# -eq 3 && "$3" == --accept-terms ]] || {
  echo "After the owner approves the Let's Encrypt subscriber agreement: enable-https.sh PUBLIC_IPV4 CONTACT_EMAIL --accept-terms" >&2
  exit 1
}
public_ip=$1
contact_email=$2
python3 -c 'import ipaddress,sys; a=ipaddress.ip_address(sys.argv[1]); assert a.version == 4 and a.is_global' "$public_ip"
[[ "$contact_email" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]] || { echo 'A valid certificate contact email is required.' >&2; exit 1; }
[[ -f /srv/causeconnect/current/frontend/dist/index.html ]] || { echo 'Deploy the application first.' >&2; exit 1; }
# Public port 80 must reach this host. This is the ONLY command that accepts CA terms.
/opt/certbot/bin/certbot certonly --non-interactive --agree-tos --email "$contact_email" \
  --webroot --webroot-path /var/www/acme --ip-address "$public_ip" \
  --preferred-profile shortlived --cert-name causeconnect-ip
install -m 0644 /opt/causeconnect-host/nginx-proxy.conf /etc/nginx/causeconnect-proxy.conf
install -d -m 0755 /etc/letsencrypt/renewal-hooks/deploy
install -m 0755 /opt/causeconnect-host/reload-nginx.sh /etc/letsencrypt/renewal-hooks/deploy/causeconnect-nginx
sed "s/__PUBLIC_IP__/$public_ip/g" /opt/causeconnect-host/nginx-https.conf > /etc/nginx/sites-available/causeconnect.next
cp -- /etc/nginx/sites-available/causeconnect /etc/nginx/sites-available/causeconnect.before-https
mv -- /etc/nginx/sites-available/causeconnect.next /etc/nginx/sites-available/causeconnect
if ! nginx -t; then
  mv -- /etc/nginx/sites-available/causeconnect.before-https /etc/nginx/sites-available/causeconnect
  echo 'HTTPS configuration rejected; previous site configuration restored.' >&2
  exit 1
fi
systemctl reload nginx
systemctl enable --now causeconnect-certbot.timer >/dev/null
curl --fail --silent --show-error --max-time 15 "https://$public_ip/" -o /dev/null
echo "HTTPS enabled at https://$public_ip/. Run certificate renewal dry-run and browser/API acceptance checks before sharing."
