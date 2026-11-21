use axum::{Json, Router, routing::post, serve::Listener};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use tower_http::cors::CorsLayer;

// フロントから送信されるjs形式のAPIをマッピング
#[derive(Deserialize)]
struct ChatRequest {
    message: String,
}

// フロントへ送信するjs形式のAPIに整形
#[derive(Serialize)]
struct ChatResponse {
    reply: String,
}

async fn chat_handler(Json(payload): Json<ChatRequest>) -> Json<ChatResponse> {
    let user_message = payload.message;
    println!("recv message: {}", user_message);

    let echo_reply = format!("{},  sended by back/src/rust", user_message);

    Json(ChatResponse { reply: echo_reply })
}

#[tokio::main]

async fn main() {
    let app = Router::new()
        .route("/api/chat", post(chat_handler))
        .layer(CorsLayer::permissive());

    // start up Docker
    let addr = SocketAddr::from(([0, 0, 0, 0], 8080));
    println!("backed server running on http://{}", addr);

    let Listener = tokio::net::TcpListener::bind(addr).await.unwrap(); // ポート開放を行い、外部からTCP接続を受け入れる。失敗時はpanic(unwrap())で終了
    axum::serve(Listener, app).await.unwrap(); // listnerが接続を受け付けるたびにapp内の適切な関数へ処理を振り分ける
}
