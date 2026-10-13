#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run as root.' >&2; exit 1; }
umask 077
exec 8>/run/lock/causeconnect-backup.lock
flock -w 30 8
install -d -m 0700 /var/backups/causeconnect
backup_name="causeconnect-$(date -u +%Y%m%dT%H%M%SZ)-$$.sql.gz"
backup_file="/var/backups/causeconnect/$backup_name"
trap 'rm -f -- "$backup_file.part"' EXIT
mysqldump --single-transaction --quick --no-tablespaces --set-gtid-purged=OFF causeconnect | gzip > "$backup_file.part"
gzip -t "$backup_file.part"
mv -- "$backup_file.part" "$backup_file"
# This private directory contains only this application's generated database backups.
find /var/backups/causeconnect -maxdepth 1 -type f -name 'causeconnect-*.sql.gz' -printf '%f\n' \
  | sort -r | tail -n +8 | while IFS= read -r old_backup; do
      [[ "$old_backup" =~ ^causeconnect-[0-9]{8}T[0-9]{6}Z-[0-9]+\.sql\.gz$ ]] || exit 1
      rm -f -- "/var/backups/causeconnect/$old_backup"
    done
echo 'Private database backup completed; the newest seven are retained on this disk.'
