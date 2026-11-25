use anyhow::{bail, Context, Result};
use reqwest::multipart::{Form, Part};
use serde::Deserialize;
use std::{path::Path, time::Duration};

#[derive(Deserialize)]
struct ConvertResponse {
    document: Document,
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    errors: Vec<serde_json::Value>,
}

#[derive(Deserialize)]
struct Document {
    md_content: Option<String>,
}

pub struct DoclingClient {
    base_url: String,
    http: reqwest::Client,
}

impl DoclingClient {
    pub fn new(base_url: impl Into<String>) -> Result<Self> {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(300)) // 大きいPDFは時間がかかる
            .build()?;
        Ok(Self {
            base_url: base_url.into().trim_end_matches('/').to_string(),
            http,
        })
    }

    /// 環境変数 DOCLING_URL を使う(未設定なら localhost:5001)
    pub fn from_env() -> Result<Self> {
        let url = std::env::var("DOCLING_URL")
            .unwrap_or_else(|_| "http://localhost:5001".to_string());
        Self::new(url)
    }

    /// PDFのバイト列を送ってMarkdown文字列を受け取る
    pub async fn pdf_to_md(&self, filename: &str, bytes: Vec<u8>) -> Result<String> {
        let part = Part::bytes(bytes)
            .file_name(filename.to_string())
            .mime_str("application/pdf")?;

        let form = Form::new()
            .part("files", part)
            .text("from_formats", "pdf")
            .text("to_formats", "md")
            .text("do_ocr", "true")
            .text("image_export_mode", "placeholder"); // 画像をbase64で埋め込まない

        let resp = self
            .http
            .post(format!("{}/v1/convert/file", self.base_url))
            .multipart(form)
            .send()
            .await
            .context("docling-serveに接続できません")?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            bail!("docling-serveがエラーを返しました: {status} {body}");
        }

        let parsed: ConvertResponse = resp.json().await.context("レスポンスの解析に失敗")?;
        if !parsed.errors.is_empty() {
            bail!("変換エラー: {:?}", parsed.errors);
        }
        if let Some(s) = &parsed.status {
            if s != "success" {
                bail!("変換が成功しませんでした: status={s}");
            }
        }
        parsed
            .document
            .md_content
            .context("md_contentが空でした")
    }

    /// ファイルパスから読み込んで変換する
    pub async fn pdf_file_to_md(&self, path: &Path) -> Result<String> {
        let bytes = tokio::fs::read(path).await?;
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("input.pdf");
        self.pdf_to_md(name, bytes).await
    }
}