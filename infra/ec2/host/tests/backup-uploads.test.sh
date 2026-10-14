#!/usr/bin/env bash
set -euo pipefail
[[ "${CAUSECONNECT_CONTAINER_TEST:-}" == 1 && -f /.dockerenv ]] || { echo 'Run only in an isolated disposable Linux test container.' >&2; exit 1; }
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
test_dir=$(mktemp -d /tmp/causeconnect-backup-test.XXXXXX)
export BACKUP_TEST_STATE="$test_dir/state" BACKUP_TEST_TRACE="$test_dir/trace"
mkdir -p "$test_dir/bin" /run/lock /srv/causeconnect/shared/uploads /var/backups/causeconnect
printf 'sample image bytes' > /srv/causeconnect/shared/uploads/fixture.jpg
printf 'legacy backup' > /var/backups/causeconnect/causeconnect-20000101T000000Z-1.sql.gz
printf '%s\n' '#!/usr/bin/env bash' 'case "$1" in' \
  'is-active) [[ $(<"$BACKUP_TEST_STATE") == active ]] ;;' \
  'stop) printf stopped > "$BACKUP_TEST_STATE"; printf "stop\n" >> "$BACKUP_TEST_TRACE" ;;' \
  'start) printf active > "$BACKUP_TEST_STATE"; printf "start\n" >> "$BACKUP_TEST_TRACE" ;;' \
  '*) exit 1 ;;' 'esac' > "$test_dir/bin/systemctl"
printf '%s\n' '#!/usr/bin/env bash' '[[ $(<"$BACKUP_TEST_STATE") == stopped ]] || exit 30' \
  '[[ "${BACKUP_TEST_FAIL:-}" != 1 ]] || exit 31' \
  'printf "%s\n" "-- isolated matching SQL fixture"' > "$test_dir/bin/mysqldump"
chmod +x "$test_dir/bin/"*
export PATH="$test_dir/bin:$PATH"
printf active > "$BACKUP_TEST_STATE"
for run in {1..8}; do bash "$script_dir/../backup.sh"; done
[[ $(<"$BACKUP_TEST_STATE") == active ]]
[[ $(find /var/backups/causeconnect -name 'causeconnect-*.tar.gz' | wc -l) -eq 7 ]]
[[ -f /var/backups/causeconnect/causeconnect-20000101T000000Z-1.sql.gz ]]
snapshot=$(find /var/backups/causeconnect -name 'causeconnect-*.tar.gz' | head -1)
tar -tzf "$snapshot" | grep -qx database.sql.gz
tar -tzf "$snapshot" | grep -qx uploads/fixture.jpg
[[ $(tar -xOf "$snapshot" uploads/fixture.jpg) == 'sample image bytes' ]]
tar -xOf "$snapshot" database.sql.gz | gzip -dc | grep -qx -- '-- isolated matching SQL fixture'

export BACKUP_TEST_FAIL=1
if bash "$script_dir/../backup.sh"; then echo 'Expected backup failure.' >&2; exit 1; fi
[[ $(<"$BACKUP_TEST_STATE") == active ]]
[[ $(find /var/backups/causeconnect -name '*.part' -o -name '.snapshot-*' | wc -l) -eq 0 ]]
unset BACKUP_TEST_FAIL
printf stopped > "$BACKUP_TEST_STATE"
bash "$script_dir/../backup.sh"
[[ $(<"$BACKUP_TEST_STATE") == stopped ]]
echo 'PAIRED_BACKUP_AND_FAILURE_RESTART_REGRESSIONS_PASSED'
