# CauseConnect API reference and proposals

The current reference below describes `main` at `0146365c`. Stage 3 documents are proposals for review and frontend preparation.

| Document | Status and purpose |
|---|---|
| [Current authentication](current-authentication.md) | Implemented registration, login and logout requests and responses |
| [Shared conventions](shared-conventions.md) | Proposed Stage 3 identifiers, permissions and error handling |
| [Campaign posting and images](campaign-posting-contract.md) | Proposed categories, campaign submission and image upload |
| [Admin moderation](admin-campaign-moderation-contract.md) | Existing admin reads and proposed approval/rejection |

## Existing routes on main

| Method | Endpoint | Access | Successful response |
|---|---|---|---|
| `POST` | `/api/auth/register` | Guest | `201` with message and user |
| `POST` | `/api/auth/login` | Guest | `200` with user and token |
| `PUT` | `/api/auth/logout` | Authenticated user | `204`, no body |
| `GET` | `/api/campaigns` | Public; approved only | `200` with `campaigns`, `page`, `pageSize` |
| `GET` | `/api/campaigns/:id` | Public; approved only | `200` with the campaign object |
| `GET` | `/api/campaigns/admin` | Admin | `200` with `campaigns`, `page`, `pageSize` |
| `GET` | `/api/campaigns/admin/:id` | Admin | `200` with the campaign object |

Campaign creation, category lookup, image upload and approval writes are not implemented on this main baseline. Business profiles, the owner's submissions, participation and enquiries also need API definitions and implementation.

## Stage 3 draft boundary

The campaign frontend prototype can show fields, validation and a selected image preview without uploading or saving anything. Its example data is not an API integration result.

Keep existing callers compatible while reviewing the proposals. Update each accepted contract with its implementation and tests; document any schema changes through migrations.
