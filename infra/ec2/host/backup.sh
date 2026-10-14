#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run as root.' >&2; exit 1; }
umask 077
[[ $# -eq 0 || ( $# -eq 1 && "$1" == --deploy-lock-held ) ]] || { echo 'Unexpected backup argument.' >&2; exit 1; }
if [[ $# -eq 0 ]]; then
  exec 9>/run/lock/causeconnect-deploy.lock
  flock -w 30 -s 9
fi
exec 8>/run/lock/causeconnect-backup.lock
flock -w 30 8
install -d -m 0700 /var/backups/causeconnect
[[ -d /srv/causeconnect/shared/uploads && ! -L /srv/causeconnect/shared/uploads ]] || { echo 'Private upload directory is not configured.' >&2; exit 1; }
backup_name="causeconnect-$(date -u +%Y%m%dT%H%M%SZ)-$$.tar.gz"
backup_file="/var/backups/causeconnect/$backup_name"
backup_work=$(mktemp -d /var/backups/causeconnect/.snapshot-XXXXXX)
restart_app=false
finish_backup() {
  local result=$?
  trap - EXIT
  rm -f -- "$backup_file.part" "$backup_work/database.sql.gz" || result=1
  rmdir -- "$backup_work" || result=1
  if [[ "$restart_app" == true ]]; then
    systemctl start causeconnect.service || { echo 'Backup finished but API restart failed; inspect service state.' >&2; result=1; }
  fi
  exit "$result"
}
trap finish_backup EXIT
if systemctl is-active --quiet causeconnect.service; then
  restart_app=true
  systemctl stop causeconnect.service
fi
# Writers and the cleanup runner are stopped/locked for a matching DB+file snapshot.
mysqldump --single-transaction --quick --no-tablespaces --set-gtid-purged=OFF causeconnect | gzip > "$backup_work/database.sql.gz"
gzip -t "$backup_work/database.sql.gz"
tar -czf "$backup_file.part" -C "$backup_work" database.sql.gz -C /srv/causeconnect/shared uploads
tar -tzf "$backup_file.part" >/dev/null
mv -- "$backup_file.part" "$backup_file"
# Retain seven paired snapshots. Earlier database-only backups are left intact.
find /var/backups/causeconnect -maxdepth 1 -type f -name 'causeconnect-*.tar.gz' -printf '%f\n' \
  | sort -r | tail -n +8 | while IFS= read -r old_backup; do
      [[ "$old_backup" =~ ^causeconnect-[0-9]{8}T[0-9]{6}Z-[0-9]+\.tar\.gz$ ]] || exit 1
      rm -f -- "/var/backups/causeconnect/$old_backup"
    done
echo 'Private database and upload snapshot completed; the newest seven paired snapshots are retained on this disk.'
