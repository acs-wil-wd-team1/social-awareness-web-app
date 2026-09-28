# CauseConnect API reference and proposals

This index separates the existing application from the public-user campaign submission added in this branch. Branch implementation does not mean the changes have been merged into `main`.

| Document | Status and purpose |
|---|---|
| [Current authentication](current-authentication.md) | Implemented registration, login and logout requests and responses |
| [Shared conventions](shared-conventions.md) | Proposed Stage 3 identifiers, permissions and error handling |
| [Campaign submission](campaign-posting-contract.md) | Category lookup and real text-only public-user submission in this branch |
| [Later business posting and images](campaign-posting-future-proposal.md) | Proposed extensions, not implemented by this slice |
| [Admin moderation](admin-campaign-moderation-contract.md) | Existing admin reads and proposed approval/rejection |

## Existing routes on the reviewed main baseline (`0146365c`)

| Method | Endpoint | Access | Successful response |
|---|---|---|---|
| `POST` | `/api/auth/register` | Guest | `201` with message and user |
| `POST` | `/api/auth/login` | Guest | `200` with user and token |
| `PUT` | `/api/auth/logout` | Authenticated user | `204`, no body |
| `GET` | `/api/campaigns` | Public; approved only | `200` with `campaigns`, `page`, `pageSize` |
| `GET` | `/api/campaigns/:id` | Public; approved only | `200` with the campaign object |
| `GET` | `/api/campaigns/admin` | Admin | `200` with `campaigns`, `page`, `pageSize` |
| `GET` | `/api/campaigns/admin/:id` | Admin | `200` with the campaign object |

## Added in this branch

| Method | Endpoint | Access | Successful response |
|---|---|---|---|
| `GET` | `/api/campaigns/categories` | Public | `200` with `categories: [{ id, name }]` |
| `POST` | `/api/campaigns` | Active authenticated account with current `public` role | `201` with a saved pending `campaign` |

The frontend `/campaigns/new` uses both routes. It saves text fields through the real API and database.

Image upload, business submission and approval writes remain unimplemented by this slice. Business profiles, owner-submissions reads, participation and enquiries also remain separate work.

## Separate development preview

The original `/draft/campaigns/new` development-only prototype shows sample fields, validation and a selected image preview without uploading or saving anything. Its example data is not an API integration result. Use `/campaigns/new` for the real submission flow.

Keep existing callers compatible while reviewing the proposals. Update each accepted contract with its implementation and tests; document any schema changes through migrations.
