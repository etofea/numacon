CREATE TABLE IF NOT EXISTS documents (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            title           TEXT NOT NULL,
            category        TEXT NOT NULL,
            content         TEXT,
            file_name       TEXT,
            schedule        TEXT,
            publish         TEXT,
            status          TEXT NOT NULL DEFAULT 'pending',
            error_message   TEXT,
            created_at      TEXT NOT NULL
        );