# Database — one file per service

True database-per-service: each Tally backend service owns a dedicated database (4 separate
Neon projects in production, 4 separate local databases in the one dev Postgres container —
see `docker-compose.yml`). No service's schema references another's tables.

| File | Service | Tables |
|---|---|---|
| `auth-schema.sql` | auth-service | `users` |
| `expense-schema.sql` | expense-service | `expenses`, `reminders`, `custom_categories` |
| `budget-schema.sql` | budget-service | `budgets` |
| `group-schema.sql` | group-service | `groups`, `group_members`, `shared_expenses` |

These are reference only — `spring.jpa.hibernate.ddl-auto=validate` in every service means
Hibernate never creates or alters tables, it only checks the entities match what's already
there. `init-multi-db.sh` is what actually bootstraps a fresh local Postgres container (via
Postgres's own `/docker-entrypoint-initdb.d` convention): it creates the 4 databases and
applies each one's schema file.

There are no foreign key constraints anywhere in this schema, by original design — the JPA
entities were never mapped as relationships (`@ManyToOne`/`@JoinColumn`), just plain scalar
`Long` id columns. Cross-service references (e.g. `expenses.user_id` meaning a row in
auth-service's `users` table) are validated at the application layer over HTTP, not by the
database — see each service's `*Client` classes.
