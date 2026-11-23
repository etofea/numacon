use axum::{
    Json, Router, extract::{
        Multipart, Path, State, multipart
    }, http::StatusCode, response::{
        IntoResponse, sse::{
            Event,
            KeepAlive,
            Sse
        },
    }, routing::post,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::{
    convert::Infallible, fmt::format, net::SocketAddr, option, string, sync::{
        Arc, Mutex, atomic::{
            AtomicI64,
            Ordering
        },
    }, time::Duration,
};
use tokio::sync::{self, mpsc};
use tokio_stream::wrappers::ReceiverStream;
use tower_http::cors::CorsLayer;

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

#[derive(Serialize, Clone)]
struct  docItem {
    id: i64,
    title: String,
    category: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    file_name: Option<String>,
    schedule: String,
    publish: String,
    status: String, // status振り分け pending | processing | done | failed
    error_message: Option<String>,
    created_at: String,
}

#[derive(Serialize)]
struct docListRes {
    docs: Vec<docItem>,
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
    next_id: Arc<AtomicI64>,
    docs: Arc<Mutex<Vec<docItem>>>
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
                title: "fuckoff.pdf".to_string(),
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
    let mut publish = String::new();
    let mut file_name: Option<String> = None;

    while let Ok(Some(filed)) = multipart.next_field().await {
        let name = filed.name().unwrap_or("").to_string();
        match name.as_str() {
            "title" => title = filed.text().await.unwrap_or_default(),
            "category" => category = filed.text().await.unwrap_or_default(),
            "schedule" => schedule = filed.text().await.unwrap_or_default(),
            "publish" => publish = filed.text().await.unwrap_or_default(),
            "file" => {
                if let Some(fname) = filed.file_name() {
                    file_name = Some(fname.to_string());
                }
            }
            _ => {}
        }
    }

    if title.is_empty() || category.is_empty() {
        println!("BAD REQUEST: title or category are empty.");
        return  Err(StatusCode::BAD_REQUEST);
    }

    let new_id = state.next_id.fetch_add(1, Ordering::SeqCst);
    let now = Utc::now().to_rfc3339();

    let new_doc = docItem {
        id: new_id,
        title,
        category,
        file_name,
        schedule,
        publish,
        status: "pending".to_string(),
        error_message: None,
        created_at: now,
    };

    state.docs.lock().unwrap().push(new_doc);
    println!("registration complete!: iD {}", new_id);

    Ok(Json(DocCreateRes { id: new_id, status: "pending".to_string(), }))
}

//INFO 3. GET /api/admin/docs: 資料一覧の取得
async fn list_doc_handler(State(state): State<appState>) -> Json<docListRes> {
    let docs = state.docs.lock().unwrap().clone();
    Json(docListRes { docs })
}

//TODO 資料削除

#[tokio::main]

async fn main() {
    let state = appState {
        next_id: Arc::new(
            AtomicI64::new(1)
        ),
        docs: Arc::new(Mutex::new(
            Vec::new()
        )),
    };

    //TODO
    let admin_routes = Router::new()
        .route("/docs", post(create_doc_handler).get(list_doc_handler));

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
