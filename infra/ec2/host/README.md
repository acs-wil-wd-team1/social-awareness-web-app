# Single-server host package

Target: Ubuntu 24.04 x86_64, 2 GiB memory, encrypted persistent disk. The frontend,
Express API and MySQL run on one host. Only Nginx ports 80 and 443 need public
access. Port 80 serves certificate challenges and a 503 until HTTPS is enabled;
afterwards it redirects to HTTPS. Neither API port 3000 nor MySQL port 3306 is public.

This is the live Stage 3 host layout under `/srv/causeconnect/`. The older
`infra/nginx/` examples and `/var/www/causeconnect/` frontend-only preview steps
are retained for historical reference; do not install them over this live site.

## Installation order

Upload the reviewed package through the approved private artifact location and
verify its SHA256 before extraction. It contains `backend/`, the **live-mode**
`frontend/dist/`, `release.json`, and this `infra/ec2/host/` directory. Do not package `.env`,
`node_modules`, demo-mode output or credentials.

```sh
sudo bash /path/to/package/infra/ec2/host/bootstrap.sh
sudo bash /path/to/package/infra/ec2/host/deploy.sh /path/to/package RELEASE_ID
```

`bootstrap.sh` installs Ubuntu packages, Node 22.23.2 (pinned SHA256) and Certbot
5.4.0 in its own virtual environment. It does not generate credentials or accept
certificate terms. Repeat runs preserve the existing Nginx site configuration.

`deploy.sh` creates the database on the first run, preserves its generated secrets
on later runs, installs dependencies as an unprivileged build user, applies all
Sequelize migrations as a separate migration account, and adds the four categories.
It then removes development dependencies and verifies native password hashing
before publishing an immutable release. Linux optional dependencies are installed
without lifecycle scripts; JPEG, PNG and WebP round trips must pass **before** backup
or migration. Neither nodemon nor Sequelize CLI remains
in the live release; a completed release can be reused without reinstalling tools.
It **never runs the demo seeder** or creates known-password accounts. Runtime DB
access is limited to SELECT, INSERT, UPDATE and DELETE. Secret files under
`/etc/causeconnect/` are root-readable only; systemd supplies the runtime environment.

### Update the existing host without bootstrap

Use the newly reviewed archive and its matching release ID. Verify the downloaded
archive against the approved SHA256 and extract into a fresh directory first; do
not reuse or overwrite an old extracted package. Then use the **existing** reserved
public IPv4, not a new address:

```sh
sudo bash /path/to/package/infra/ec2/host/update-host.sh /path/to/package RELEASE_ID EXISTING_PUBLIC_IPV4
sudo /opt/causeconnect-host/deploy.sh /path/to/package RELEASE_ID
```

The update helper verifies the package with the installed release verifier, checks
that the current HTTPS site belongs to that exact IP/application, installs the
reviewed host helpers/units and tests Nginx before reloading it. It does not run
bootstrap, install OS packages, change certificates, recreate MySQL, reset secrets
or create AWS resources. The existing EC2/disk/IP remain unchanged. It preserves
the previous site file and restores it if the Nginx check fails. Deployment and
public acceptance remain separate steps.

### Private upload storage

Uploads live outside releases at `/srv/causeconnect/shared/uploads`, mode `0700`,
owned by `causeconnect`. No Nginx alias exposes that directory. The API's read-only
systemd sandbox permits writes only there; switching or rolling back code does not
move/delete photos. `configure-uploads.sh` adds the fixed directory, a 512 MiB
upload cap and a 2 GiB free-space reserve to `app.env` without printing or changing
existing secrets. It rejects a different existing upload path rather than moving data.

The review-hardening source also bounds each owner's retained photos: default
20 files/50 MiB, using `CAMPAIGN_UPLOAD_OWNER_MAX_PHOTOS` (1–100) and
`CAMPAIGN_UPLOAD_OWNER_MAX_BYTES` (1–256 MiB). Attached and cleanup-pending images
count; no attached files are purged to make space. These new source safeguards
need a reviewed deployment before they are live.

Only `/api/campaign-images` gets Nginx's 6 MiB multipart ceiling; Express still
enforces the 5,000,000-byte photo limit. Uploads are limited to 3/minute per IP with
a burst of 4. Other API bodies keep the 1 MiB ceiling. Image content always passes
through backend permission checks, not static serving. Its signed query strings
are not written to access/error request logs; other HTTPS access logs also omit
query strings and referrers. Check protected application logs for API failures.

The hourly cleanup timer removes at most 100 expired, unattached image records/files
per run. It never removes attached campaign photos, uses the runtime environment
and `causeconnect` user, and skips deployment/backup windows. Storage exhaustion
returns an error; it does not delete campaign images to make room. Review disk usage
before increasing capacity or adding storage.

After the owner approves certificate registration and the subscriber agreement:

```sh
sudo /opt/causeconnect-host/enable-https.sh PUBLIC_IPV4 CONTACT_EMAIL --accept-terms
sudo /opt/certbot/bin/certbot renew --dry-run --cert-name causeconnect-ip
```

The IP must be this host's reserved public IPv4 address. Short-lived IP certificates
expire in approximately six days; the renewal timer runs twice daily. Verify the
dry-run, timer and reload hook before handing out the URL. Check them again if the
IP, security group, DNS/networking or certificate configuration changes.

An approved dedicated admin can be created interactively:

```sh
sudo /opt/causeconnect-host/create-admin.sh --approved
```

It asks privately for a new password, refuses if an admin already exists, and does
not promote or overwrite an existing user. Normal testers register through the
app. Share admin credentials only through an agreed private channel.

## Acceptance checks

- Confirm MySQL and Node listen on loopback only; external 3000/3306 must be closed.
- Check HTTPS certificate validity, HTTP redirect and frontend route refreshes.
- Check real registration, valid/invalid login, logout and post-logout rejection.
- Submit a text campaign, inspect it as its owner, approve it as admin and verify
  public visibility. A pending campaign must stay unavailable publicly.
- Verify API responses are never cached. Authentication requests are rate limited
  by client IP (registration 5/minute, login 10/minute, with short bursts).
- Test real photo upload, pending-image isolation, approval delivery, replacement,
  removal, logout/suspension revocation, and the upload rate/body limits. Host setup
  alone is not evidence that every feature/API is connected.

## Backups and rollback

Each deployment takes a paired DB/upload snapshot **before** migration. During the
snapshot the **whole API stops: both reads and writes are unavailable**, not just
submissions. The static frontend can still load but its API calls cannot succeed.
The API restarts even when backup fails; cleanup is
locked out so database rows and image files match. The daily timer uses the same
procedure, so expect brief daily downtime on this single server. The reviewed
source timer schedules 16:00 UTC with up to 30 minutes' jitter: 03:00–03:30 AEDT or
02:00–02:30 AEST the following morning in Sydney. `Persistent=true` can run a missed
backup after boot, outside that window. This source timer change is not a claim
that the existing host has already been updated. Each `.tar.gz`
contains `database.sql.gz` and `uploads/`. The newest seven paired snapshots stay
in `/var/backups/causeconnect/` (root only); previous SQL-only backups are retained
unchanged. They include private images, personal data and session tokens. Disk encryption protects storage at rest;
these local backups do not survive disk loss. An approved off-host backup is needed
before deleting the disk or treating this as disaster recovery.

Restore the database and upload directory from the **same** verified snapshot,
with the API and cleanup timer stopped, after explicit recovery approval. Restore
directory ownership/modes before restarting. Never restore only SQL while assuming
the photos are included in a release archive. This package does not automatically
restore backups or delete old releases/data.

A failed migration keeps the previous code selected, but MySQL schema changes may
already have committed. Never run migration undo or restore a dump automatically.
Inspect the migration and backup first. A failed API startup restores the previous
code symlink **only when the known schema/runtime requirements match**; it does
**not** reverse schema changes. The activation guard refuses a pre-PR19 candidate
before changing a healthy current pointer/service. Such older code ignores
soft-deletion/private-image rules even if its health endpoint passes. After a
failed new startup, an incompatible previous release is not reactivated: the
API stops and needs recovery inspection instead. Compatible PR19-or-later code
rollback remains available.

`check-release-compatibility.py` compares the known management/image migrations
and required runtime modules against verified current/candidate release sources.
It does not query MySQL, undo migrations, restore data or prove compatibility with
arbitrary future schema changes. Later migration changes still require review.
This new source guard also requires deployment before it protects the live host.

Current and previous releases are `/srv/causeconnect/current` and
`/srv/causeconnect/previous`. Historical releases are retained for inspection;
review disk space and remove only explicitly selected old releases. The journal is
limited to 100 MiB/seven days and Ubuntu's Nginx log rotation remains active.

The systemd services restart the API after crashes and host reboots. Backups and
certificate renewal are maintenance, not availability monitoring. Verify the
site, logs, disk, backup restoration and certificate status during the review window.
Stopping EC2 does not remove charges for retained disk or allocated IPv4. Resource
retirement and data retention remain separate approved actions.
