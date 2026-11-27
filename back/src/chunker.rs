#![allow(dead_code)]

/// 1つのチャンクの長さの上限（文字数）
pub const MAX_CHARS: usize = 800;

/// 長い段落を分けるとき、次のチャンクの頭に重ねる文の数
const OVERLAP_SENTENCES: usize = 1;

/// 検索の単位。docs の chunks テーブルの項目（seq, text, page, heading）に合わせている
#[derive(Debug, Clone, PartialEq)]
pub struct Chunk {
    /// 資料の中の通し番号（0 から）
    pub seq: usize,
    /// いちばん近い見出し
    pub heading: Option<String>,
    /// 元の PDF のページ。今は常に None
    pub page: Option<u32>,
    /// 本文
    pub text: String,
}

impl Chunk {
    /// ベクトルにする文字列（見出し + 本文）
    /// 登録（#4）と検索（#5）で同じモデル・同じ処理を使う、という決まりのため、
    /// 文字列の作り方はここ1か所にまとめている
    pub fn embedding_input(&self) -> String {
        match &self.heading {
            Some(h) => format!("{h}\n{}", self.text),
            None => self.text.clone(),
        }
    }
}

enum Block {
    Paragraph(String),
    Table(Vec<String>),
}

struct Section {
    heading: Option<String>,
    blocks: Vec<Block>,
}

/// Markdown をチャンクに分ける
pub fn split(md: &str) -> Vec<Chunk> {
    let mut out = Vec::new();
    for section in parse_sections(md) {
        pack_section(section, &mut out);
    }
    out
}

// ---------------------------------------------------------------
// 1. Markdown を「見出しごとの、段落と表のかたまり」に分ける
// ---------------------------------------------------------------

struct Parser {
    sections: Vec<Section>,
    heading: Option<String>,
    blocks: Vec<Block>,
    para: Vec<String>,
    table: Vec<String>,
}

impl Parser {
    fn flush_para(&mut self) {
        if !self.para.is_empty() {
            let text = self.para.join("\n");
            self.blocks.push(Block::Paragraph(text));
            self.para.clear();
        }
    }

    fn flush_table(&mut self) {
        if !self.table.is_empty() {
            let rows = std::mem::take(&mut self.table);
            self.blocks.push(Block::Table(rows));
        }
    }

    fn end_section(&mut self) {
        self.flush_para();
        self.flush_table();
        if !self.blocks.is_empty() {
            self.sections.push(Section {
                heading: self.heading.clone(),
                blocks: std::mem::take(&mut self.blocks),
            });
        }
    }
}

fn parse_sections(md: &str) -> Vec<Section> {
    let mut p = Parser {
        sections: Vec::new(),
        heading: None,
        blocks: Vec::new(),
        para: Vec::new(),
        table: Vec::new(),
    };

    for line in md.lines() {
        let t = line.trim();

        if let Some(h) = heading_text(t) {
            p.end_section();
            p.heading = Some(h);
            continue;
        }
        if t.is_empty() {
            p.flush_para();
            p.flush_table();
            continue;
        }
        if is_noise(t) {
            continue;
        }
        if t.starts_with('|') {
            p.flush_para();
            p.table.push(t.to_string());
            continue;
        }
        p.flush_table();
        p.para.push(t.to_string());
    }
    p.end_section();
    p.sections
}

/// "## 見出し" なら "見出し" を返す。"#タグ" のように # のあとに空白が無いものは見出しにしない
fn heading_text(line: &str) -> Option<String> {
    if !line.starts_with('#') {
        return None;
    }
    let rest = line.trim_start_matches('#');
    if !rest.starts_with(char::is_whitespace) {
        return None;
    }
    let text = rest.trim();
    if text.is_empty() {
        None
    } else {
        Some(text.to_string())
    }
}

/// ページ番号・「- 3 -」・目次の行など、検索に要らない行
fn is_noise(line: &str) -> bool {
    let n = line.chars().count();

    // "12"
    if n <= 3 && line.chars().all(|c| c.is_ascii_digit()) {
        return true;
    }
    // "- 3 -" "ー 3 ー" "3 / 10"
    if n <= 9 {
        let core: String = line
            .chars()
            .filter(|c| !matches!(c, '-' | 'ー' | '―' | '−' | '—' | '–' | '/' | '／' | ' ' | '　'))
            .collect();
        if !core.is_empty()
            && core.chars().all(|c| c.is_ascii_digit())
            && line.chars().any(|c| !c.is_ascii_digit() && !c.is_whitespace())
        {
            return true;
        }
    }
    // 目次: "第1章 子育て支援 ……… 12"
    let has_leader = line.contains("……") || line.contains("・・・") || line.contains(".....");
    let ends_with_number = line
        .chars()
        .rev()
        .find(|c| !c.is_whitespace())
        .is_some_and(|c| c.is_ascii_digit());
    has_leader && ends_with_number
}

// ---------------------------------------------------------------
// 2. 1つの見出しの中身を、MAX_CHARS 以内のチャンクに詰める
// ---------------------------------------------------------------

fn char_len(s: &str) -> usize {
    s.chars().count()
}

fn pack_section(section: Section, out: &mut Vec<Chunk>) {
    let mut buf = String::new();

    for block in section.blocks {
        let pieces = match block {
            Block::Paragraph(p) => split_paragraph(&p),
            Block::Table(rows) => split_table(&rows),
        };
        for piece in pieces {
            if buf.is_empty() {
                buf = piece;
            } else if char_len(&buf) + 2 + char_len(&piece) <= MAX_CHARS {
                buf.push_str("\n\n");
                buf.push_str(&piece);
            } else {
                emit(out, &section.heading, std::mem::take(&mut buf));
                buf = piece;
            }
        }
    }
    if !buf.is_empty() {
        emit(out, &section.heading, buf);
    }
}

fn emit(out: &mut Vec<Chunk>, heading: &Option<String>, text: String) {
    let seq = out.len();
    out.push(Chunk {
        seq,
        heading: heading.clone(),
        page: None,
        text,
    });
}

/// 段落を MAX_CHARS 以内に分ける。分けるときは前の最後の文を次の頭に重ねる
fn split_paragraph(p: &str) -> Vec<String> {
    if char_len(p) <= MAX_CHARS {
        return vec![p.to_string()];
    }

    let sentences = split_sentences(p);
    let mut pieces = Vec::new();
    let mut cur: Vec<String> = Vec::new();
    let mut cur_len = 0;

    for s in sentences {
        let s_len = char_len(&s);
        if !cur.is_empty() && cur_len + s_len > MAX_CHARS {
            pieces.push(cur.concat());

            // 次のチャンクの頭に、前の最後の文を重ねる（重ねると入りきらないなら重ねない）
            let keep = cur.len().saturating_sub(OVERLAP_SENTENCES);
            let overlap: Vec<String> = cur[keep..].to_vec();
            let overlap_len: usize = overlap.iter().map(|x| char_len(x)).sum();
            if overlap_len + s_len <= MAX_CHARS {
                cur = overlap;
                cur_len = overlap_len;
            } else {
                cur = Vec::new();
                cur_len = 0;
            }
        }
        cur_len += s_len;
        cur.push(s);
    }
    if !cur.is_empty() {
        pieces.push(cur.concat());
    }
    pieces
}

/// 「。」「！」「？」と改行で文に分ける（区切りの文字は文の末尾に残す）。
/// 1文が MAX_CHARS を超える場合は、文字数で強制的に分ける
fn split_sentences(p: &str) -> Vec<String> {
    let mut sentences = Vec::new();
    let mut cur = String::new();

    for c in p.chars() {
        cur.push(c);
        if matches!(c, '。' | '！' | '？' | '!' | '?' | '\n') {
            sentences.push(std::mem::take(&mut cur));
        }
    }
    if !cur.is_empty() {
        sentences.push(cur);
    }

    let mut result = Vec::new();
    for s in sentences {
        if char_len(&s) <= MAX_CHARS {
            result.push(s);
        } else {
            let chars: Vec<char> = s.chars().collect();
            for part in chars.chunks(MAX_CHARS) {
                result.push(part.iter().collect());
            }
        }
    }
    result
}

/// 表は割らない。MAX_CHARS を超える大きな表だけ、行ごとに分けて見出し行を付け直す
fn split_table(rows: &[String]) -> Vec<String> {
    let whole = rows.join("\n");
    if char_len(&whole) <= MAX_CHARS {
        return vec![whole];
    }

    // 見出し行 + 区切り行（|---|---|）があれば、それを各チャンクに付ける
    let has_header = rows.len() >= 2 && is_table_separator(&rows[1]);
    let header: Vec<&String> = if has_header { rows[..2].iter().collect() } else { Vec::new() };
    let body = if has_header { &rows[2..] } else { rows };
    let header_len: usize = header.iter().map(|r| char_len(r) + 1).sum();

    let mut pieces = Vec::new();
    let mut cur: Vec<&String> = Vec::new();
    let mut cur_len = header_len;

    for row in body {
        let row_len = char_len(row) + 1;
        if !cur.is_empty() && cur_len + row_len > MAX_CHARS {
            pieces.push(join_table(&header, &cur));
            cur = Vec::new();
            cur_len = header_len;
        }
        cur.push(row);
        cur_len += row_len;
    }
    if !cur.is_empty() {
        pieces.push(join_table(&header, &cur));
    }
    pieces
}

fn join_table(header: &[&String], rows: &[&String]) -> String {
    header
        .iter()
        .chain(rows.iter())
        .map(|r| r.as_str())
        .collect::<Vec<_>>()
        .join("\n")
}

/// "|---|:---:|" のような、表の見出し行の下の区切り行か
fn is_table_separator(row: &str) -> bool {
    row.contains('-') && row.chars().all(|c| matches!(c, '|' | '-' | ':' | ' '))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 空の入力は空() {
        assert!(split("").is_empty());
        assert!(split("\n\n  \n").is_empty());
    }

    #[test]
    fn 見出しごとに分かれる() {
        let md = "# 子育て\n\n児童手当の説明です。\n\n# 税金\n\n住民税の説明です。";
        let chunks = split(md);
        assert_eq!(chunks.len(), 2);
        assert_eq!(chunks[0].heading.as_deref(), Some("子育て"));
        assert_eq!(chunks[0].text, "児童手当の説明です。");
        assert_eq!(chunks[1].heading.as_deref(), Some("税金"));
        assert_eq!(chunks[0].seq, 0);
        assert_eq!(chunks[1].seq, 1);
        assert!(chunks.iter().all(|c| c.page.is_none()));
    }

    #[test]
    fn 見出しの前の本文は見出しなし() {
        let chunks = split("前置きです。\n\n# 本編\n\n本文です。");
        assert_eq!(chunks[0].heading, None);
        assert_eq!(chunks[1].heading.as_deref(), Some("本編"));
    }

    #[test]
    fn 短い段落は同じ見出しの中でまとまる() {
        let chunks = split("# A\n\n一つ目。\n\n二つ目。\n\n三つ目。");
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].text, "一つ目。\n\n二つ目。\n\n三つ目。");
    }

    #[test]
    fn シャープの後ろに空白が無いものは見出しではない() {
        let chunks = split("#ハッシュタグです。");
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].heading, None);
    }

    #[test]
    fn ベクトルにする文字列は見出しが頭に付く() {
        let chunks = split("# ごみの出し方\n\n燃えるごみは月曜日です。");
        assert_eq!(
            chunks[0].embedding_input(),
            "ごみの出し方\n燃えるごみは月曜日です。"
        );
        assert_eq!(chunks[0].text, "燃えるごみは月曜日です。");
    }

    #[test]
    fn 長い段落は上限以内に分かれ_前後が1文重なる() {
        // 1文15文字 x 200文 = 3000文字
        let md: String = (0..200).map(|i| format!("文章番号{:03}はここまでです。", i)).collect();
        let chunks = split(&md);

        assert!(chunks.len() >= 3, "分かれていない: {}", chunks.len());
        for c in &chunks {
            assert!(char_len(&c.text) <= MAX_CHARS, "長すぎる: {}", char_len(&c.text));
        }
        // 前のチャンクの最後の文が、次のチャンクの頭にある
        for w in chunks.windows(2) {
            let last = w[0].text.split_inclusive('。').last().unwrap();
            assert!(w[1].text.starts_with(last), "重なっていない: {last}");
        }
        // 全部の文がどこかに入っている
        for i in 0..200 {
            let key = format!("文章番号{:03}", i);
            assert!(chunks.iter().any(|c| c.text.contains(&key)), "{key} が消えた");
        }
    }

    #[test]
    fn 句点の無い長すぎる1文は文字数で強制的に分ける() {
        let md = "あ".repeat(2000);
        let chunks = split(&md);
        assert!(chunks.len() >= 3);
        assert!(chunks.iter().all(|c| char_len(&c.text) <= MAX_CHARS));
        let total: usize = chunks.iter().map(|c| char_len(&c.text)).sum();
        assert_eq!(total, 2000);
    }

    #[test]
    fn 小さい表は割らない() {
        let md = "# 料金\n\n| 区分 | 金額 |\n|---|---|\n| 大人 | 300円 |\n| 子ども | 100円 |";
        let chunks = split(md);
        assert_eq!(chunks.len(), 1);
        assert!(chunks[0].text.contains("| 大人 | 300円 |"));
        assert!(chunks[0].text.contains("| 子ども | 100円 |"));
    }

    #[test]
    fn 大きい表は行で分け_見出し行を付け直す() {
        let mut md = String::from("| 氏名 | 住所 |\n|---|---|\n");
        for i in 0..100 {
            md.push_str(&format!("| 人物{:03} | 沼田町字どこそこ{:03}番地 |\n", i, i));
        }
        let chunks = split(&md);
        assert!(chunks.len() >= 2);
        for c in &chunks {
            assert!(c.text.starts_with("| 氏名 | 住所 |\n|---|---|"), "見出し行が無い");
            assert!(char_len(&c.text) <= MAX_CHARS);
        }
        // 全部の行が残っている
        for i in 0..100 {
            let key = format!("人物{:03}", i);
            assert!(chunks.iter().any(|c| c.text.contains(&key)), "{key} が消えた");
        }
    }

    #[test]
    fn 表は段落と混ざっても途中で切れない() {
        let md = "説明です。\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n補足です。";
        let chunks = split(md);
        let table_chunk = chunks.iter().find(|c| c.text.contains("| 1 | 2 |")).unwrap();
        assert!(table_chunk.text.contains("|---|---|"));
    }

    #[test]
    fn ページ番号と目次の行は捨てる() {
        let md = "# 広報\n\n本文です。\n\n12\n\n- 3 -\n\nー 4 ー\n\n5 / 10\n\n第1章 子育て支援 ……… 12\n\n続きです。";
        let chunks = split(md);
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].text, "本文です。\n\n続きです。");
    }

    #[test]
    fn 数字を含む普通の文は捨てない() {
        let md = "令和8年度は3回実施します。\n\n2026年4月1日から始まります。";
        let chunks = split(md);
        assert!(chunks[0].text.contains("3回"));
        assert!(chunks[0].text.contains("2026年4月1日"));
    }

    #[test]
    fn 見出しだけで本文が無い場合は捨てる() {
        let chunks = split("# 空の見出し\n\n# 本物\n\n本文。");
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].heading.as_deref(), Some("本物"));
    }

    #[test]
    fn 実際に近い広報誌の例() {
        let md = "\
# 広報ぬまた 2026年12月号

## 児童手当のお知らせ

児童手当は、18歳になった最初の3月31日までの子どもを養育している方に支給されます。申請は町民課の窓口で受け付けています。

## 国民健康保険

| 区分 | 納付期限 |
|---|---|
| 第1期 | 7月31日 |
| 第2期 | 8月31日 |

- 3 -
";
        let chunks = split(md);
        assert_eq!(chunks.len(), 2);
        assert_eq!(chunks[0].heading.as_deref(), Some("児童手当のお知らせ"));
        assert_eq!(chunks[1].heading.as_deref(), Some("国民健康保険"));
        assert!(chunks[1].text.contains("第2期"));
        assert!(!chunks[1].text.contains("- 3 -"));
    }
}
