"""Known-schema rollback checks with temporary releases and stubbed host services."""
import importlib.util
from pathlib import Path
import shlex
import subprocess
import tempfile
import unittest


HOST = Path(__file__).resolve().parents[1] / 'host'
SPEC = importlib.util.spec_from_file_location('release_compatibility', HOST / 'check-release-compatibility.py')
COMPATIBILITY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(COMPATIBILITY)


class ReleaseCompatibilityTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name).resolve()
        self.app = self.base / 'app'
        (self.app / 'releases').mkdir(parents=True)

    def release(self, name, hardened=False):
        result = self.app / 'releases' / name
        result.mkdir()
        if hardened:
            for migration, files in COMPATIBILITY.KNOWN_REQUIREMENTS.items():
                path = result / 'backend/src/database/migrations' / migration
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text('// reviewed migration fixture\n')
                for file in files:
                    runtime = result / 'backend' / file
                    runtime.parent.mkdir(parents=True, exist_ok=True)
                    runtime.write_text('// reviewed runtime fixture\n')
        return result

    def activate(self, candidate, restart=0, health=0):
        # The script exercises real temporary symlink switches. systemctl, curl
        # and sleeps are stubbed; readlink/mv wrappers provide GNU semantics on Mac.
        script = f'''
set -euo pipefail
source {shlex.quote(str(HOST / 'activate-release.sh'))}
restart_count=0
stop_count=0
systemctl() {{
  if [[ "$1" == restart ]]; then restart_count=$((restart_count + 1)); return {restart}; fi
  if [[ "$1" == stop ]]; then stop_count=$((stop_count + 1)); return 0; fi
  return 1
}}
curl() {{ return {health}; }}
sleep() {{ :; }}
readlink() {{ python3 -c 'from pathlib import Path; import sys; print(Path(sys.argv[1]).resolve(strict=True))' "$2"; }}
mv() {{ python3 -c 'import os, sys; os.replace(sys.argv[1], sys.argv[2])' "$2" "$3"; }}
result=0
activate_release {shlex.quote(str(candidate))} {shlex.quote(str(self.app))} || result=$?
printf '%s %s %s\\n' "$result" "$restart_count" "$stop_count"
'''
        completed = subprocess.run(['bash', '-c', script], check=True, text=True, capture_output=True)
        return tuple(map(int, completed.stdout.strip().split()))

    def test_legacy_sources_without_known_schema_changes_remain_compatible(self):
        legacy = self.release('legacy')
        other = self.release('other')
        COMPATIBILITY.check_compatibility(legacy, [other])

    def test_missing_candidate_or_schema_source_is_refused(self):
        target = self.release('target')
        with self.assertRaisesRegex(ValueError, 'missing'):
            COMPATIBILITY.check_compatibility(self.base / 'missing', [target])
        with self.assertRaisesRegex(ValueError, 'missing'):
            COMPATIBILITY.check_compatibility(target, [self.base / 'missing'])

    def test_pre19_candidate_is_refused_after_known_management_schema(self):
        old = self.release('old')
        current = self.release('current', hardened=True)
        with self.assertRaisesRegex(ValueError, 'unsafe rollback refused'):
            COMPATIBILITY.check_compatibility(old, [current])

    def test_matching_migration_without_runtime_modules_is_refused(self):
        target = self.release('target', hardened=True)
        current = self.release('current', hardened=True)
        (target / 'backend/src/services/campaignQueries.js').unlink()
        with self.assertRaisesRegex(ValueError, 'runtime support'):
            COMPATIBILITY.check_compatibility(target, [current])

    def test_modified_known_migration_requires_manual_compatibility_review(self):
        target = self.release('target', hardened=True)
        current = self.release('current', hardened=True)
        migration = next(iter(COMPATIBILITY.KNOWN_REQUIREMENTS))
        (target / 'backend/src/database/migrations' / migration).write_text('// different schema\n')
        with self.assertRaisesRegex(ValueError, 'matching'):
            COMPATIBILITY.check_compatibility(target, [current])

    def test_matching_schema_and_runtime_modules_allow_compatible_release(self):
        target = self.release('target', hardened=True)
        current = self.release('current', hardened=True)
        COMPATIBILITY.check_compatibility(target, [target, current])

    def test_manual_pre19_target_leaves_current_pointer_and_service_untouched(self):
        current = self.release('current', hardened=True)
        old = self.release('old')
        (self.app / 'current').symlink_to(current)
        self.assertEqual(self.activate(old), (1, 0, 0))
        self.assertEqual((self.app / 'current').resolve(), current)
        self.assertFalse((self.app / 'current.next').exists())

    def test_failed_new_release_stops_api_instead_of_unsafe_schema_fallback(self):
        old = self.release('old')
        target = self.release('target', hardened=True)
        (self.app / 'current').symlink_to(old)
        self.assertEqual(self.activate(target, health=1), (1, 1, 1))
        self.assertEqual((self.app / 'current').resolve(), target)

    def test_failed_compatible_release_restores_previous_code(self):
        current = self.release('current', hardened=True)
        target = self.release('target', hardened=True)
        (self.app / 'current').symlink_to(current)
        self.assertEqual(self.activate(target, restart=1), (1, 2, 0))
        self.assertEqual((self.app / 'current').resolve(), current)

    def test_healthy_compatible_release_records_previous(self):
        current = self.release('current', hardened=True)
        target = self.release('target', hardened=True)
        (self.app / 'current').symlink_to(current)
        self.assertEqual(self.activate(target), (0, 1, 0))
        self.assertEqual((self.app / 'current').resolve(), target)
        self.assertEqual((self.app / 'previous').resolve(), current)

    def test_unmanaged_target_is_refused_without_service_changes(self):
        outside = self.base / 'outside'
        outside.mkdir()
        self.assertEqual(self.activate(outside), (1, 0, 0))


if __name__ == '__main__':
    unittest.main()
