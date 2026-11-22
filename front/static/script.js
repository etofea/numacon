
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
   SSEストリーミング受信・待機中無効化・出典/該当なし/エラー表示
========================================================= */

let isSending = false;

// 送信中フラグに応じて入力欄とボタンの有効・無効を切り替える
function setChatDisabled(disabled) {
    isSending = disabled;
    chatInput.disabled = disabled;
    sendBtn.disabled = disabled;
}

// 吹き出しを作成する共通関数
function createChatBubble(type, text = '') {
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${type}`;

    if (text !== '') {
        const textEl = document.createElement('div');
        textEl.className = 'chat-text';
        textEl.textContent = text;
        bubble.appendChild(textEl);
    }

    return bubble;
}

// 吹き出しの末尾に出典リストを追加する
function appendSources(bubble, sources) {
    if (!Array.isArray(sources) || sources.length === 0) {
        return;
    }

    const sourcesBox = document.createElement('div');
    sourcesBox.className = 'chat-sources';

    const heading = document.createElement('p');
    heading.className = 'chat-sources-title';
    heading.textContent = '参考資料（出典）';
    sourcesBox.appendChild(heading);

    const list = document.createElement('ul');
    list.className = 'chat-sources-list';

    sources.forEach(src => {
        const item = document.createElement('li');
        const label = src.page
            ? `${src.title}（p.${src.page}）`
            : src.title;

        // urlがある場合は元PDFを別タブで開けるリンクにする
        if (src.url) {
            const link = document.createElement('a');
            link.href = src.url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = label;
            item.appendChild(link);
        } else {
            item.textContent = label;
        }

        list.appendChild(item);
    });

    sourcesBox.appendChild(list);
    bubble.appendChild(sourcesBox);
}

// SSEイベント1件を画面に反映する
function handleSseEvent(eventName, payload, state) {
    if (eventName === 'chunk') {
        const chunkText = payload.text || '';
        if (chunkText === '') return;

        // 最初の文字が届いたら待機表示を消して回答吹き出しを作る
        if (!state.aiBubble) {
            state.loadingBubble.remove();
            state.aiBubble = createChatBubble('ai');
            state.textEl = document.createElement('div');
            state.textEl.className = 'chat-text';
            state.aiBubble.appendChild(state.textEl);
            textChatArea.appendChild(state.aiBubble);
        }

        state.textEl.textContent += chunkText;
        textChatArea.scrollTop = textChatArea.scrollHeight;
        return;
    }

    if (eventName === 'sources') {
        if (state.aiBubble) {
            appendSources(state.aiBubble, payload.sources);
            textChatArea.scrollTop = textChatArea.scrollHeight;
        }
        return;
    }

    if (eventName === 'not_found') {
        state.loadingBubble.remove();
        state.handled = true;
        const msg = payload.message
            || '該当する資料が見つかりませんでした。別の言葉で試してみてください。';
        const notFoundBubble = createChatBubble('ai not-found', msg);
        textChatArea.appendChild(notFoundBubble);
        textChatArea.scrollTop = textChatArea.scrollHeight;
        return;
    }

    if (eventName === 'error') {
        state.loadingBubble.remove();
        state.handled = true;
        const msg = payload.message
            || '回答の作成中にエラーが発生しました。時間をおいてもう一度お試しください。';
        const errorBubble = createChatBubble('ai error', msg);
        textChatArea.appendChild(errorBubble);
        textChatArea.scrollTop = textChatArea.scrollHeight;
        return;
    }

    if (eventName === 'done') {
        state.done = true;
    }
}

async function sendMessage() {
    if (isSending) {
        return;
    }

    const text = chatInput.value.trim();
    if (text === '') {
        return;
    }

    // ユーザーのメッセージを表示
    const userBubble = createChatBubble('user', text);
    textChatArea.appendChild(userBubble);
    chatInput.value = '';

    // 送信中は入力欄とボタンを無効化
    setChatDisabled(true);

    // 回答待ち中の表示を出す
    const loadingBubble = createChatBubble('ai loading', '調べています…少々お待ちください');
    textChatArea.appendChild(loadingBubble);
    textChatArea.scrollTop = textChatArea.scrollHeight;

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream, application/json'
            },
            body: JSON.stringify({ message: text })
        });

        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }

        const contentType = response.headers.get('content-type') || '';

        // --- パターンA：SSE（ストリーミング）で返ってきた場合 ---
        if (contentType.includes('text/event-stream') && response.body) {
            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            const state = {
                loadingBubble,
                aiBubble: null,
                textEl: null,
                handled: false,
                done: false
            };

            let buffer = '';

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                // 空行（\n\n または \r\n\r\n）ごとにSSEイベントを分割
                const blocks = buffer.split(/\r?\n\r?\n/);
                buffer = blocks.pop() || '';

                for (const block of blocks) {
                    if (!block.trim()) continue;

                    let eventName = 'message';
                    const dataLines = [];

                    for (const line of block.split(/\r?\n/)) {
                        if (line.startsWith('event:')) {
                            eventName = line.slice(6).trim();
                        } else if (line.startsWith('data:')) {
                            dataLines.push(line.slice(5).trim());
                        }
                    }

                    const rawData = dataLines.join('\n');
                    let payload = {};
                    if (rawData) {
                        try {
                            payload = JSON.parse(rawData);
                        } catch {
                            payload = { text: rawData };
                        }
                    }

                    handleSseEvent(eventName, payload, state);
                }
            }

            // 何も表示されずにストリームが終わった場合の保険
            if (!state.aiBubble && !state.handled) {
                loadingBubble.remove();
                const fallbackBubble = createChatBubble(
                    'ai not-found',
                    '回答を取得できませんでした。もう一度お試しください。'
                );
                textChatArea.appendChild(fallbackBubble);
            }
        } else {
            // --- パターンB：通常のJSON（オウム返し等）で返ってきた場合 ---
            const data = await response.json();
            loadingBubble.remove();

            if (data.not_found) {
                const notFoundBubble = createChatBubble(
                    'ai not-found',
                    data.message || '該当する資料が見つかりませんでした。'
                );
                textChatArea.appendChild(notFoundBubble);
            } else {
                const aiBubble = createChatBubble('ai', data.reply || '回答が空でした。');
                appendSources(aiBubble, data.sources);
                textChatArea.appendChild(aiBubble);
            }
        }

    } catch (error) {
        console.error('チャット通信エラー:', error);
        loadingBubble.remove();

        const errorBubble = createChatBubble(
            'ai error',
            '通信エラーが発生しました。接続を確認してもう一度お試しください。'
        );
        textChatArea.appendChild(errorBubble);
    } finally {
        // 完了・エラーにかかわらず必ずボタンを元に戻す
        setChatDisabled(false);
        textChatArea.scrollTop = textChatArea.scrollHeight;
        chatInput.focus();
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