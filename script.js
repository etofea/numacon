
/* =========================================================
   ぬまコン JavaScript
   画面切り替え・チャット・回覧板管理
   JSのコードは、HTMLの構造に依存しているため、HTMLを変更した場合は
    JSも修正する必要があります。
    変えたくないです：：
    githubtest
========================================================= */


/* =========================================================
   ① HTML要素の取得
========================================================= */

const homeScreen = document.getElementById('homeScreen');
const voiceChatScreen = document.getElementById('voiceChatScreen');
const textChatScreen = document.getElementById('textChatScreen');
const noticeListScreen = document.getElementById('noticeListScreen');
const noticeDetailScreen = document.getElementById('noticeDetailScreen');
const adminScreen = document.getElementById('adminScreen');

const voiceSearchBtn = document.getElementById('voiceSearchBtn');
const textSearchBtn = document.getElementById('textSearchBtn');
const voiceBackBtn = document.getElementById('voiceBackBtn');
const textBackBtn = document.getElementById('textBackBtn');
const noticeListBtn = document.getElementById('noticeListBtn');
const noticeListBackBtn = document.getElementById('noticeListBackBtn');
const noticeDetailBackBtn = document.getElementById('noticeDetailBackBtn');
const adminScreenBtn = document.getElementById('adminScreenBtn');
const adminBackBtn = document.getElementById('adminBackBtn');

const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const textChatArea = document.getElementById('textChatArea');

const detailBadge = document.getElementById('detailBadge');
const detailTitle = document.getElementById('detailTitle');
const detailContent = document.getElementById('detailContent');
const detailPhotoArea = document.getElementById('detailPhotoArea');
const detailPhoto = document.getElementById('detailPhoto');

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


/* =========================================================
   ② 画面切り替え
   表示する画面以外を非表示にする
========================================================= */

function showScreen(screen) {
    const screens = [
        homeScreen,
        voiceChatScreen,
        textChatScreen,
        noticeListScreen,
        noticeDetailScreen,
        adminScreen
    ];

    screens.forEach(item => {
        if (item) {
            item.style.display = 'none';
        }
    });

    if (screen) {
        screen.style.display = 'flex';
    }
}

// 音声検索画面を開く
voiceSearchBtn.addEventListener('click', () => {
    showScreen(voiceChatScreen);
});

// テキスト検索画面を開く
textSearchBtn.addEventListener('click', () => {
    showScreen(textChatScreen);
});

// 音声検索画面から戻る
voiceBackBtn.addEventListener('click', () => {
    showScreen(homeScreen);
});

// テキスト検索画面から戻る
textBackBtn.addEventListener('click', () => {
    showScreen(homeScreen);
});

// 回覧板一覧を開く
noticeListBtn.addEventListener('click', event => {
    event.preventDefault();

    renderNotices();
    showScreen(noticeListScreen);
});

// 回覧板一覧から戻る
noticeListBackBtn.addEventListener('click', () => {
    showScreen(homeScreen);
});

// 管理者画面を開く
// 管理者画面を開く（パスワード保護付き）
adminScreenBtn.addEventListener('click', () => {
    // パスワード入力画面を表示
    const password = prompt('管理者用のパスワードを入力してください。');

    // パスワードが一致するかチェック（ここでは例として「numata2026」に設定）
    if (password === 'numata2026') {
        resetNoticeForm();
        renderAdminNotices();
        showScreen(adminScreen);
    } else if (password !== null) {
        // キャンセルを押した時は画面遷移せず、間違えた場合のみエラーを出す
        alert('パスワードが違います。');
    }
});

// 管理者画面から戻る
adminBackBtn.addEventListener('click', () => {
    resetNoticeForm();
    showScreen(homeScreen);
});


/* =========================================================
   ③ テキストチャット
   既存の試作用応答を維持
========================================================= */

function sendMessage() {
    const text = chatInput.value.trim();

    // 空欄の場合は送信しない
    if (text === '') {
        return;
    }

    // ユーザーのメッセージを表示
    const userBubble = document.createElement('div');

    userBubble.className = 'chat-bubble user';
    userBubble.textContent = text;

    textChatArea.appendChild(userBubble);

    // 入力欄を空にする
    chatInput.value = '';

    // 最新のメッセージまでスクロール
    textChatArea.scrollTop = textChatArea.scrollHeight;

    // 試作用の応答を表示
    setTimeout(() => {
        const aiBubble = document.createElement('div');

        aiBubble.className = 'chat-bubble ai';
        aiBubble.textContent =
            `「${text}」ですね。少しお待ちください...`;

        textChatArea.appendChild(aiBubble);

        textChatArea.scrollTop = textChatArea.scrollHeight;
    }, 1000);
}

// 送信ボタン
sendBtn.addEventListener('click', sendMessage);

// Enterキーで送信
chatInput.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.isComposing) {
        event.preventDefault();
        sendMessage();
    }
});


/* =========================================================
   ④ 回覧板データの保存・読み込み
   localStorageを使用する
========================================================= */

const STORAGE_KEY = 'numacon_notices';

/*
 * 初回起動時のデータをHTMLから取得する。
 * localStorageに保存済みのデータがある場合は、
 * そちらを優先する。
 */
function getInitialNotices() {
    const existingItems = document.querySelectorAll(
        '#noticeListScreen .notice-item.clickable'
    );

    return Array.from(existingItems).map((item, index) => ({
        id: `initial-${index}`,

        type:
            item.querySelector('.badge')?.textContent.trim()
            || 'お知らせ',

        title:
            item.getAttribute('data-title')
            || item.querySelector('.notice-title')?.textContent.trim()
            || 'お知らせ',

        content:
            item.getAttribute('data-content') || '',

        photo: ''
    }));
}

// 保存済みデータを読み込む
function loadNotices() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);

        if (saved !== null) {
            const parsed = JSON.parse(saved);

            if (Array.isArray(parsed)) {
                return parsed;
            }
        }
    } catch (error) {
        console.error(
            '回覧板データの読み込みに失敗しました。',
            error
        );
    }

    return getInitialNotices();
}

// 回覧板データ
let notices = loadNotices();

// localStorageに保存する
function saveNotices() {
    try {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(notices)
        );

        return true;
    } catch (error) {
        alert(
            '保存できませんでした。\n' +
            '写真のサイズが大きすぎる可能性があります。\n' +
            '写真を小さくして、もう一度お試しください。'
        );

        console.error(
            '回覧板データの保存に失敗しました。',
            error
        );

        return false;
    }
}


/* =========================================================
   ⑤ 回覧板一覧の表示
   ホーム画面には先頭2件、一覧画面には全件表示
========================================================= */

// 回覧板の表示要素を作成する
function createNoticeItem(notice) {
    const item = document.createElement('div');

    item.className = 'notice-item clickable';
    item.tabIndex = 0;
    item.setAttribute('role', 'button');
    item.dataset.noticeId = notice.id;

    // 種類
    const badge = document.createElement('span');

    badge.className = 'badge';
    badge.textContent = notice.type;

    // タイトル
    const title = document.createElement('span');

    title.className = 'notice-title';
    title.textContent = notice.title;

    item.append(badge, title);

    // クリックして詳細を開く
    item.addEventListener('click', () => {
        openNoticeDetail(notice.id);
    });

    // キーボードでも開けるようにする
    item.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openNoticeDetail(notice.id);
        }
    });

    return item;
}

// ホーム画面と一覧画面を更新する
function renderNotices() {
    const homeList = document.querySelector(
        '#homeScreen .notice-list'
    );

    const fullList = document.querySelector(
        '#noticeListScreen .notice-list'
    );

    // ホーム画面
    if (homeList) {
        homeList.replaceChildren();

        notices.slice(0, 4).forEach(notice => {
            homeList.appendChild(
                createNoticeItem(notice)
            );
        });
    }

    // 回覧板一覧画面
    if (fullList) {
        fullList.replaceChildren();

        if (notices.length === 0) {
            const emptyMessage = document.createElement('p');

            emptyMessage.className = 'empty-message';
            emptyMessage.textContent =
                '現在、回覧板はありません。';

            fullList.appendChild(emptyMessage);
        } else {
            notices.forEach(notice => {
                fullList.appendChild(
                    createNoticeItem(notice)
                );
            });
        }
    }
}


/* =========================================================
   ⑥ 回覧板の詳細表示
   本文と写真を表示する
========================================================= */

// 詳細画面を開く前の画面
let lastScreen = homeScreen;

function openNoticeDetail(id) {
    const notice = notices.find(item => item.id === id);

    if (!notice) {
        return;
    }

    // 戻るボタンで戻る画面を記録
    if (noticeListScreen.style.display !== 'none') {
        lastScreen = noticeListScreen;
    } else {
        lastScreen = homeScreen;
    }

    // 種類・タイトル・本文
    detailBadge.textContent = notice.type;
    detailTitle.textContent = notice.title;
    detailContent.textContent = notice.content;

    // 写真がある場合だけ表示
    if (notice.photo) {
        detailPhoto.src = notice.photo;
        detailPhotoArea.style.display = 'block';
    } else {
        detailPhoto.removeAttribute('src');
        detailPhotoArea.style.display = 'none';
    }

    showScreen(noticeDetailScreen);
}

// 詳細画面から戻る
noticeDetailBackBtn.addEventListener('click', () => {
    showScreen(lastScreen || homeScreen);
});


/* =========================================================
   ⑦ 管理者画面：フォームの初期化
========================================================= */

// 現在選択されている写真
let currentPhoto = '';

// フォームを新規登録状態に戻す
function resetNoticeForm() {
    noticeForm.reset();

    noticeId.value = '';
    currentPhoto = '';

    photoPreview.removeAttribute('src');
    photoPreviewArea.style.display = 'none';

    adminFormHeading.textContent = '新しい回覧板を登録';
    saveNoticeBtn.textContent = '登録する';

    cancelEditBtn.style.display = 'none';
}


/* =========================================================
   ⑧ 写真の選択・プレビュー
   画像を縮小して保存容量を抑える
========================================================= */

noticePhotoInput.addEventListener('change', () => {
    const file = noticePhotoInput.files[0];

    if (!file) {
        return;
    }

    // 画像ファイルか確認
    if (!file.type.startsWith('image/')) {
        alert('画像ファイルを選択してください。');

        noticePhotoInput.value = '';
        return;
    }

    // 元画像は8MB以下に制限
    if (file.size > 8 * 1024 * 1024) {
        alert(
            '写真は8MB以下のファイルを選択してください。'
        );

        noticePhotoInput.value = '';
        return;
    }

    const reader = new FileReader();

    reader.onload = () => {
        const image = new Image();

        image.onload = () => {
            // 最大辺を1000pxに縮小
            const maxSide = 1000;

            const scale = Math.min(
                1,
                maxSide / Math.max(
                    image.width,
                    image.height
                )
            );

            const canvas = document.createElement('canvas');

            canvas.width = Math.max(
                1,
                Math.round(image.width * scale)
            );

            canvas.height = Math.max(
                1,
                Math.round(image.height * scale)
            );

            const context = canvas.getContext('2d');

            if (!context) {
                alert('写真を処理できませんでした。');
                return;
            }

            context.drawImage(
                image,
                0,
                0,
                canvas.width,
                canvas.height
            );

            // JPEG形式に変換
            currentPhoto = canvas.toDataURL(
                'image/jpeg',
                0.75
            );

            // プレビューを表示
            photoPreview.src = currentPhoto;
            photoPreviewArea.style.display = 'flex';
        };

        image.onerror = () => {
            alert(
                '写真を読み込めませんでした。' +
                '別の画像をお試しください。'
            );
        };

        image.src = reader.result;
    };

    reader.onerror = () => {
        alert('写真の読み込みに失敗しました。');
    };

    reader.readAsDataURL(file);
});

// 選択中の写真を外す
removePhotoBtn.addEventListener('click', () => {
    currentPhoto = '';

    noticePhotoInput.value = '';

    photoPreview.removeAttribute('src');
    photoPreviewArea.style.display = 'none';
});


/* =========================================================
   ⑨ 回覧板の登録・編集
========================================================= */

noticeForm.addEventListener('submit', event => {
    event.preventDefault();

    const title = noticeTitleInput.value.trim();
    const content = noticeContentInput.value.trim();

    // 必須項目の確認
    if (!title || !content) {
        alert('タイトルと本文を入力してください。');
        return;
    }

    const editingId = noticeId.value;

    // 保存前の状態を記録
    const previousNotices = notices;

    if (editingId) {
        // 編集対象を探す
        const index = notices.findIndex(
            item => item.id === editingId
        );

        if (index === -1) {
            alert('編集する回覧板が見つかりません。');
            return;
        }

        // 既存データを更新
        notices = [...notices];

        notices[index] = {
            ...notices[index],
            type: noticeType.value,
            title: title,
            content: content,
            photo: currentPhoto
        };

    } else {
        // 新しい回覧板を追加
        const newNotice = {
            id:
                `notice-${Date.now()}-` +
                Math.random().toString(36).slice(2, 8),

            type: noticeType.value,
            title: title,
            content: content,
            photo: currentPhoto
        };

        notices = [newNotice, ...notices];
    }

    // 保存に失敗したら元の状態に戻す
    if (!saveNotices()) {
        notices = previousNotices;
        return;
    }

    // 一覧と管理者画面を更新
    renderNotices();
    renderAdminNotices();

    // フォームを初期化
    resetNoticeForm();

    alert(
        editingId
            ? '回覧板を更新しました。'
            : '回覧板を登録しました。'
    );
});


/* =========================================================
   ⑩ 編集のキャンセル
========================================================= */

cancelEditBtn.addEventListener('click', () => {
    resetNoticeForm();
});


/* =========================================================
   ⑪ 登録済み回覧板の管理一覧
   編集・削除ボタンを表示する
========================================================= */

function renderAdminNotices() {
    adminNoticeList.replaceChildren();

    // 登録がない場合
    if (notices.length === 0) {
        const message = document.createElement('p');

        message.className = 'empty-message';
        message.textContent =
            '登録済みの回覧板はありません。';

        adminNoticeList.appendChild(message);
        return;
    }

    notices.forEach(notice => {
        // 回覧板カード
        const card = document.createElement('div');

        card.className = 'admin-notice-card';

        // 種類
        const type = document.createElement('span');

        type.className = 'badge';
        type.textContent = notice.type;

        // タイトル
        const title = document.createElement('h4');

        title.textContent = notice.title;

        // ボタンエリア
        const buttons = document.createElement('div');

        buttons.className = 'admin-card-buttons';

        // 編集ボタン
        const editButton = document.createElement('button');

        editButton.type = 'button';
        editButton.textContent = '編集';

        editButton.addEventListener('click', () => {
            // 選択した内容をフォームに入れる
            noticeId.value = notice.id;
            noticeType.value = notice.type;
            noticeTitleInput.value = notice.title;
            noticeContentInput.value = notice.content;

            currentPhoto = notice.photo || '';

            noticePhotoInput.value = '';

            // 写真のプレビュー
            if (currentPhoto) {
                photoPreview.src = currentPhoto;
                photoPreviewArea.style.display = 'flex';
            } else {
                photoPreview.removeAttribute('src');
                photoPreviewArea.style.display = 'none';
            }

            // 編集モードに切り替える
            adminFormHeading.textContent = '回覧板を編集';
            saveNoticeBtn.textContent = '変更を保存';

            cancelEditBtn.style.display = 'inline-block';

            // フォームまでスクロール
            noticeForm.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        });

        // 削除ボタン
        const deleteButton = document.createElement('button');

        deleteButton.type = 'button';
        deleteButton.textContent = '削除';
        deleteButton.className = 'delete-button';

        deleteButton.addEventListener('click', () => {
            // 削除前に確認
            const confirmed = confirm(
                `「${notice.title}」を削除しますか？`
            );

            if (!confirmed) {
                return;
            }

            const previousNotices = notices;

            notices = notices.filter(
                item => item.id !== notice.id
            );

            // 保存できなければ元に戻す
            if (!saveNotices()) {
                notices = previousNotices;
                return;
            }

            // 削除対象を編集中ならフォームを初期化
            if (noticeId.value === notice.id) {
                resetNoticeForm();
            }

            // 画面を更新
            renderNotices();
            renderAdminNotices();
        });

        // カードに追加
        buttons.append(editButton, deleteButton);

        card.append(type, title, buttons);

        adminNoticeList.appendChild(card);
    });
}


/* =========================================================
   ⑫ 初期表示
   保存データを各画面へ反映する
========================================================= */

renderNotices();
renderAdminNotices();