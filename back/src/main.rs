mod sqlite;

use axum::{
    Json, Router, extract::{
        Multipart, Path, State, multipart, DefaultBodyLimit
    }, http::StatusCode, middleware::IntoMapRequestResult, response::{
        IntoResponse, sse::{
            Event,
            KeepAlive,
            Sse
        },
    }, routing::{delete, post},
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::{
    convert::Infallible, fmt::format, net::SocketAddr, option, path, string, sync::{
        Arc,
    }, time::Duration,
};
use tokio::sync::{self, mpsc};
use tokio_stream::wrappers::ReceiverStream;
use tower_http::cors::CorsLayer;
use sqlx::{SqlitePool, pool};
use sqlite::DocRecord;

//INFO 構造体定義

#[derive(Deserialize)]
struct chatReq {
    message: String,
}

#[derive(Serialize)]
struct chunkData {
    text: String,
}

#[derive(Serialize)]
struct sourceItem {
    doc_id: i64,
    title: String,
    page: i32,
    url: String,
}

#[derive(Serialize)]
struct docListRes {
    docs: Vec<DocRecord>,
}

#[derive(Serialize)]
struct SourcesData {
    sources: Vec<sourceItem>,
}

#[derive(Serialize)]
struct DocCreateRes {
    id: i64,
    status: String,
}

#[derive(Clone)]
struct appState {
    db: SqlitePool,
}

//INFO 1. POST /api/chat: sse straming
async fn chat_handler(Json(payload): Json<chatReq>,) -> Sse<ReceiverStream<Result<Event, Infallible>>> {
    let (tx, rx) = mpsc::channel(20);

    tokio::spawn(async move {
        let user_msg = payload.message;
        println!("recv chat: {}", user_msg);

        let reply_full = format!(
            "response regarding {} (rust sse streaming test...)", 
            user_msg);

        for ch in reply_full.chars() {
            let chunk_json = serde_json::to_string(&chunkData
                {
                    text: ch.to_string(),
                })
            .unwrap();

            let event = Event::default().event("chunk").data(chunk_json);

            if tx.send(Ok(event)).await.is_err() {
                return ;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }

        // sources event
        let sources_json = serde_json::to_string(&SourcesData {
            sources: vec![sourceItem {
                doc_id: 1, // FIXME
                title: "testsheet.pdf".to_string(),
                page: 1,
                url: "/api/docs/1/file".to_string(),
            }],
        })
        .unwrap();
        let sources_event = Event::default().event("sources").data(sources_json);
        let _ = tx.send(Ok(sources_event)).await;

        let done_event = Event::default().event("done").data("{}");
        let _ = tx.send(Ok(done_event)).await;
    });

    Sse::new(ReceiverStream::new(rx))
}

//INFO 2. POST /api/admin/docs: 資料新規登録
async fn create_doc_handler(
        State(state): State<appState>,
        mut multipart: Multipart,
    ) -> Result<Json<DocCreateRes>, StatusCode> {
    // 各データの定義(上書き可変数)
    let mut title = String::new();
    let mut category = String::new();
    let mut schedule = String::new();
    let mut content: Option<String> = None;
    let mut publish = String::new();
    let mut file_name: Option<String> = None;

    // 入力された情報の登録
    while let Ok(Some(mut filed)) = multipart.next_field().await {
        let name = filed.name().unwrap_or("").to_string();
        println!("string: {}", name);
        match name.as_str() {
            "schedule" => schedule = filed.text().await.unwrap_or_default(),
            "publish" => publish = filed.text().await.unwrap_or_default(),
            "title" => title = filed.text().await.unwrap_or_default(),
            "category" => category = filed.text().await.unwrap_or_default(),
            "content" => content = Some(filed.text().await.unwrap_or_default()),
            "file" => {
                if let Some(fname) = filed.file_name() {
                    file_name = Some(fname.to_string());
                }
                //TODO サイズ制限?
                while let Ok(Some(_chunk)) = filed.chunk().await {} //INFO ファイルを最後まで読み切る(速度低下？)
            }
            _ => {}
        }
    }
    println!("schedule: {}", schedule);

    if title.is_empty() || category.is_empty() {
        println!("BAD REQUEST: title or category are empty.");
        return  Err(StatusCode::BAD_REQUEST);
    }

    let new_id = sqlite::insert_doc(
        &state.db, 
        &title,
        &category,
        content.as_deref(),
        file_name.as_deref(),
        &schedule,
        &publish
    )
    .await
    // error出力
    .map_err(|e| {
        println!("database insert error: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    
    println!("registration complete!: iD {}", new_id);

    Ok(Json(DocCreateRes { id: new_id, status: "pending".to_string(), }))
}

//INFO 3. GET /api/admin/docs: 資料一覧の取得
async fn list_doc_handler(
    State(state): State<appState>
) -> Result<Json<docListRes>, StatusCode>{
    let docs = sqlite::get_all_docs(&state.db)
        .await
    .map_err(|e| { // error出力
        println!("database fetch error :{}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    Ok(Json(docListRes { docs }))
}

//INFO 4. DELETE /api/admin/docs/{id}: 資料の削除
async fn delete_doc_handler(
    State(state): State<appState>,
    Path(id): Path<i64>
) -> impl IntoResponse {
    match sqlite::delete_doc(&state.db, id).await {
        Ok(true) => {
            println!("delete docs successfully: id {}", id);
            StatusCode::NO_CONTENT
        }
        Ok(false) => {
            println!("fucking docs not found: id {}", id);
            StatusCode::NOT_FOUND
        }
        Err(e) => {
            println!("fuckig database delete error: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        }
    }
}

#[tokio::main]

async fn main() {

    let data_dir = std::env::var("DATA_DIR").unwrap_or_else(|_| "./data".to_string()); // 
    let db_url = format!("sqlite:{}/numacon.db", data_dir); // data baseに

    let pool = sqlite::init_db(&db_url)
        .await
        .expect("failed to initialize sqlite database");

    let state = appState {db: pool};
    
    let admin_routes = Router::new()
        .route("/docs", post(create_doc_handler).get(list_doc_handler))
        .route("/docs/{id}", delete(delete_doc_handler));

    let app = Router::new()
        .route("/api/chat", post(chat_handler))
        .nest("/api/admin", admin_routes)
        .with_state(state)
        .layer(CorsLayer::permissive());

    
    // start up Docker
    let addr = SocketAddr::from(([0, 0, 0, 0], 8080));
    println!("backed server running on http://{}", addr);

    let Listener = tokio::net::TcpListener::bind(addr).await.unwrap(); // ポート開放を行い、外部からTCP接続を受け入れる。失敗時はpanic(unwrap())で終了
    axum::serve(Listener, app).await.unwrap(); // listnerが接続を受け付けるたびにapp内の適切な関数へ処理を振り分ける
}
