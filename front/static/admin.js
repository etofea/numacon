/* =========================================================
   ぬまコン 管理者画面 JavaScript (admin.js)
   行政資料の「API連携（追加・一覧表示・処理状態の自動更新・削除）」と
   回覧板の「追加・編集・一覧表示・削除」を行う処理
========================================================= */

// =========================================================
// 0. 定数・保存キーの設定
// =========================================================
// アップロードできるファイルの上限サイズ（バイト単位で計算）
const MAX_DOC_SIZE = 20 * 1024 * 1024;   // 行政資料: 20MB
const MAX_PHOTO_SIZE = 8 * 1024 * 1024;  // 回覧板写真: 8MB

// ブラウザの保存領域にデータを保存するときの名前（回覧板はプロトタイプ段階のためlocalStorage）
const NOTICE_STORAGE_KEY = 'numacon_notices';

// 行政資料APIの接続先URLと、処理状態を自動更新する間隔
const DOC_API_BASE = '/api/admin/docs';
const POLLING_INTERVAL_MS = 5000;        // 5000ミリ秒 = 5秒ごとに更新

// サーバーから返ってくる処理状態（status）を、画面表示用の日本語と色（CSSクラス）に対応させる表
const STATUS_MAP = {
    pending:    { label: '処理待ち', className: 'status-pending' },
    processing: { label: '処理中…',  className: 'status-processing' },
    done:       { label: '完了',     className: 'status-done' },
    failed:     { label: '失敗',     className: 'status-failed' }
};

// 5秒ごとの自動更新タイマーを管理するための変数（停止するときに使う）
let docPollingTimer = null;

// =========================================================
// 1. 左側サイドバーのタブ切り替え処理
// =========================================================
// タブボタンと切り替わる中身をすべて取得
const tabButtons = document.querySelectorAll('.admin-tab-btn');
const tabContents = document.querySelectorAll('.admin-tab-content');

// 指定されたIDのタブだけを表示し他を隠す関数
function switchTab(targetId) {
    // 選択されたボタンだけ色を変える
    tabButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.target === targetId);
    });
    // 対象の画面だけ表示（block）し、それ以外は非表示（none）にする
    tabContents.forEach(content => {
        content.style.display = (content.id === targetId) ? 'block' : 'none';
    });

    // 「行政資料の一覧・削除」タブを開いている間だけ、一覧を取得して5秒ごとに自動更新する
    if (targetId === 'tab-list-doc') {
        fetchAndRenderDocs();
        startDocPolling();
    } else {
        // 別のタブに移ったら無駄な通信を防ぐために自動更新を止める
        stopDocPolling();
    }
}

// 各タブボタンがクリックされたときに切り替え関数を動かす
tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        switchTab(btn.dataset.target);
    });
});

// ==========================================
// 2. 行政資料の追加・一覧・削除（API連携）
// ==========================================
// HTMLからフォーム、一覧表示エリア、送信ボタンを取得
const docForm = document.getElementById('docForm');
const adminDocList = document.getElementById('adminDocList');
const docSubmitBtn = docForm.querySelector('button[type="submit"]');

// 5秒ごとにサーバーから資料一覧を取り直すタイマーを開始する関数
function startDocPolling() {
    if (docPollingTimer) return; // すでに動いていれば二重起動しない
    docPollingTimer = setInterval(() => {
        fetchAndRenderDocs(true); // true = 裏での自動更新（通信失敗時に画面をエラーで上書きしない）
    }, POLLING_INTERVAL_MS);
}

// 自動更新タイマーを止める関数
function stopDocPolling() {
    if (docPollingTimer) {
        clearInterval(docPollingTimer);
        docPollingTimer = null;
    }
}

// 「行政資料を登録する」ボタンが押されたときの処理
docForm.addEventListener('submit', async (e) => {
    // フォーム送信時の画面リロードを防ぐ
    e.preventDefault();

    // 選択された添付ファイルを取得し、20MBを超えていたらエラーを出す
    const fileInput = document.getElementById('docFile');
    const file = fileInput.files[0];

    if (file && file.size > MAX_DOC_SIZE) {
        alert('行政資料のファイルサイズは20MB以下にしてください。');
        fileInput.value = '';
        return;
    }

    // 入力された内容とファイルをまとめて送るための箱（FormData）を作る
    const formData = new FormData();
    formData.append('title', document.getElementById('docTitle').value.trim());
    formData.append('category', document.getElementById('docCategory').value);
    formData.append('content', document.getElementById('docContent').value.trim());
    if (file) {
        formData.append('file', file);
    }
    formData.append('schedule', document.getElementById('docSchedule').value);
    formData.append('publish', document.getElementById('docPublish').value);

    // 送信中に二重押しされないようボタンを無効化する
    docSubmitBtn.disabled = true;
    const originalBtnText = docSubmitBtn.textContent;
    docSubmitBtn.textContent = '送信中…';

    try {
        // バックエンドAPIへFormDataを送信する（※FormData時はContent-Typeを手動設定しない）
        const res = await fetch(DOC_API_BASE, {
            method: 'POST',
            body: formData
        });

        // サーバーからエラー番号が返ってきた場合は失敗として扱う
        if (!res.ok) {
            throw new Error(`登録に失敗しました (HTTP ${res.status})`);
        }

        // 入力欄をリセットし、登録した資料の処理状況が見える一覧タブへ移動する
        docForm.reset();
        alert('行政資料を登録しました。一覧画面で処理状況を確認できます。');
        switchTab('tab-list-doc');
    } catch (err) {
        console.error('資料登録エラー:', err);
        alert(`資料の登録に失敗しました。\n（バックエンドAPIが未実装、または通信エラーの可能性があります）\n詳細: ${err.message}`);
    } finally {
        // 成功・失敗にかかわらず、最後にボタンを元の状態に戻す
        docSubmitBtn.disabled = false;
        docSubmitBtn.textContent = originalBtnText;
    }
});

// サーバーから登録済みの行政資料一覧と処理状態を取得する関数
async function fetchAndRenderDocs(isSilent = false) {
    try {
        const res = await fetch(DOC_API_BASE, { method: 'GET' });
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        // { docs: [...] } 形式でも、配列がそのまま返ってきても対応できるようにする
        const docList = Array.isArray(data) ? data : (data.docs || []);
        renderDocs(docList);
    } catch (err) {
        console.error('資料一覧取得エラー:', err);
        // 初回表示や手動更新のときだけ、画面にエラーメッセージを出す
        if (!isSilent) {
            adminDocList.replaceChildren();
            const msg = document.createElement('p');
            msg.className = 'empty-message';
            msg.textContent = `資料一覧を取得できませんでした（${err.message}）。バックエンドの /api/admin/docs が起動しているか確認してください。`;
            adminDocList.appendChild(msg);
        }
    }
}

// 取得した行政資料を画面に一覧表示する関数
function renderDocs(docs) {
    adminDocList.replaceChildren();
    // 1件も登録されていない場合
    if (docs.length === 0) {
        adminDocList.innerHTML = '<p class="empty-message">登録済みの行政資料はありません。</p>';
        return;
    }

    // 登録されている件数分だけカードを作って画面に並べる
    docs.forEach(doc => {
        const card = document.createElement('div');
        card.className = 'admin-notice-card';

        // カテゴリーと処理状態のバッジを横並びにするエリア
        const badgeRow = document.createElement('div');
        badgeRow.className = 'doc-badge-row';

        // カテゴリーのバッジ
        const categoryBadge = document.createElement('span');
        categoryBadge.className = 'badge';
        categoryBadge.textContent = doc.category || 'その他';

        // 処理状態（処理待ち・処理中・完了・失敗）のバッジ
        const statusInfo = STATUS_MAP[doc.status] || { label: doc.status || '不明', className: 'status-pending' };
        const statusBadge = document.createElement('span');
        statusBadge.className = `status-badge ${statusInfo.className}`;
        statusBadge.textContent = statusInfo.label;

        badgeRow.append(categoryBadge, statusBadge);

        // タイトル
        const title = document.createElement('h4');
        title.textContent = doc.title;

        // ファイル名と公開日の補足情報（値がnullのときは「なし」「未設定」と表示）
        const info = document.createElement('p');
        info.className = 'admin-help';
        const fileName = doc.file_name || doc.fileName || 'なし';
        info.textContent = `ファイル: ${fileName} / 公開日: ${doc.publish || '未設定'}`;

        card.append(badgeRow, title, info);

        // 処理が失敗（failed）していて理由がある場合は、赤枠で失敗理由を表示する
        if (doc.status === 'failed' && doc.error_message) {
            const errorReason = document.createElement('p');
            errorReason.className = 'doc-error-reason';
            errorReason.textContent = `失敗理由: ${doc.error_message}`;
            card.appendChild(errorReason);
        }

        // 削除ボタンのエリア
        const buttons = document.createElement('div');
        buttons.className = 'admin-card-buttons';

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'delete-button';
        deleteBtn.textContent = '削除';

        // 削除ボタンが押されたときの処理（確認ダイアログを出してからAPIで削除）
        deleteBtn.addEventListener('click', async () => {
            if (!confirm(`「${doc.title}」を削除しますか？`)) return;

            deleteBtn.disabled = true;
            deleteBtn.textContent = '削除中…';

            try {
                const res = await fetch(`${DOC_API_BASE}/${encodeURIComponent(doc.id)}`, {
                    method: 'DELETE'
                });
                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}`);
                }
                // 削除に成功したら一覧を取り直して画面を更新する
                await fetchAndRenderDocs();
            } catch (err) {
                console.error('資料削除エラー:', err);
                alert(`削除に失敗しました: ${err.message}`);
                deleteBtn.disabled = false;
                deleteBtn.textContent = '削除';
            }
        });

        buttons.appendChild(deleteBtn);
        card.appendChild(buttons);
        adminDocList.appendChild(card);
    });
}

// ==========================================
// 3. 回覧板の追加・編集・一覧・削除
// ==========================================
// HTMLから回覧板フォームやプレビュー用の要素を取得
const noticeForm = document.getElementById('noticeForm');
const noticeId = document.getElementById('noticeId');
const noticeType = document.getElementById('noticeType');
const noticeTitleInput = document.getElementById('noticeTitleInput');
const noticeContentInput = document.getElementById('noticeContentInput');
const noticePhotoInput = document.getElementById('noticePhotoInput');
const photoPreviewArea = document.getElementById('photoPreviewArea');
const photoPreview = document.getElementById('photoPreview');
const removePhotoBtn = document.getElementById('removePhotoBtn');
const saveNoticeBtn = document.getElementById('saveNoticeBtn');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const adminFormHeading = document.getElementById('adminFormHeading');
const adminNoticeList = document.getElementById('adminNoticeList');

function getTodayString() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// 選択・縮小された画像データを一時的に入れる変数
let currentPhoto = '';

// 保存済みの回覧板データをブラウザから読み込む関数
function loadNotices() {
    try {
        return JSON.parse(localStorage.getItem(NOTICE_STORAGE_KEY) || '[]');
    } catch (e) {
        return [];
    }
}

// 読み込んだ回覧板データを変数に入れておく
let notices = loadNotices();

// 回覧板データをブラウザに保存する関数
function saveNotices() {
    try {
        localStorage.setItem(NOTICE_STORAGE_KEY, JSON.stringify(notices));
        return true;
    } catch (e) {
        alert('保存できませんでした。写真のサイズが大きすぎる可能性があります。');
        return false;
    }
}

// 回覧板の入力フォームを新規追加モードに戻す関数
function resetNoticeForm() {
    noticeForm.reset();
    noticeId.value = '';
    noticePublishInput.value = getTodayString();
    currentPhoto = '';
    photoPreview.removeAttribute('src');
    photoPreviewArea.style.display = 'none';
    adminFormHeading.textContent = '📋 回覧板の追加';
    saveNoticeBtn.textContent = '回覧板を登録する';
    cancelEditBtn.style.display = 'none';
}

// 写真ファイルが選択されたときの処理
noticePhotoInput.addEventListener('change', () => {
    const file = noticePhotoInput.files[0];
    if (!file) return;

    // 画像以外のファイルが選ばれたら弾く
    if (!file.type.startsWith('image/')) {
        alert('画像ファイルを選択してください。');
        noticePhotoInput.value = '';
        return;
    }

    // 8MBを超えていたら弾く
    if (file.size > MAX_PHOTO_SIZE) {
        alert('写真は8MB以下のファイルを選択してください。');
        noticePhotoInput.value = '';
        return;
    }

    // 画像を読み込んで最大幅1000pxに自動縮小する
    const reader = new FileReader();
    reader.onload = () => {
        const image = new Image();
        image.onload = () => {
            const maxSide = 1000;
            const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(image.width * scale));
            canvas.height = Math.max(1, Math.round(image.height * scale));
            const context = canvas.getContext('2d');
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            // 縮小した画像をJPEGデータに変換してプレビュー表示
            currentPhoto = canvas.toDataURL('image/jpeg', 0.75);
            photoPreview.src = currentPhoto;
            photoPreviewArea.style.display = 'flex';
        };
        image.src = reader.result;
    };
    reader.readAsDataURL(file);
});

// 「写真を外す」ボタンが押されたときの処理
removePhotoBtn.addEventListener('click', () => {
    currentPhoto = '';
    noticePhotoInput.value = '';
    photoPreview.removeAttribute('src');
    photoPreviewArea.style.display = 'none';
});

// 「編集をキャンセル」ボタンが押されたときの処理
cancelEditBtn.addEventListener('click', () => {
    resetNoticeForm();
    switchTab('tab-list-notice');
});

// 「回覧板を登録する」ボタンが押されたときの処理
noticeForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = noticeTitleInput.value.trim();
    const content = noticeContentInput.value.trim();
    if (!title || !content) return;

const editingId = noticeId.value;
    const prev = [...notices]; // 保存失敗時に元に戻せるようバックアップ
    const publish = noticePublishInput.value || getTodayString();

    if (editingId) {
        // 【編集モード】すでに存在するデータを上書き更新する
        const idx = notices.findIndex(n => n.id === editingId);
        if (idx !== -1) {
            notices[idx] = { ...notices[idx], type: noticeType.value, title, content, publish, photo: currentPhoto };
        }
    } else {
        // 【新規追加モード】新しいデータを配列の先頭に追加する
        notices.unshift({
            id: `notice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type: noticeType.value,
            title,
            content,
            publish,
            photo: currentPhoto
        });
    }
    // 保存に失敗したらデータを元に戻して中断
    if (!saveNotices()) {
        notices = prev;
        return;
    }

    renderAdminNotices();
    resetNoticeForm();
    alert(editingId ? '回覧板を更新しました。' : '回覧板を登録しました。');
});

// 登録済みの回覧板を画面に一覧表示する関数
function renderAdminNotices() {
    adminNoticeList.replaceChildren();
    if (notices.length === 0) {
        adminNoticeList.innerHTML = '<p class="empty-message">登録済みの回覧板はありません。</p>';
        return;
    }
    // 登録されている件数分だけカードを作って画面に並べる
    notices.forEach(notice => {
        const card = document.createElement('div');
        card.className = 'admin-notice-card';

        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = notice.type;

        const title = document.createElement('h4');
        title.textContent = notice.title;

        const buttons = document.createElement('div');
        buttons.className = 'admin-card-buttons';

        // 「編集」ボタンの作成とクリック時の処理
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.textContent = '編集';
        editBtn.addEventListener('click', () => {
            // 選んだ回覧板の内容を入力フォームにセットする
            noticeId.value = notice.id;
            noticeType.value = notice.type;
            noticeTitleInput.value = notice.title;
            noticeContentInput.value = notice.content;
            noticePublishInput.value = notice.publish || getTodayString();
            currentPhoto = notice.photo || '';
            noticePhotoInput.value = '';

            if (currentPhoto) {
                photoPreview.src = currentPhoto;
                photoPreviewArea.style.display = 'flex';
            } else {
                photoPreview.removeAttribute('src');
                photoPreviewArea.style.display = 'none';
            }

            // フォームの見出しやボタンを「編集モード」の見た目に変える
            adminFormHeading.textContent = '📋 回覧板を編集';
            saveNoticeBtn.textContent = '変更を保存';
            cancelEditBtn.style.display = 'inline-block';
            switchTab('tab-add-notice');// 入力フォームのタブに自動移動
        });

        // 「削除」ボタンの作成とクリック時の処理
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'delete-button';
        deleteBtn.textContent = '削除';
        deleteBtn.addEventListener('click', () => {
            if (!confirm(`「${notice.title}」を削除しますか？`)) return;
            notices = notices.filter(n => n.id !== notice.id);
            saveNotices();
            // もし削除したデータを編集中だったらフォームもリセット
            if (noticeId.value === notice.id) resetNoticeForm();
            renderAdminNotices();
        });

        buttons.append(editBtn, deleteBtn);
        card.append(badge, title, buttons);
        adminNoticeList.appendChild(card);
    });
}

// =========================================================
// 4. ページ読み込み時の初期表示
// =========================================================
// 画面を開いた瞬間に、保存済みの回覧板を一覧に表示する

noticePublishInput.value = getTodayString();
renderAdminNotices();