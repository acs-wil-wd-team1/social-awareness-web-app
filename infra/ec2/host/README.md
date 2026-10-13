# Single-server host package

Target: Ubuntu 24.04 x86_64, 2 GiB memory, encrypted persistent disk. The frontend,
Express API and MySQL run on one host. Only Nginx ports 80 and 443 need public
access. Port 80 serves certificate challenges and a 503 until HTTPS is enabled;
afterwards it redirects to HTTPS. Neither API port 3000 nor MySQL port 3306 is public.

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
before publishing an immutable release. Neither nodemon nor Sequelize CLI remains
in the live release; a completed release can be reused without reinstalling tools.
It **never runs the demo seeder** or creates known-password accounts. Runtime DB
access is limited to SELECT, INSERT, UPDATE and DELETE. Secret files under
`/etc/causeconnect/` are root-readable only; systemd supplies the runtime environment.

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
- Missing backend routes remain unavailable; this deployment does not implement
  unfinished photo, business profile or other APIs.

## Backups and rollback

Each deployment takes a DB dump **before** migration. A daily timer retains the
newest seven compressed dumps in `/var/backups/causeconnect/` (root only). They
include personal data and session tokens. Disk encryption protects storage at rest;
these local backups do not survive disk loss. An approved off-host backup is needed
before deleting the disk or treating this as disaster recovery.

A failed migration keeps the previous code selected, but MySQL schema changes may
already have committed. Never run migration undo or restore a dump automatically.
Inspect the migration and backup first. A failed API startup restores the previous
code symlink when available; it does **not** reverse schema changes. Reverting code
is safe only after confirming compatibility with the current database schema.

Current and previous releases are `/srv/causeconnect/current` and
`/srv/causeconnect/previous`. Historical releases are retained for inspection;
review disk space and remove only explicitly selected old releases. The journal is
limited to 100 MiB/seven days and Ubuntu's Nginx log rotation remains active.

The systemd services restart the API after crashes and host reboots. Backups and
certificate renewal are maintenance, not availability monitoring. Verify the
site, logs, disk, backup restoration and certificate status during the review window.
Stopping EC2 does not remove charges for retained disk or allocated IPv4. Resource
retirement and data retention remain separate approved actions.
