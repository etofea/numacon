use axum::http::status;
use axum::routing::options;
use chrono::Utc;
use serde::Serialize;
use sqlx::pool;
use sqlx::{sqlite::SqlitePoolOptions, FromRow, SqlitePool};
use std::{fs, result};
use std::path::Path;

// 
#[derive(Serialize, FromRow, Clone, Debug)]
pub struct DocRecord {
    pub id: i64,
    pub title: String,
    pub category: String,
    pub content: Option<String>,
    pub file_name: Option<String>,
    pub schedule: Option<String>,
    pub publish: Option<String>,
    pub status: String,
    pub error_message: Option<String>,
    pub created_at: String,
}

pub async fn init_db(database_url: &str) -> Result<SqlitePool, sqlx::Error> {
    
    if let Some(path_str) = database_url.strip_prefix("sqlite:") {
        if let Some(parent) = Path::new(path_str).parent() {
            let _ = fs::create_dir_all(parent);
        }
    }

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(
            sqlx::sqlite::SqliteConnectOptions::new()
                .filename(database_url.trim_start_matches("sqlite:"))
                .create_if_missing(true),
        )
        .await?;

    sqlx::query(
        r#"
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
        "#,
    )
    .execute(&pool)
    .await?;

    println!("initialized SQLite database: {}", database_url);
    Ok(pool)
    
}

pub async fn insert_doc(
    pool: &SqlitePool,
    title: &str,
    category: &str,
    content: Option<&str>,
    file_name: Option<&str>,
    schedule: &str,
    publish: &str,
) -> Result<i64, sqlx::Error> {
    let now = chrono::Utc::now().to_rfc3339(); // 日時の登録

    let result = sqlx::query(
        r#"
        INSERT INTO documents (title, category, content, file_name, schedule, publish, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
        "#,
    )
    .bind(title)
    .bind(category)
    .bind(content)
    .bind(file_name)
    .bind(schedule)
    .bind(publish)
    .bind(now)
    .execute(pool)
    .await?;

    println!("schedule: {}", schedule);

    Ok(result.last_insert_rowid()) // 採番されたIDを返す
    
}

pub async fn get_all_docs(pool: &SqlitePool) -> Result<Vec<DocRecord>, sqlx::Error> {
    let docs = sqlx::query_as::<_, DocRecord>(
        r#"
        SELECT id, title, category, content, file_name, schedule, publish, status, error_message, created_at
        FROM documents
        ORDER BY id DESC
        "#,
    )
    .fetch_all(pool)
    .await?;

    Ok(docs)
}

pub async fn delete_doc(pool: &SqlitePool, id: i64) -> Result<bool, sqlx::Error> {
    let result = sqlx::query("DELETE FROM documents WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;

    Ok(result.rows_affected() > 0)
}