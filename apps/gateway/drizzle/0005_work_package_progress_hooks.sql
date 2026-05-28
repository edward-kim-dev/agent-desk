-- hook-file / hook-turn kind values are enforced at the application layer only.
-- SQLite has no CHECK constraint on this column, so no DDL change is needed.
SELECT 1 WHERE 0;