//! Qdrant への登録・検索・削除（qdrant-client / gRPC）。
//!
//! Qdrant を触る処理はこのファイルだけに集める。
//! ベクトルは embedding::embed() が返したものをそのまま渡すこと。

#![allow(dead_code)]

use anyhow::{bail, anyhow, Context, Result};
use qdrant_client::qdrant::{
    CollectionExistsRequest, Condition, CreateCollectionBuilder, DeletePointsBuilder, Distance,
    Filter, PointStruct, QueryPointsBuilder, UpsertPointsBuilder, VectorParamsBuilder,
};
use qdrant_client::{Payload, Qdrant};
use serde_json::json;

use crate::embedding::DIMENSIONS;

/// コレクション名（docs/architecture.md の案どおり。モデルを変えるなら名前も変える）。
pub const COLLECTION: &str = "chunks_bge_m3";
const DEFAULT_URL: &str = "http://localhost:6334";
/// 1 回の upsert で送る点の数。
const UPSERT_BATCH: usize = 64;

/// 登録する 1 チャンク分のデータ。
pub struct ChunkPoint {
    /// SQLite の chunks.id と同じ値を使う（検索結果から本文を引くため）。
    pub id: u64,
    pub document_id: String,
    pub page: Option<u32>,
    pub heading: Option<String>,
    pub text: String,
    pub vector: Vec<f32>,
}

/// 検索結果の 1 件。
#[derive(Debug, Clone)]
pub struct SearchHit {
    pub chunk_id: u64,
    pub score: f32,
    pub document_id: String,
    pub page: Option<u32>,
    pub heading: Option<String>,
    pub text: String,
}

/// 環境変数 QDRANT_URL（未設定なら localhost:6334）に接続するクライアントを作る。
/// 接続は最初のリクエスト時に行われる。
pub fn client() -> Result<Qdrant> {
    let url = std::env::var("QDRANT_URL").unwrap_or_else(|_| DEFAULT_URL.to_string());
    Qdrant::from_url(&url)
        .build()
        .with_context(|| format!("Qdrant クライアントを作れませんでした: {url}"))
}

/// コレクションが無ければ作る（1024 次元 / Cosine）。何度呼んでも安全。
pub async fn ensure_collection(client: &Qdrant) -> Result<()> {
    let exists = client
        .collection_exists(CollectionExistsRequest {
            collection_name: COLLECTION.to_string(),
        })
        .await
        .context("Qdrant に接続できません（コレクションの確認）")?;
    if exists {
        return Ok(());
    }
    client
        .create_collection(
            CreateCollectionBuilder::new(COLLECTION)
                .vectors_config(VectorParamsBuilder::new(DIMENSIONS as u64, Distance::Cosine)),
        )
        .await
        .context("コレクションを作れませんでした")?;
    Ok(())
}

/// チャンクを登録する。同じ id は上書きされる。
pub async fn upsert_chunks(client: &Qdrant, chunks: &[ChunkPoint]) -> Result<()> {
    validate(chunks)?;

    for batch in chunks.chunks(UPSERT_BATCH) {
        let mut points = Vec::with_capacity(batch.len());
        for c in batch {
            let payload: Payload = json!({
                "document_id": c.document_id,
                "page": c.page,
                "heading": c.heading,
                "text": c.text,
            })
            .try_into()
            .map_err(|e| anyhow!("payload を作れませんでした: {e:?}"))?;
            points.push(PointStruct::new(c.id, c.vector.clone(), payload));
        }
        client
            .upsert_points(UpsertPointsBuilder::new(COLLECTION, points).wait(true))
            .await
            .context("Qdrant への登録に失敗しました")?;
    }
    Ok(())
}

/// 質問のベクトルに近いチャンクを、近い順に最大 limit 件返す。
pub async fn search(client: &Qdrant, vector: Vec<f32>, limit: u64) -> Result<Vec<SearchHit>> {
    if vector.len() != DIMENSIONS {
        bail!("検索ベクトルの次元が {} です（{DIMENSIONS} のはず）", vector.len());
    }
    let res = client
        .query(
            QueryPointsBuilder::new(COLLECTION)
                .query(vector)
                .limit(limit)
                .with_payload(true),
        )
        .await
        .context("Qdrant の検索に失敗しました")?;

    let mut hits = Vec::with_capacity(res.result.len());
    for p in res.result {
        let chunk_id = match p.id.as_ref().and_then(|id| id.point_id_options.as_ref()) {
            Some(qdrant_client::qdrant::point_id::PointIdOptions::Num(n)) => *n,
            _ => bail!("数値でない point id が返りました"),
        };
        let text_of = |key: &str| p.payload.get(key).and_then(|v| v.as_str()).cloned();
        hits.push(SearchHit {
            chunk_id,
            score: p.score,
            document_id: text_of("document_id").unwrap_or_default(),
            page: p
                .payload
                .get("page")
                .and_then(|v| v.as_integer())
                .and_then(|n| u32::try_from(n).ok()),
            heading: text_of("heading"),
            text: text_of("text").unwrap_or_default(),
        });
    }
    Ok(hits)
}

/// 文書に属するチャンクのベクトルを、すべて削除する。
pub async fn delete_document(client: &Qdrant, document_id: &str) -> Result<()> {
    client
        .delete_points(
            DeletePointsBuilder::new(COLLECTION)
                .points(Filter::must([Condition::matches(
                    "document_id",
                    document_id.to_string(),
                )]))
                .wait(true),
        )
        .await
        .context("Qdrant からの削除に失敗しました")?;
    Ok(())
}

/// 通信する前に確認できる入力チェック。
fn validate(chunks: &[ChunkPoint]) -> Result<()> {
    for c in chunks {
        if c.vector.len() != DIMENSIONS {
            bail!(
                "チャンク {} のベクトルの次元が {} です（{DIMENSIONS} のはず）",
                c.id,
                c.vector.len()
            );
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn point(id: u64, dim: usize) -> ChunkPoint {
        ChunkPoint {
            id,
            document_id: "doc".into(),
            page: None,
            heading: None,
            text: "t".into(),
            vector: vec![0.0; dim],
        }
    }

    #[test]
    fn validate_accepts_correct_dimension() {
        assert!(validate(&[point(1, DIMENSIONS)]).is_ok());
    }

    #[test]
    fn validate_rejects_wrong_dimension() {
        assert!(validate(&[point(1, DIMENSIONS), point(2, 768)]).is_err());
    }

    /// 実際の Qdrant と Ollama が必要（docker compose up -d qdrant と ollama の起動）。
    /// 実行: cargo test qdrant_real -- --ignored --nocapture
    #[tokio::test]
    #[ignore]
    async fn qdrant_real_roundtrip() {
        use crate::embedding::embed;

        const TEST_ID: u64 = 9_000_000_001;
        const TEST_DOC: &str = "test-doc-qdrant-roundtrip";

        let client = client().unwrap();
        ensure_collection(&client).await.unwrap();
        ensure_collection(&client).await.unwrap(); // 2 回呼んでも失敗しない

        let text = "児童手当は、役場の窓口で申請できます。".to_string();
        let vecs = embed(&[text.clone()]).await.unwrap();
        upsert_chunks(
            &client,
            &[ChunkPoint {
                id: TEST_ID,
                document_id: TEST_DOC.into(),
                page: Some(3),
                heading: Some("児童手当".into()),
                text: text.clone(),
                vector: vecs[0].clone(),
            }],
        )
        .await
        .unwrap();

        let q = embed(&["児童手当の申請方法は？".to_string()]).await.unwrap();
        let hits = search(&client, q[0].clone(), 5).await.unwrap();
        let mine = hits.iter().find(|h| h.chunk_id == TEST_ID);
        println!("hits: {hits:#?}");
        let mine = mine.expect("登録したチャンクが検索で見つかりません");
        assert_eq!(mine.document_id, TEST_DOC);
        assert_eq!(mine.page, Some(3));
        assert_eq!(mine.heading.as_deref(), Some("児童手当"));
        assert_eq!(mine.text, text);

        delete_document(&client, TEST_DOC).await.unwrap();
        let after = search(&client, q[0].clone(), 5).await.unwrap();
        assert!(after.iter().all(|h| h.chunk_id != TEST_ID), "削除後も残っています");
    }
}
