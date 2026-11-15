
/* =========================================================
   ぬまコン JavaScript
   画面切り替え・チャット・回覧板管理
   JSのコードは、HTMLの構造に依存しているため、HTMLを変更した場合は
    JSも修正する必要があります。
    変えたくないです：：
========================================================= */


/* =========================================================
   ① HTML要素の取得
========================================================= */

const homeScreen = document.getElementById('homeScreen');
const voiceChatScreen = document.getElementById('voiceChatScreen');
const textChatScreen = document.getElementById('textChatScreen');
const noticeListScreen = document.getElementById('noticeListScreen');
const noticeDetailScreen = document.getElementById('noticeDetailScreen');

const voiceSearchBtn = document.getElementById('voiceSearchBtn');
const textSearchBtn = document.getElementById('textSearchBtn');
const voiceBackBtn = document.getElementById('voiceBackBtn');
const textBackBtn = document.getElementById('textBackBtn');
const noticeListBtn = document.getElementById('noticeListBtn');
const noticeListBackBtn = document.getElementById('noticeListBackBtn');
const noticeDetailBackBtn = document.getElementById('noticeDetailBackBtn');

const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const textChatArea = document.getElementById('textChatArea');

const detailBadge = document.getElementById('detailBadge');
const detailTitle = document.getElementById('detailTitle');
const detailContent = document.getElementById('detailContent');
const detailPhotoArea = document.getElementById('detailPhotoArea');
const detailPhoto = document.getElementById('detailPhoto');


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
        noticeDetailScreen
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

    // くるくるローディングを表示
    const loadingArea = document.createElement('div');
    loadingArea.className = 'chat-loading';
    loadingArea.innerHTML = '<div class="loading-spinner"></div><p>AIが調べています...</p>';
    textChatArea.appendChild(loadingArea);
    textChatArea.scrollTop = textChatArea.scrollHeight;

    async function sendMessage() {
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

    // くるくるローディング
    const loadingArea = document.createElement('div');
    loadingArea.className = 'chat-loading';
    loadingArea.innerHTML = '<div class="loading-spinner"></div><p>AIが調べています...</p>';
    textChatArea.appendChild(loadingArea);
    textChatArea.scrollTop = textChatArea.scrollHeight;

    try {
        // FlaskのAIチャットAPIに質問を送信して、返事を待つ
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message: text })
        });

        const data = await response.json();

        // AIの回答が届いたらくるくるを消す
        loadingArea.remove();

        // 届いた回答の吹き出しを画面に追加する
        const aiBubble = document.createElement('div');
        aiBubble.className = 'chat-bubble ai';
        aiBubble.textContent = data.reply;
        textChatArea.appendChild(aiBubble);

    } catch (error) {
        // 通信エラーが起きたときも、くるくるが残り続けないように消す
        loadingArea.remove();

        const errorBubble = document.createElement('div');
        errorBubble.className = 'chat-bubble ai';
        errorBubble.textContent = '通信エラーが発生しました。もう一度お試しください。';
        textChatArea.appendChild(errorBubble);
    }

    textChatArea.scrollTop = textChatArea.scrollHeight;
}
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
   ホーム画面には先頭3件、一覧画面には全件表示
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

        notices.slice(0, 3).forEach(notice => {
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
   ⑫ 初期表示
   保存データを各画面へ反映する
========================================================= */

renderNotices();