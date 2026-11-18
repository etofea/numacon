/* =========================================================
   ぬまコン 管理者画面 JavaScript (admin.js)
   行政資料と回覧板の「追加・編集・一覧表示・削除」を行う処理
========================================================= */

// =========================================================
// 0. 定数・保存キーの設定
// =========================================================
// アップロードできるファイルの上限サイズ（バイト単位で計算）
const MAX_DOC_SIZE = 20 * 1024 * 1024;   // 行政資料: 20MB
const MAX_PHOTO_SIZE = 8 * 1024 * 1024;  // 回覧板写真: 8MB

// ブラウザの保存領域にデータを保存するときの名前
const DOC_STORAGE_KEY = 'numacon_docs';
const NOTICE_STORAGE_KEY = 'numacon_notices';

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
}

// 各タブボタンがクリックされたときに切り替え関数を動かす
tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        switchTab(btn.dataset.target);
    });
});

// ==========================================
// 1. 行政資料の追加・一覧・削除
// ==========================================
// HTMLからフォームと一覧表示エリアを取得
const docForm = document.getElementById('docForm');
const adminDocList = document.getElementById('adminDocList');

// 保存済みの行政資料データをブラウザから読み込む関数
function loadDocs() {
    try {
        return JSON.parse(localStorage.getItem(DOC_STORAGE_KEY) || '[]');
    } catch (e) {
        return [];
    }
}

// 読み込んだ行政資料データを変数に入れておく
let docs = loadDocs();

// 行政資料データをブラウザに保存する関数
function saveDocs() {
    localStorage.setItem(DOC_STORAGE_KEY, JSON.stringify(docs));
}

// 「行政資料を登録する」ボタンが押されたときの処理
docForm.addEventListener('submit', (e) => {
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

    // 入力された内容を1つのデータにまとめる
    const newDoc = {
        id: 'doc-' + Date.now(),// 現在時刻を使って重複しないIDを作る
        title: document.getElementById('docTitle').value.trim(),
        category: document.getElementById('docCategory').value,
        content: document.getElementById('docContent').value.trim(),
        fileName: file ? file.name : 'なし',
        schedule: document.getElementById('docSchedule').value,
        publish: document.getElementById('docPublish').value
    };

    // 配列の先頭に追加して保存し、画面の入力欄をリセットして一覧を更新
    docs.unshift(newDoc);
    saveDocs();
    docForm.reset();
    renderDocs();
    alert('行政資料を登録しました。');
});

// 登録済みの行政資料を画面に一覧表示する関数
function renderDocs() {
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

        // カテゴリーのバッジ
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = doc.category;

        // タイトル
        const title = document.createElement('h4');
        title.textContent = doc.title;

        // ファイル名と公開日の補足情報
        const info = document.createElement('p');
        info.className = 'admin-help';
        info.textContent = `ファイル: ${doc.fileName} / 公開日: ${doc.publish || '未設定'}`;

        // 削除ボタンのエリア
        const buttons = document.createElement('div');
        buttons.className = 'admin-card-buttons';

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'delete-button';
        deleteBtn.textContent = '削除';

        // 削除ボタンが押されたときの処理
        deleteBtn.addEventListener('click', () => {
            if (!confirm(`「${doc.title}」を削除しますか？`)) return;
            docs = docs.filter(item => item.id !== doc.id);
            saveDocs();
            renderDocs();
        });

        buttons.appendChild(deleteBtn);
        card.append(badge, title, info, buttons);
        adminDocList.appendChild(card);
    });
}

// ==========================================
// 2. 回覧板の追加・編集・一覧・削除
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
    const prev = [...notices];// 保存失敗時に元に戻せるようバックアップ

    if (editingId) {
        // 【編集モード】すでに存在するデータを上書き更新する
        const idx = notices.findIndex(n => n.id === editingId);
        if (idx !== -1) {
            notices[idx] = { ...notices[idx], type: noticeType.value, title, content, photo: currentPhoto };
        }
    } else {
        // 【新規追加モード】新しいデータを配列の先頭に追加する
        notices.unshift({
            id: `notice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type: noticeType.value,
            title,
            content,
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
// 画面を開いた瞬間に、保存済みの行政資料と回覧板を一覧に表示する
renderDocs();
renderAdminNotices();