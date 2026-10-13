#!/usr/bin/env python3
"""Verify a complete release before extracting it or touching the database."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import stat
import sys
import tarfile


def checked_path(name):
    if not isinstance(name, str) or not name or '\\' in name or any(ord(c) < 32 for c in name):
        raise ValueError('Invalid release path')
    parts = name.split('/')
    if any(part in ('', '.', '..', '.DS_Store', '__MACOSX') or part.startswith('._') for part in parts):
        raise ValueError(f'Unsafe or metadata path: {name!r}')
    return name


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f'Duplicate JSON key: {key!r}')
        result[key] = value
    return result


def manifest_from(data, release_id):
    manifest = json.loads(data, object_pairs_hook=unique_object)
    if not isinstance(manifest, dict) or manifest.get('application') != 'CauseConnect' or manifest.get('mode') != 'live':
        raise ValueError('Not a live CauseConnect release')
    if not re.fullmatch(r'[0-9a-f]{40}', manifest.get('commit', '')):
        raise ValueError('Invalid release commit')
    identifier = manifest.get('releaseId', '')
    if not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9._-]{0,80}', identifier):
        raise ValueError('Invalid release identifier')
    if release_id is not None and identifier != release_id:
        raise ValueError('Release identifier does not match deployment')
    files = manifest.get('files')
    if not isinstance(files, dict) or not files:
        raise ValueError('Missing release file manifest')
    for name, digest in files.items():
        checked_path(name)
        if name == 'release.json' or not isinstance(digest, str) or not re.fullmatch(r'[0-9a-f]{64}', digest):
            raise ValueError(f'Invalid manifest entry: {name!r}')
    return manifest


def expected_directories(files):
    result = {''}
    for name in files:
        parts = name.split('/')
        result.update('/'.join(parts[:index]) for index in range(1, len(parts)))
    return result


def digest_stream(stream):
    digest = hashlib.sha256()
    for chunk in iter(lambda: stream.read(1024 * 1024), b''):
        digest.update(chunk)
    return digest.hexdigest()


def check_contents(manifest, actual_files, actual_directories, open_file):
    expected = set(manifest['files']) | {'release.json'}
    if actual_files != expected:
        raise ValueError(f'Release file list differs: missing={sorted(expected - actual_files)!r}, extra={sorted(actual_files - expected)!r}')
    if actual_directories - expected_directories(expected):
        raise ValueError('Release contains unlisted directories')
    for name, expected_hash in manifest['files'].items():
        with open_file(name) as stream:
            if digest_stream(stream) != expected_hash:
                raise ValueError(f'Release checksum mismatch: {name!r}')


def verify_directory(directory, release_id=None):
    root = Path(directory)
    files, directories = set(), {''}

    def visit(folder):
        for item in folder.iterdir():
            name = checked_path(item.relative_to(root).as_posix())
            mode = item.lstat().st_mode
            if stat.S_ISDIR(mode):
                directories.add(name)
                visit(item)
            elif stat.S_ISREG(mode):
                # Hard links are unnecessary in a sealed deployment package.
                if item.stat().st_nlink != 1:
                    raise ValueError(f'Hard-linked release file: {name!r}')
                files.add(name)
            else:
                raise ValueError(f'Non-regular release entry: {name!r}')

    visit(root)
    if 'release.json' not in files:
        raise ValueError('Missing release.json')
    manifest = manifest_from((root / 'release.json').read_bytes(), release_id)
    check_contents(manifest, files, directories, lambda name: (root / name).open('rb'))
    return manifest


def verify_archive(archive, release_id=None):
    with tarfile.open(archive, 'r:gz') as bundle:
        entries, files, directories = {}, set(), set()
        for entry in bundle.getmembers():
            name = entry.name
            if name.startswith('./'):
                name = name[2:]
            if name in ('', '.') and entry.isdir():
                name = ''
            else:
                name = checked_path(name.rstrip('/') if entry.isdir() else name)
            if name in entries:
                raise ValueError(f'Duplicate archive entry: {name!r}')
            entries[name] = entry
            if entry.isdir():
                directories.add(name)
            elif entry.isfile():
                files.add(name)
            else:
                raise ValueError(f'Non-regular archive entry: {name!r}')
        if 'release.json' not in files:
            raise ValueError('Missing release.json')
        with bundle.extractfile(entries['release.json']) as stream:
            manifest = manifest_from(stream.read(), release_id)
        check_contents(manifest, files, directories, lambda name: bundle.extractfile(entries[name]))
        return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--directory')
    source.add_argument('--archive')
    parser.add_argument('--release-id')
    args = parser.parse_args()
    try:
        manifest = (verify_directory(args.directory, args.release_id) if args.directory
                    else verify_archive(args.archive, args.release_id))
    except (OSError, ValueError, TypeError, tarfile.TarError) as error:
        print(f'Release verification failed: {error}', file=sys.stderr)
        return 1
    print(json.dumps({key: manifest[key] for key in ('commit', 'releaseId')} |
                     {'verifiedFiles': len(manifest['files'])}))
    return 0


if __name__ == '__main__':
    sys.exit(main())
