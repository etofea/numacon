const MAX_DOC_SIZE = 20 * 1024 * 1024;   // 行政資料: 20MB
const MAX_PHOTO_SIZE = 8 * 1024 * 1024;  // 回覧板写真: 8MB

const DOC_STORAGE_KEY = 'numacon_docs';
const NOTICE_STORAGE_KEY = 'numacon_notices';

// ==========================================
// 1. 行政資料の追加・一覧・削除
// ==========================================
const docForm = document.getElementById('docForm');
const adminDocList = document.getElementById('adminDocList');

function loadDocs() {
    try {
        return JSON.parse(localStorage.getItem(DOC_STORAGE_KEY) || '[]');
    } catch (e) {
        return [];
    }
}

let docs = loadDocs();

function saveDocs() {
    localStorage.setItem(DOC_STORAGE_KEY, JSON.stringify(docs));
}

docForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const fileInput = document.getElementById('docFile');
    const file = fileInput.files[0];

    if (file && file.size > MAX_DOC_SIZE) {
        alert('行政資料のファイルサイズは20MB以下にしてください。');
        fileInput.value = '';
        return;
    }

    const newDoc = {
        id: 'doc-' + Date.now(),
        title: document.getElementById('docTitle').value.trim(),
        category: document.getElementById('docCategory').value,
        content: document.getElementById('docContent').value.trim(),
        fileName: file ? file.name : 'なし',
        schedule: document.getElementById('docSchedule').value,
        publish: document.getElementById('docPublish').value
    };

    docs.unshift(newDoc);
    saveDocs();
    docForm.reset();
    renderDocs();
    alert('行政資料を登録しました。');
});

function renderDocs() {
    adminDocList.replaceChildren();
    if (docs.length === 0) {
        adminDocList.innerHTML = '<p class="empty-message">登録済みの行政資料はありません。</p>';
        return;
    }

    docs.forEach(doc => {
        const card = document.createElement('div');
        card.className = 'admin-notice-card';

        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = doc.category;

        const title = document.createElement('h4');
        title.textContent = doc.title;

        const info = document.createElement('p');
        info.className = 'admin-help';
        info.textContent = `ファイル: ${doc.fileName} / 公開日: ${doc.publish || '未設定'}`;

        const buttons = document.createElement('div');
        buttons.className = 'admin-card-buttons';

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'delete-button';
        deleteBtn.textContent = '削除';
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

let currentPhoto = '';

function loadNotices() {
    try {
        return JSON.parse(localStorage.getItem(NOTICE_STORAGE_KEY) || '[]');
    } catch (e) {
        return [];
    }
}

let notices = loadNotices();

function saveNotices() {
    try {
        localStorage.setItem(NOTICE_STORAGE_KEY, JSON.stringify(notices));
        return true;
    } catch (e) {
        alert('保存できませんでした。写真のサイズが大きすぎる可能性があります。');
        return false;
    }
}

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

noticePhotoInput.addEventListener('change', () => {
    const file = noticePhotoInput.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        alert('画像ファイルを選択してください。');
        noticePhotoInput.value = '';
        return;
    }

    if (file.size > MAX_PHOTO_SIZE) {
        alert('写真は8MB以下のファイルを選択してください。');
        noticePhotoInput.value = '';
        return;
    }

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
            currentPhoto = canvas.toDataURL('image/jpeg', 0.75);
            photoPreview.src = currentPhoto;
            photoPreviewArea.style.display = 'flex';
        };
        image.src = reader.result;
    };
    reader.readAsDataURL(file);
});

removePhotoBtn.addEventListener('click', () => {
    currentPhoto = '';
    noticePhotoInput.value = '';
    photoPreview.removeAttribute('src');
    photoPreviewArea.style.display = 'none';
});

cancelEditBtn.addEventListener('click', resetNoticeForm);

noticeForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = noticeTitleInput.value.trim();
    const content = noticeContentInput.value.trim();
    if (!title || !content) return;

    const editingId = noticeId.value;
    const prev = [...notices];

    if (editingId) {
        const idx = notices.findIndex(n => n.id === editingId);
        if (idx !== -1) {
            notices[idx] = { ...notices[idx], type: noticeType.value, title, content, photo: currentPhoto };
        }
    } else {
        notices.unshift({
            id: `notice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type: noticeType.value,
            title,
            content,
            photo: currentPhoto
        });
    }

    if (!saveNotices()) {
        notices = prev;
        return;
    }

    renderAdminNotices();
    resetNoticeForm();
    alert(editingId ? '回覧板を更新しました。' : '回覧板を登録しました。');
});

function renderAdminNotices() {
    adminNoticeList.replaceChildren();
    if (notices.length === 0) {
        adminNoticeList.innerHTML = '<p class="empty-message">登録済みの回覧板はありません。</p>';
        return;
    }

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

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.textContent = '編集';
        editBtn.addEventListener('click', () => {
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
            adminFormHeading.textContent = '📋 回覧板を編集';
            saveNoticeBtn.textContent = '変更を保存';
            cancelEditBtn.style.display = 'inline-block';
            noticeForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'delete-button';
        deleteBtn.textContent = '削除';
        deleteBtn.addEventListener('click', () => {
            if (!confirm(`「${notice.title}」を削除しますか？`)) return;
            notices = notices.filter(n => n.id !== notice.id);
            saveNotices();
            if (noticeId.value === notice.id) resetNoticeForm();
            renderAdminNotices();
        });

        buttons.append(editBtn, deleteBtn);
        card.append(badge, title, buttons);
        adminNoticeList.appendChild(card);
    });
}

renderDocs();
renderAdminNotices();