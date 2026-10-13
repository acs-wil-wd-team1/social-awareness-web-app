# Additional API verification — 13 October 2026

AWT-175 adds photo upload/attachment, owner editing and removal, participation,
business enquiries, review history, unpublishing/removal and account suspension.
It preserves the existing registration, login, posting and approval routes.

## Local checks

- Frontend: 591 tests passed; production build passed.
- Backend: 76 unit checks passed.
- Empty disposable MySQL 8: all 12 migrations applied; 64 HTTP/database checks passed.
- Actual frontend components/services using HTTP and MySQL: 18 checks passed.
- Host/package checks: 27 passed and one opt-in Nginx check skipped in the standard
  runner. The opt-in check, matched-backup/restart and code-rollback checks also
  passed separately in disposable Linux containers.
- Chrome with real Express/MySQL, not sample mode: signed in as an author,
  selected a JPEG, saved a pending campaign, loaded its private photo as its
  owner and as admin, approved it, and loaded the public campaign/photo with
  its dates and type. The database readback confirmed the saved approval and
  expired author session after logout.

The disposable database and uploaded files were removed after the tests. Existing
local/team databases were not used. Synthetic business rows were seeded only in
the disposable fixture; these checks do not implement or certify Kim's profile API.

The run caught and fixed a public-list default-parameter validation error, a
review-receipt timestamp mismatch, and a photo-receipt connection-pool risk.
Concurrent edits, double attachment, rollback, private history, session revocation
and storage capacity errors have focused regression coverage.

## Release gates

Merge and AWS deployment are separate from this local evidence. Verify the exact
hosted revision, Linux image decoding, migrations, photo persistence, paired
backup, HTTPS and real browser actions after rollout. Record that receipt in the
implementation notes; don't infer it from a build or a sample preview.

GET/PUT `/api/business/me` and the fresh business registration → profile → posting
journey remain Kim's AWT-141/AWT-173 work. The ordinary posting route already supports
an existing owned Business row. Keep its photo and ownership handling when extending it.

Team manuals, independent tester acceptance and the final demonstration remain
separate submission deliverables. These checks are bounded evidence, not a promise
that no defect can ever occur.
