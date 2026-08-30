# Database specification

Source of truth for the Sequelize migrations and models.
Taken from the team ER diagram. Eight tables.

Create in this order so foreign keys resolve:
users, categories, businesses, campaigns, participations,
campaign_reviews, leads, user_sessions.

All tables use an auto-increment INT primary key.
All DATETIME columns default to the current timestamp where sensible.

---

## users
| column | type | notes |
|---|---|---|
| user_id | INT | PK, auto increment |
| full_name | VARCHAR(100) | not null |
| email | VARCHAR(150) | not null, unique |
| password_hash | VARCHAR(255) | not null, bcrypt |
| role | ENUM | 'public', 'business_owner', 'admin', default 'public' |
| status | ENUM | 'active', 'suspended', default 'active' |
| created_at | DATETIME | |
| updated_at | DATETIME | |

The server sets `role`. It is never accepted from the client on registration.

## categories
| column | type | notes |
|---|---|---|
| category_id | INT | PK |
| category_name | VARCHAR(100) | not null, unique |
| description | TEXT | nullable |
| created_at | DATETIME | |
| updated_at | DATETIME | |

## businesses
| column | type | notes |
|---|---|---|
| business_id | INT | PK |
| owner_id | INT | not null, FK to users.user_id, unique (one business per user) |
| business_name | VARCHAR(150) | not null |
| abn | VARCHAR(20) | nullable |
| website | VARCHAR(255) | nullable |
| description | TEXT | nullable |
| created_at | DATETIME | |
| updated_at | DATETIME | |

## campaigns
| column | type | notes |
|---|---|---|
| campaign_id | INT | PK |
| business_id | INT | FK to businesses.business_id, nullable (null = social campaign) |
| category_id | INT | not null, FK to categories.category_id |
| created_by | INT | not null, FK to users.user_id |
| title | VARCHAR(150) | not null |
| description | TEXT | |
| target_audience | VARCHAR(255) | nullable |
| start_date | DATE | |
| end_date | DATE | |
| status | ENUM | 'pending', 'approved', 'rejected', default 'pending' |
| created_at | DATETIME | |
| updated_at | DATETIME | |

`status` is the column that makes admin approval a real feature. The public
campaign list must filter on `status = 'approved'` in the query, not in React.

`created_by` records which user raised the campaign, business owner or
member of the public. `business_id` stays nullable for the social-campaign
case, where there is no business behind it.

## participations
| column | type | notes |
|---|---|---|
| participation_id | INT | PK |
| user_id | INT | FK to users.user_id |
| campaign_id | INT | FK to campaigns.campaign_id |
| participated_at | DATETIME | |
| status | ENUM | 'joined', 'withdrawn', default 'joined' |

Composite unique index on (user_id, campaign_id) so a user cannot join twice.

## campaign_reviews
| column | type | notes |
|---|---|---|
| review_id | INT | PK |
| campaign_id | INT | FK to campaigns.campaign_id |
| admin_id | INT | FK to users.user_id |
| action | ENUM | 'approved', 'rejected' |
| comments | TEXT | nullable, the reason for a rejection |
| reviewed_at | DATETIME | |

## leads
| column | type | notes |
|---|---|---|
| lead_id | INT | PK |
| campaign_id | INT | FK to campaigns.campaign_id |
| business_id | INT | FK to businesses.business_id |
| user_id | INT | FK to users.user_id, nullable (guests can submit) |
| name | VARCHAR(100) | not null |
| email | VARCHAR(150) | not null |
| phone | VARCHAR(20) | nullable |
| message | TEXT | |
| created_at | DATETIME | |
| updated_at | DATETIME | |

## user_sessions
| column | type | notes |
|---|---|---|
| session_id | INT | PK |
| user_id | INT | FK to users.user_id |
| token | VARCHAR(255) | unique |
| login_at | DATETIME | |
| logout_at | DATETIME | nullable |
| ip_address | VARCHAR(45) | IPv6 safe length |
| user_agent | VARCHAR(255) | |
| status | ENUM | 'active', 'expired', default 'active' |

---

## Decisions made

1. **`users.creator_id`** — removed. Nothing used it, and it had no stated
   purpose.

2. **Campaign creator** — added `campaigns.created_by INT NOT NULL`, FK to
   `users.user_id`. Records which user raised the campaign, business owner
   or member of the public. `campaigns.business_id` stays nullable for the
   social-campaign case.

3. **`user_sessions`** — built as specified in the table above. Whether
   login/logout actually write to it (marking a row expired vs. the client
   just discarding the JWT) is Kim's call on the route/controller side; the
   table exists either way.

4. **Cascade behaviour** — `ON DELETE RESTRICT` applied to every foreign key
   across all eight tables, so nothing disappears silently during a demo.
