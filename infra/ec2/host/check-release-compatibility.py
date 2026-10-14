#!/usr/bin/env python3
"""Refuse known-unsafe code rollbacks without connecting to or changing MySQL.

PR #19 adds soft deletion and private image metadata. Pre-PR19 reads ignore
those rules even though /health can still pass. Installed, verified release
sources provide a conservative lower bound on the schema requirements.
This is not a general compatibility proof for future migrations.
"""
import argparse
from pathlib import Path


KNOWN_REQUIREMENTS = {
    '20261013220000-add-campaign-management.js': (
        'src/database/models/managementAudit.js',
        'src/services/campaignQueries.js',
        'src/services/ownerCampaignManagement.js',
        'src/services/adminManagement.js',
        'src/middleware/currentAccountAuthentication.js',
    ),
    '20261013221000-create-campaign-images.js': (
        'src/database/models/campaignImage.js',
        'src/services/campaignImages.js',
        'src/services/campaignImageStorage.js',
        'src/router/campaignImageRoutes.js',
    ),
}


def check_compatibility(candidate, schema_sources):
    candidate = Path(candidate)
    sources = [Path(source) for source in schema_sources]
    if not candidate.is_dir() or any(not source.is_dir() for source in sources):
        raise ValueError('Release directory is missing; inspect before activation.')
    for migration, runtime_files in KNOWN_REQUIREMENTS.items():
        relative = Path('backend/src/database/migrations') / migration
        required_sources = [source / relative for source in sources if (source / relative).is_file()]
        if not required_sources:
            continue
        target = candidate / relative
        if not target.is_file() or any(target.read_bytes() != source.read_bytes() for source in required_sources):
            raise ValueError(f'Candidate lacks the matching {migration} schema support; unsafe rollback refused.')
        missing = [name for name in runtime_files if not (candidate / 'backend' / name).is_file()]
        if missing:
            raise ValueError(f'Candidate lacks runtime support for {migration}; unsafe rollback refused.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--candidate', required=True, type=Path)
    parser.add_argument('--schema-source', action='append', required=True, type=Path)
    args = parser.parse_args()
    try:
        check_compatibility(args.candidate, args.schema_source)
    except ValueError as error:
        parser.exit(1, f'{error}\n')


if __name__ == '__main__':
    main()
