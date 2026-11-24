use anyhow::Result;
use std::path::Path;

pub fn pdf_to_md(path: &Path) -> Result<String> {
    let text = pdf_extract::extract_text(path)?;
    Ok(to_markdown(&text))
}

fn to_markdown(text: &str) -> String {
    text.split("\n\n")
        .map(|p| p.lines().map(str::trim).collect::<Vec<_>>().join(" "))
        .filter(|p| !p.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n")
}