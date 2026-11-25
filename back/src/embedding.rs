//! Ollama (bge-m3) によるベクトル化。
//!
//! 登録（#4）と検索（#5）で必ずこの関数を使うこと。
//! モデル名・次元数・接続先は、このファイルの 1 か所だけで決める。

#![allow(dead_code)]

use anyhow::{bail, Context, Result};
use serde_json::{json, Value};
use std::time::Duration;

/// 使うモデル。変えるときは Qdrant のコレクション名・次元数も一緒に変えること。
pub const MODEL: &str = "bge-m3";
/// bge-m3 のベクトル次元数（Qdrant コレクションと一致させる）。
pub const DIMENSIONS: usize = 1024;

/// 1 回のリクエストで送る本数（CPU だと 1 本 約 2.8 秒）。
const BATCH_SIZE: usize = 8;
/// 1 リクエストあたりの待ち時間。
const TIMEOUT_SECS: u64 = 300;
const DEFAULT_URL: &str = "http://localhost:11434";

fn ollama_url() -> String {
    std::env::var("OLLAMA_URL")
        .unwrap_or_else(|_| DEFAULT_URL.to_string())
        .trim_end_matches('/')
        .to_string()
}

/// テキストをベクトルに変換する。入力 1 本につきベクトル 1 本を、同じ順で返す。
pub async fn embed(texts: &[String]) -> Result<Vec<Vec<f32>>> {
    if texts.is_empty() {
        return Ok(Vec::new());
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(TIMEOUT_SECS))
        .build()
        .context("HTTP クライアントを作れませんでした")?;
    let url = format!("{}/api/embed", ollama_url());

    let mut all = Vec::with_capacity(texts.len());
    for batch in texts.chunks(BATCH_SIZE) {
        let res = client
            .post(&url)
            .json(&json!({ "model": MODEL, "input": batch }))
            .send()
            .await
            .with_context(|| format!("Ollama に接続できません: {url}"))?;

        let status = res.status();
        if !status.is_success() {
            let body = res.text().await.unwrap_or_default();
            bail!("Ollama がエラーを返しました ({status}): {body}");
        }

        let value: Value = res
            .json()
            .await
            .context("Ollama の応答が JSON ではありません")?;
        all.extend(parse_embeddings(&value, batch.len())?);
    }
    Ok(all)
}

/// 応答 JSON から `embeddings` を取り出して検証する。
fn parse_embeddings(value: &Value, expected: usize) -> Result<Vec<Vec<f32>>> {
    let arr = value
        .get("embeddings")
        .and_then(Value::as_array)
        .context("応答に embeddings がありません")?;

    if arr.len() != expected {
        bail!(
            "ベクトルの本数が合いません: 入力 {expected} 本に対して {} 本",
            arr.len()
        );
    }

    let mut out = Vec::with_capacity(arr.len());
    for (i, v) in arr.iter().enumerate() {
        let nums = v
            .as_array()
            .with_context(|| format!("{i} 番目のベクトルが配列ではありません"))?;
        if nums.len() != DIMENSIONS {
            bail!(
                "{i} 番目のベクトルの次元が {} です（{DIMENSIONS} のはず）。モデルが違う可能性があります",
                nums.len()
            );
        }
        let mut vec = Vec::with_capacity(nums.len());
        for n in nums {
            let f = n
                .as_f64()
                .with_context(|| format!("{i} 番目のベクトルに数値でない値があります"))?;
            vec.push(f as f32);
        }
        out.push(vec);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fake(count: usize, dim: usize) -> Value {
        json!({ "embeddings": vec![vec![0.5_f64; dim]; count] })
    }

    #[test]
    fn parses_valid_response() {
        let out = parse_embeddings(&fake(2, DIMENSIONS), 2).unwrap();
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].len(), DIMENSIONS);
        assert_eq!(out[0][0], 0.5);
    }

    #[test]
    fn rejects_wrong_count() {
        assert!(parse_embeddings(&fake(1, DIMENSIONS), 2).is_err());
    }

    #[test]
    fn rejects_wrong_dimension() {
        assert!(parse_embeddings(&fake(1, 768), 1).is_err());
    }

    #[test]
    fn rejects_missing_embeddings() {
        assert!(parse_embeddings(&json!({ "error": "x" }), 1).is_err());
    }

    #[tokio::test]
    async fn empty_input_returns_empty_without_calling_ollama() {
        let out = embed(&[]).await.unwrap();
        assert!(out.is_empty());
    }

    /// 実際の Ollama が必要。実行: cargo test embed_real -- --ignored --nocapture
    #[tokio::test]
    #[ignore]
    async fn embed_real_ollama() {
        let texts = vec![
            "児童手当の申請方法を教えてください".to_string(),
            "ごみの収集日はいつですか".to_string(),
        ];
        let out = embed(&texts).await.unwrap();
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].len(), DIMENSIONS);
        // 同じ文は同じベクトルになる（登録と検索で同じ関数を使う前提の確認）
        let again = embed(&texts[..1]).await.unwrap();
        let diff: f32 = out[0]
            .iter()
            .zip(&again[0])
            .map(|(a, b)| (a - b).abs())
            .sum();
        assert!(diff < 0.01, "同じ入力でベクトルが変わりました: {diff}");
    }
}
