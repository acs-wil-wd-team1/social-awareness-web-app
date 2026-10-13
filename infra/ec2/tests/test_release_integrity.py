"""Release integrity regressions, including macOS-generated tar metadata."""
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import unittest

HOST = Path(__file__).parents[1] / 'host'
SPEC = importlib.util.spec_from_file_location('verify_release', HOST / 'verify-release.py')
VERIFY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VERIFY)


class ReleaseIntegrityTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        self.source = self.base / 'source'
        self.source.mkdir()
        (self.source / 'backend').mkdir()
        self.file = self.source / 'backend/app.js'
        self.file.write_bytes(b'console.log("test");\n')
        self.manifest = {
            'application': 'CauseConnect', 'mode': 'live', 'commit': 'a' * 40,
            'releaseId': 'test-release',
            'files': {'backend/app.js': hashlib.sha256(self.file.read_bytes()).hexdigest()},
        }
        self.save_manifest()

    def save_manifest(self):
        (self.source / 'release.json').write_text(json.dumps(self.manifest))

    def make_archive(self, extras=()):
        archive = self.base / 'release.tar.gz'
        with tarfile.open(archive, 'w:gz') as bundle:
            bundle.add(self.source, arcname='.', recursive=True)
            for entry, content in extras:
                bundle.addfile(entry, io.BytesIO(content) if content is not None else None)
        return archive

    def extra_file(self, name, contents=b'unlisted'):
        entry = tarfile.TarInfo(name)
        entry.size = len(contents)
        return entry, contents

    def assert_both_refuse(self):
        with self.assertRaises(ValueError):
            VERIFY.verify_directory(self.source)
        with self.assertRaises(ValueError):
            VERIFY.verify_archive(self.make_archive())

    def test_valid_directory_and_archive(self):
        self.assertEqual(VERIFY.verify_directory(self.source, 'test-release'), self.manifest)
        self.assertEqual(VERIFY.verify_archive(self.make_archive(), 'test-release'), self.manifest)

    def test_appledouble_injected_only_into_archive_is_refused(self):
        VERIFY.verify_directory(self.source)
        archive = self.make_archive([self.extra_file('./backend/._app.js')])
        with self.assertRaisesRegex(ValueError, 'metadata path'):
            VERIFY.verify_archive(archive)

    def test_metadata_in_directory_or_manifest_is_refused(self):
        for name in ['.DS_Store', '._app.js']:
            with self.subTest(name=name):
                item = self.source / name
                item.write_bytes(b'metadata')
                self.assert_both_refuse()
                self.manifest['files'][name] = hashlib.sha256(b'metadata').hexdigest()
                self.save_manifest()
                self.assert_both_refuse()
                item.unlink()
                del self.manifest['files'][name]
                self.save_manifest()

    def test_unlisted_regular_file_is_refused(self):
        (self.source / 'backend/extra.js').write_bytes(b'extra')
        self.assert_both_refuse()

    def test_unlisted_archive_file_is_refused(self):
        with self.assertRaisesRegex(ValueError, 'file list differs'):
            VERIFY.verify_archive(self.make_archive([self.extra_file('./backend/extra.js')]))

    def test_missing_file_is_refused(self):
        self.file.unlink()
        self.assert_both_refuse()

    def test_changed_file_is_refused(self):
        self.file.write_bytes(b'modified')
        self.assert_both_refuse()

    def test_symlink_is_refused(self):
        (self.source / 'backend/link.js').symlink_to('app.js')
        self.assert_both_refuse()

    def test_hardlink_is_refused(self):
        os.link(self.file, self.source / 'backend/link.js')
        self.assert_both_refuse()

    def test_duplicate_archive_entry_is_refused(self):
        with self.assertRaisesRegex(ValueError, 'Duplicate archive entry'):
            VERIFY.verify_archive(self.make_archive([self.extra_file('./backend/app.js')]))

    def test_unsafe_archive_paths_are_refused(self):
        for name in ['../escape', '/absolute', './backend/../escape', 'backend//app.js', 'backend\\app.js']:
            with self.subTest(name=name), self.assertRaises(ValueError):
                VERIFY.verify_archive(self.make_archive([self.extra_file(name)]))

    def test_unsafe_manifest_path_is_refused(self):
        self.manifest['files']['../escape'] = 'b' * 64
        self.save_manifest()
        self.assert_both_refuse()

    def test_duplicate_json_keys_are_refused(self):
        target = self.source / 'release.json'
        target.write_text(target.read_text().replace('"mode": "live"', '"mode": "live", "mode": "live"'))
        self.assert_both_refuse()

    def test_wrong_release_id_is_refused(self):
        with self.assertRaisesRegex(ValueError, 'identifier does not match'):
            VERIFY.verify_directory(self.source, 'another-release')
        with self.assertRaisesRegex(ValueError, 'identifier does not match'):
            VERIFY.verify_archive(self.make_archive(), 'another-release')

    def test_real_tar_with_copyfile_disabled(self):
        if sys.platform == 'darwin':
            # A fresh local xattr reliably reproduces the original macOS tar issue.
            subprocess.run(['xattr', '-w', 'com.causeconnect.release-test', 'harmless-test-metadata', str(self.file)], check=True)
        archive = self.base / 'real-tar.tar.gz'
        subprocess.run(['tar', '-czf', str(archive), '-C', str(self.source), '.'],
                       env={**os.environ, 'COPYFILE_DISABLE': '1'}, check=True)
        self.assertEqual(VERIFY.verify_archive(archive), self.manifest)


if __name__ == '__main__':
    unittest.main()
