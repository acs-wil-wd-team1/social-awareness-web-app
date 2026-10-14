#!/usr/bin/env bash
set -euo pipefail
[[ $(uname -s) == Linux ]] || { echo 'Run these filesystem regression checks in Linux (for example Ubuntu 24.04).' >&2; exit 1; }
test_script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=/dev/null
source "$test_script_dir/../activate-release.sh"
test_root=$(mktemp -d /tmp/causeconnect-rollback-test.XXXXXX)
trap 'rm -rf -- "$test_root"' EXIT
restart_result=0
health_result=0
restart_count=0
stop_count=0
systemctl() {
  if [[ "$1" == restart ]]; then
    restart_count=$((restart_count + 1))
    return "$restart_result"
  fi
  if [[ "$1" == stop ]]; then stop_count=$((stop_count + 1)); return 0; fi
  return 1
}
curl() { return "$health_result"; }
sleep() { :; }

# Fresh deployment + failed health must not invent a previous release or a symlink loop.
fresh_root="$test_root/fresh"
mkdir -p "$fresh_root/releases/new"
health_result=1
if activate_release "$fresh_root/releases/new" "$fresh_root"; then exit 1; fi
[[ $(readlink -e "$fresh_root/current") == "$fresh_root/releases/new" ]]
[[ ! -e "$fresh_root/previous" && "$stop_count" == 1 ]]

# An immediate systemctl restart failure must still restore the previous code pointer.
existing_root="$test_root/existing"
mkdir -p "$existing_root/releases/old" "$existing_root/releases/new"
ln -s "$existing_root/releases/old" "$existing_root/current"
restart_result=1
restart_count=0
if activate_release "$existing_root/releases/new" "$existing_root"; then exit 1; fi
[[ $(readlink -e "$existing_root/current") == "$existing_root/releases/old" && "$restart_count" == 2 ]]

# A valid initial release has no previous symlink; the next healthy release records one.
success_root="$test_root/success"
mkdir -p "$success_root/releases/one" "$success_root/releases/two"
restart_result=0
health_result=0
activate_release "$success_root/releases/one" "$success_root"
[[ ! -e "$success_root/previous" ]]
activate_release "$success_root/releases/two" "$success_root"
[[ $(readlink -e "$success_root/current") == "$success_root/releases/two" ]]
[[ $(readlink -e "$success_root/previous") == "$success_root/releases/one" ]]

# A real directory must not be replaced as if it were a managed release link.
unexpected_root="$test_root/unexpected"
mkdir -p "$unexpected_root/current" "$unexpected_root/releases/new"
if activate_release "$unexpected_root/releases/new" "$unexpected_root"; then exit 1; fi
[[ -d "$unexpected_root/current" && ! -L "$unexpected_root/current" ]]

# Known PR19 migrations make pre-PR19 code unsafe even if its /health works.
privacy_root="$test_root/privacy"
mkdir -p "$privacy_root/releases/pre19" "$privacy_root/releases/pr19/backend/src/database/migrations"
for migration in 20261013220000-add-campaign-management.js 20261013221000-create-campaign-images.js; do
  printf '// schema fixture\n' > "$privacy_root/releases/pr19/backend/src/database/migrations/$migration"
done
for file in database/models/managementAudit.js services/campaignQueries.js services/ownerCampaignManagement.js \
  services/adminManagement.js middleware/currentAccountAuthentication.js database/models/campaignImage.js \
  services/campaignImages.js services/campaignImageStorage.js router/campaignImageRoutes.js; do
  mkdir -p "$privacy_root/releases/pr19/backend/src/$(dirname -- "$file")"
  printf '// runtime fixture\n' > "$privacy_root/releases/pr19/backend/src/$file"
done
ln -s "$privacy_root/releases/pr19" "$privacy_root/current"
restart_count=0
stop_count=0
if activate_release "$privacy_root/releases/pre19" "$privacy_root"; then exit 1; fi
[[ $(readlink -e "$privacy_root/current") == "$privacy_root/releases/pr19" ]]
[[ "$restart_count" == 0 && "$stop_count" == 0 ]]

# After a new migration, failed startup must not expose old deletion-blind reads.
ln -sfn "$privacy_root/releases/pre19" "$privacy_root/current"
restart_result=0
health_result=1
if activate_release "$privacy_root/releases/pr19" "$privacy_root"; then exit 1; fi
[[ $(readlink -e "$privacy_root/current") == "$privacy_root/releases/pr19" ]]
[[ "$restart_count" == 1 && "$stop_count" == 1 ]]

# A release with the same schema/runtime requirements remains a valid fallback.
cp -a "$privacy_root/releases/pr19" "$privacy_root/releases/pr19-next"
restart_count=0
stop_count=0
if activate_release "$privacy_root/releases/pr19-next" "$privacy_root"; then exit 1; fi
[[ $(readlink -e "$privacy_root/current") == "$privacy_root/releases/pr19" ]]
[[ "$restart_count" == 2 && "$stop_count" == 0 ]]
echo 'DEPLOYMENT_ROLLBACK_REGRESSIONS_PASSED'
