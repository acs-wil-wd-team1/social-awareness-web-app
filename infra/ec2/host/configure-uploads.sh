#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run as root.' >&2; exit 1; }
[[ -f /etc/causeconnect/app.env && ! -L /etc/causeconnect/app.env ]] || { echo 'Existing application environment is required.' >&2; exit 1; }
for directory in /srv/causeconnect /srv/causeconnect/shared /srv/causeconnect/shared/uploads; do
  [[ ! -L "$directory" ]] || { echo 'Upload path must not contain symlinks.' >&2; exit 1; }
done
install -d -m 0755 -o root -g root /srv/causeconnect/shared
install -d -m 0700 -o causeconnect -g causeconnect /srv/causeconnect/shared/uploads
# Preserve every existing secret and setting; add only the bounded upload settings.
python3 - <<'PY'
import os
import tempfile
from pathlib import Path
path = Path('/etc/causeconnect/app.env')
source = path.read_text()
settings = {
    'CAMPAIGN_UPLOAD_DIR': '/srv/causeconnect/shared/uploads',
    'CAMPAIGN_UPLOAD_MAX_BYTES': '536870912',
    'CAMPAIGN_UPLOAD_MIN_FREE_BYTES': '2147483648',
}
lines = source.splitlines()
for key, expected in settings.items():
    matches = [line.split('=', 1)[1].strip().strip('"').strip("'") for line in lines if line.startswith(key + '=')]
    if len(matches) > 1:
        raise SystemExit('Duplicate upload setting; inspect the private environment before proceeding.')
    if matches:
        value = matches[0]
        if key == 'CAMPAIGN_UPLOAD_DIR' and value != expected:
            raise SystemExit('Existing upload directory differs; no storage was moved.')
        if key != 'CAMPAIGN_UPLOAD_DIR':
            if not value.isdigit() or int(value) < 1:
                raise SystemExit('Invalid existing upload capacity setting.')
            if key == 'CAMPAIGN_UPLOAD_MAX_BYTES' and int(value) > int(expected):
                raise SystemExit('Existing upload capacity exceeds this host limit.')
            if key == 'CAMPAIGN_UPLOAD_MIN_FREE_BYTES' and int(value) < int(expected):
                raise SystemExit('Existing free-space reserve is below this host limit.')
    else:
        lines.append(key + '=' + expected)
updated = '\n'.join(lines) + '\n'
if updated != source:
    fd, temporary = tempfile.mkstemp(prefix='.app-env-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as output:
            os.fchmod(output.fileno(), 0o600)
            output.write(updated)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
os.chmod(path, 0o600)
PY
echo 'Private persistent uploads configured; existing application secrets preserved.'
