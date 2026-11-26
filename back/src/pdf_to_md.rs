use anyhow::{bail, Context, Result};
use reqwest::multipart::{Form, Part};
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, path::Path, time::Duration};

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
    json_content: Option<serde_json::Value>,
}

/// 1ページ分のテキスト
#[derive(Debug, Clone, Serialize)]
pub struct PageText {
    pub page: u32,
    pub text: String,
}

/// 変換結果（全体のMarkdownと、ページごとのテキスト）
#[derive(Debug, Clone, Serialize)]
pub struct PdfConversion {
    pub markdown: String,
    pub pages: Vec<PageText>,
}

pub struct DoclingClient {
    base_url: String,
    http: reqwest::Client,
}

impl DoclingClient {
    pub fn new(base_url: impl Into<String>) -> Result<Self> {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(300))
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

    /// PDFのバイト列を送り、Markdownとページごとのテキストを受け取る(OCRなし)
    pub async fn convert_pdf(&self, filename: &str, bytes: Vec<u8>) -> Result<PdfConversion> {
        let part = Part::bytes(bytes)
            .file_name(filename.to_string())
            .mime_str("application/pdf")?;

        let form = Form::new()
            .part("files", part)
            .text("from_formats", "pdf")
            .text("to_formats", "md")
            .text("to_formats", "json") // ページ番号の取得に使う
            .text("do_ocr", "false") // OCRはAWS側で行うため不要
            .text("image_export_mode", "placeholder");

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

        let markdown = parsed.document.md_content.context("md_contentが空でした")?;
        if markdown.trim().is_empty() {
            bail!("テキストを取得できませんでした(画像のみのPDFの可能性があります。OCRは無効です)");
        }

        let json = parsed
            .document
            .json_content
            .context("json_contentが空でした")?;
        let pages = extract_pages(&json);

        Ok(PdfConversion { markdown, pages })
    }

    /// ファイルパスから読み込んで変換する
    pub async fn convert_pdf_file(&self, path: &Path) -> Result<PdfConversion> {
        let bytes = tokio::fs::read(path).await?;
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("input.pdf");
        self.convert_pdf(name, bytes).await
    }
}

/// doclingのJSON(DoclingDocument)から、ページごとのテキストを作る。
/// texts[] の各要素が持つ prov[0].page_no でページを判定する。
fn extract_pages(doc: &serde_json::Value) -> Vec<PageText> {
    let mut by_page: BTreeMap<u32, Vec<String>> = BTreeMap::new();

    if let Some(texts) = doc.get("texts").and_then(|t| t.as_array()) {
        for item in texts {
            // ヘッダー・フッターは検索の邪魔になるので除外
            let label = item.get("label").and_then(|l| l.as_str()).unwrap_or("");
            if label == "page_header" || label == "page_footer" {
                continue;
            }
            let text = item.get("text").and_then(|t| t.as_str()).unwrap_or("").trim();
            if text.is_empty() {
                continue;
            }
            let page = item
                .get("prov")
                .and_then(|p| p.get(0))
                .and_then(|p| p.get("page_no"))
                .and_then(|n| n.as_u64());
            if let Some(page) = page {
                by_page.entry(page as u32).or_default().push(text.to_string());
            }
        }
    }

    by_page
        .into_iter()
        .map(|(page, lines)| PageText {
            page,
            text: lines.join("\n"),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_pages_groups_by_page() {
        let doc = serde_json::json!({
            "texts": [
                {"label": "section_header", "text": "見出し", "prov": [{"page_no": 1}]},
                {"label": "text", "text": "1ページ目の本文", "prov": [{"page_no": 1}]},
                {"label": "page_footer", "text": "1", "prov": [{"page_no": 1}]},
                {"label": "text", "text": "2ページ目の本文", "prov": [{"page_no": 2}]},
                {"label": "text", "text": "", "prov": [{"page_no": 2}]}
            ]
        });
        let pages = extract_pages(&doc);
        assert_eq!(pages.len(), 2);
        assert_eq!(pages[0].page, 1);
        assert_eq!(pages[0].text, "見出し\n1ページ目の本文");
        assert_eq!(pages[1].page, 2);
        assert_eq!(pages[1].text, "2ページ目の本文");
    }
}