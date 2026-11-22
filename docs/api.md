# ぬまコン API 仕様

フロントエンド班が作成した案をもとにしています。最後の「決めること」は、決まったら取りまとめ役が本文に反映します。

- 町民向けの API は `/api/...`、職員向けの API は `/api/admin/...` に置く（Caddy が `/api/admin/` にだけログインを求めるため）
- 日時は ISO 8601（UTC、例: `2026-11-22T13:00:00Z`）、日付だけのものは `YYYY-MM-DD`
- 値が無い項目は `null` にする（空文字にしない）

## 1. チャット（SSE）

- **Endpoint**: `POST /api/chat`
- **Request** (`application/json`)

```json
{ "message": "質問文" }
```

- **Response** (`text/event-stream`)

| event | data | 意味 |
|---|---|---|
| `chunk` | `{"text": "生成された文字..."}` | 回答の切れ端。届いた順につなげて表示する |
| `sources` | `{"sources": [{"doc_id": 1, "title": "資料名", "page": 3, "url": "/api/docs/1/file"}]}` | 出典。回答のあとに送る |
| `not_found` | `{"message": "該当する資料が見つかりませんでした。"}` | 資料に答えが無かった |
| `error` | `{"message": "エラー内容"}` | 回答の途中で失敗した |
| `done` | `{}` | 終わりの合図 |

## 2. 資料の登録

- **Endpoint**: `POST /api/admin/docs`
- **Request** (`multipart/form-data`)

| 項目 | 必須 | 型 | 備考 |
|---|---|---|---|
| `title` | 必須 | 文字列 | |
| `category` | 必須 | 文字列 | `広報誌` / `手続き・制度` / `イベント` / `その他` |
| `content` | 任意 | 文字列 | テキストだけの追加・補足説明 |
| `file` | 任意 | ファイル | 最大 20MB |
| `schedule` | 任意 | `YYYY-MM-DD` | 対象日程 |
| `publish` | 任意 | `YYYY-MM-DD` | 公開日 |

- **Response** 例

```json
{ "id": 12, "status": "pending" }
```

## 3. 資料の一覧取得

- **Endpoint**: `GET /api/admin/docs`
- **Response** 例

```json
{
  "docs": [
    {
      "id": 12,
      "title": "資料名",
      "category": "手続き・制度",
      "file_name": "sample.pdf",
      "schedule": null,
      "publish": "2026-04-01",
      "status": "done",
      "error_message": null,
      "created_at": "2026-11-22T13:00:00Z"
    }
  ]
}
```

- `status` は次の4つのどれか
  - `pending`: 処理待ち
  - `processing`: 処理中
  - `done`: 完了（検索に使える）
  - `failed`: 失敗（理由は `error_message`）

## 4. 資料の削除

- **Endpoint**: `DELETE /api/admin/docs/{id}`
- **Response**: `204 No Content`
- SQLite と Qdrant の両方から消す

## 5. 元の PDF の取得

- **Endpoint**: `GET /api/docs/{id}/file`
- 出典のリンク先。町民も開くので `/api/admin/` の外に置く

## 決めること

- **SSE のイベントの順番と終わり方**: 案として「`chunk` が0回以上 → `sources` → `done`」「`not_found` → `done`」「`error` → `done`」。フロントは `done` が来るまで待つ
- **SSE を始める前のエラー**: 質問が長すぎる、送りすぎなどは、SSE を始める前に通常の JSON と状態番号（400、429 など）で返す案。`event: error` は回答の途中で失敗したときだけに使う
- **SSE 以外のエラーの形**: 全 API で同じ形にそろえる。案:

```json
{ "error": { "code": "file_too_large", "message": "ファイルは20MBまでです" } }
```

- **状態番号**: 400（入力が不正）、404（無い）、413（ファイルが大きすぎる）、429（送りすぎ）、500（サーバーの不具合）
- **質問の長さの上限**（例: 500 文字）
- **受け付けるファイルの種類**: PDF だけにするか、画像も受け付けるか（現在の管理画面は画像も選べる）
- **PDF の無い資料**: `file_name` と出典の `url` を `null` にする
- **`/api/docs/{id}/file` で返す資料の条件**: 誰でも開けるので、「処理が完了していて、公開日を過ぎた資料だけ返す」などの条件が必要
- **削除の例外**: 無い ID は 404。処理中の資料を消したときの扱い
- **公開日より前の資料を検索の対象にするか**
- **回覧板の API**（一覧・詳細は `/api/notices`、作成・編集・削除は `/api/admin/notices` に置く案）
