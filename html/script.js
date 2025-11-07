// ====================
// 全局配置和状态管理
// ====================

const STORAGE_KEYS = {
    tasks: 'sora_tasks'
};

let tasks = [];
let pollIntervals = {};
let elements = {};


// ====================
// UUID Management
// ====================

function generateUUID() {
    var d = new Date().getTime();
    var d2 = ((typeof performance !== 'undefined') && performance.now && (performance.now()*1000)) || 0;
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16;
        if(d > 0){
            r = (d + r)%16 | 0;
            d = Math.floor(d/16);
        } else {
            r = (d2 + r)%16 | 0;
            d2 = Math.floor(d2/16);
        }
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

function getOrSetUUID() {
    let uuid = localStorage.getItem('user_uuid');
    if (!uuid) {
        uuid = generateUUID();
        localStorage.setItem('user_uuid', uuid);
    }
    return uuid;
}


function getStatusText(status) {
    const statusMap = {
        'queued': '排队中',
        'processing': '生成中',
        'in_progress': '生成中',
        'completed': '已完成',
        'failed': '失败'
    };
    return statusMap[status] || status;
}

function getSizeText(sizeValue) {
    if (sizeValue === '1280x720') return '横屏';
    if (sizeValue === '720x1280') return '竖屏';
    return sizeValue;
}


// ====================
// API Key 管理
// ====================

function extractErrorMessage(result, fallback = '请求异常，请稍后重试') {
    if (!result) return fallback;
    if (typeof result === 'string') return result;
    const err = result.error || result.err || {};
    if (typeof err === 'string') return err;
    if (err.message) return err.message;
    if (result.message) return result.message;
    if (result.detail) return result.detail;
    return fallback;
}

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

function validateImageFile(file) {
    // 检查文件是否存在
    if (!file) {
        return { valid: false, error: '请选择文件' };
    }

    // 检查文件大小
    if (file.size > MAX_FILE_SIZE) {
        return { valid: false, error: `文件过大，请上传小于 ${MAX_FILE_SIZE / 1024 / 1024}MB 的图片` };
    }

    if (file.size === 0) {
        return { valid: false, error: '文件为空，请选择有效的图片文件' };
    }

    // 检查 MIME 类型
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        return { valid: false, error: '不支持的文件类型，仅支持 JPEG、PNG、WebP、GIF 格式' };
    }

    // 检查文件扩展名
    const fileName = file.name.toLowerCase();
    const validExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    const hasValidExtension = validExtensions.some(ext => fileName.endsWith(ext));

    if (!hasValidExtension) {
        return { valid: false, error: '文件扩展名不正确，仅支持 .jpg/.jpeg/.png/.webp/.gif' };
    }

    return { valid: true };
}

// 添加文件头验证（魔术数字检查）
async function validateImageFileHeader(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const arr = new Uint8Array(e.target.result);
            const header = Array.from(arr.subarray(0, 4))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');

            // 检查常见图片格式的魔术数字
            const validHeaders = {
                'ffd8ffe0': 'JPEG',
                'ffd8ffe1': 'JPEG',
                'ffd8ffe2': 'JPEG',
                'ffd8ffe8': 'JPEG',
                'ffd8ffdb': 'JPEG',
                '89504e47': 'PNG',
                '47494638': 'GIF',
                '52494646': 'WEBP'
            };

            const isValid = Object.keys(validHeaders).some(h => header.startsWith(h));
            resolve(isValid);
        };
        reader.onerror = () => resolve(false);
        reader.readAsArrayBuffer(file.slice(0, 4));
    });
}

// ====================
// UI 交互功能
// ====================


async function previewImage(input, previewId) {
    const preview = document.getElementById(previewId);
    preview.innerHTML = '';

    if (input.files && input.files[0]) {
        const file = input.files[0];

        // 安全验证
        const validation = validateImageFile(file);
        if (!validation.valid) {
            preview.innerHTML = `<div style="color: #e74c3c; padding: 10px; text-align: center;">${validation.error}</div>`;
            preview.classList.add('empty');
            showToast(validation.error, 'error');
            input.value = ''; // 清空文件选择
            return;
        }

        // 验证文件头（魔术数字检查）
        const isValidHeader = await validateImageFileHeader(file);
        if (!isValidHeader) {
            const errorMsg = '文件格式无效或已损坏';
            preview.innerHTML = `<div style="color: #e74c3c; padding: 10px; text-align: center;">${errorMsg}</div>`;
            preview.classList.add('empty');
            showToast(errorMsg, 'error');
            input.value = ''; // 清空文件选择
            return;
        }

        // 验证通过，显示预览
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = document.createElement('img');
            img.src = e.target.result;
            img.onerror = function() {
                preview.innerHTML = '<div style="color: #e74c3c; padding: 10px; text-align: center;">图片加载失败</div>';
                preview.classList.add('empty');
                input.value = '';
            };
            preview.appendChild(img);
            preview.classList.remove('empty');

            // 显示清除按钮
            showClearButton(input.id);
        };
        reader.onerror = function() {
            preview.innerHTML = '<div style="color: #e74c3c; padding: 10px; text-align: center;">文件读取失败</div>';
            preview.classList.add('empty');
            input.value = '';
        };
        reader.readAsDataURL(file);
    } else {
        preview.classList.add('empty');
        hideClearButton(input.id);
    }
}

function clearImagePreview(inputId, previewId) {
    const input = document.getElementById(inputId);
    const preview = document.getElementById(previewId);

    input.value = '';
    preview.innerHTML = '';
    preview.classList.add('empty');

    hideClearButton(inputId);
    showToast('已清除图片', 'info');
}

function showClearButton(inputId) {
    if (inputId === 'videoRefImage') {
        const btn = document.getElementById('clearVideoImageBtn');
        if (btn) {
            btn.classList.remove('hidden');
        }
    }
}

function hideClearButton(inputId) {
    if (inputId === 'videoRefImage') {
        const btn = document.getElementById('clearVideoImageBtn');
        if (btn) {
            btn.classList.add('hidden');
        }
    }
}

// ====================
// Toast 通知
// ====================

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}


// ====================
// 视频生成功能
// ====================

async function generateVideo() {
    const overlay = document.getElementById('loadingOverlay');
    overlay.classList.add('active');
    maxtasks = 2;

    try {
        const activeTasks = tasks.filter(task =>
            ['queued', 'processing', 'in_progress'].includes(task.status)
        ).length;

        if (activeTasks >= maxtasks) {
            showToast(`同时处理的任务不能超过${maxtasks}个，请稍后再试`, 'error');
            overlay.classList.remove('active');
            return;
        }

        const prompt = document.getElementById(`videoPrompt`).value.trim();

        if (!prompt) {
            showToast('请输入提示词', 'error');
            overlay.classList.remove('active');
            return;
        }

        const formData = new FormData();
        const model = 'sora-2';
        const seconds = '15';
        const size = document.getElementById(`videoSize`).value;

        formData.append('prompt', prompt);
        formData.append('model', model);
        formData.append('seconds', seconds);
        formData.append('size', size);

        const imageFile = document.getElementById('videoRefImage').files[0];
        if (imageFile) {
            const validation = validateImageFile(imageFile);
            if (!validation.valid) {
                showToast(validation.error, 'error');
                overlay.classList.remove('active');
                return;
            }
            formData.append('input_reference', imageFile);
        }

        try {
            showToast('正在提交任务...', 'info');
            const headers = {};
            const keyIdx = Math.floor(Math.random() * 6);
            headers['keyidx'] = keyIdx;
            headers['uuid'] = getOrSetUUID();
            const response = await fetch(`./v1/videos`, {
                method: 'POST',
                headers,
                body: formData
            });

            const result = await parseResponse(response);

            if (response.ok && result.id) {
                showToast('任务提交成功', 'success');
                const task = {
                    id: result.id,
                    type: 'video',
                    prompt: prompt,
                    status: result.status || 'queued',
                    progress: 0,
                    model,
                    size,
                    apiKey: keyIdx,
                };
                addTask(task);
                startPolling(task.id);
            } else {
                const errorMsg = extractErrorMessage(result, '任务提交失败');
                showToast(`任务提交失败: ${errorMsg}`, 'error');
            }
        } catch (error) {
            showToast(`请求失败: ${error.message}`, 'error');
        }
    } finally {
        overlay.classList.remove('active');
    }
}

// ====================
// 任务管理
// ====================

function addTask(task) {
    tasks.unshift(task);
    renderTasks();
}

// ====================
// 自定义确认对话框
// ====================

let confirmCallback = null;

function showConfirmModal(message) {
    return new Promise((resolve) => {
        confirmCallback = resolve;
        const modal = document.getElementById('customConfirmModal');
        const messageEl = document.getElementById('confirmModalMessage');

        messageEl.textContent = message;
        modal.classList.add('active');

        // 阻止body滚动
        document.body.style.overflow = 'hidden';
    });
}

function closeConfirmModal(confirmed) {
    const modal = document.getElementById('customConfirmModal');
    modal.classList.remove('active');

    // 恢复body滚动
    document.body.style.overflow = '';

    if (confirmCallback) {
        confirmCallback(confirmed);
        confirmCallback = null;
    }
}

// 点击遮罩层关闭
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('customConfirmModal');
    const overlay = modal?.querySelector('.confirm-modal-overlay');

    if (overlay) {
        overlay.addEventListener('click', () => {
            closeConfirmModal(false);
        });
    }

    // ESC键关闭
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal?.classList.contains('active')) {
            closeConfirmModal(false);
        }
    });
});

async function removeTask(taskId) {
    // 二次确认
    const task = tasks.find(t => t.id === taskId);
    const confirmMessage = `确定要删除这个任务吗？\n\nID: ${taskId}\n`;

    const confirmed = await showConfirmModal(confirmMessage);
    if (!confirmed) {
        return;
    }

    tasks = tasks.filter(t => t.id !== taskId);
    stopPolling(taskId);
    renderTasks();
    showToast('任务已删除', 'info');
}

function updateTask(taskId, updates) {
    const task = tasks.find(t => t.id === taskId);
    if (task) {
        Object.assign(task, updates);
        renderTasks();
    }
}

function renderTasks() {
    const container = document.getElementById('tasksList');

    if (tasks.length === 0) {
        container.innerHTML = '<p class="empty-state">暂无任务</p>';
        localStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify(tasks));
        return;
    }

    container.innerHTML = tasks.map(task => {
        const metaSegments = [];

        if (task.size) {
            metaSegments.push(`方向 ${getSizeText(task.size)}`);
        }

        const promptId = `task-prompt-${task.id}`;
        const isLongPrompt = task.prompt.length > 100;
        const expandButton = isLongPrompt ? `<button onclick="togglePrompt('${promptId}', this)" class="btn-expand-prompt">展开</button>` : '';

        return `
        <div class="task-card" id="task-${task.id}">
            <div class="task-header">
                <span class="task-type">🎬 视频</span>
                <span class="task-status ${task.status}">${getStatusText(task.status)}</span>
            </div>
            <div class="task-id-row">
                <span class="task-id-text">ID: ${task.id}</span>
                <button type="button" class="task-copy-btn" onclick="copyTaskId('${task.id}')">复制 ID</button>
            </div>
            <div class="task-prompt" id="${promptId}">${task.prompt}</div>
            ${expandButton}
            ${metaSegments.length ? `<div class="task-meta">${metaSegments.join(' · ')}</div>` : ''}
            ${task.errorMessage ? `<div class="task-meta" style="color:#c0392b;">${task.errorMessage}</div>` : ''}
            ${(task.status === 'processing' || task.status === 'in_progress') ? `
                <div class="task-progress">
                    <div class="task-progress-bar" style="width: ${task.progress || 0}%"></div>
                </div>
                <div class="task-meta">进度：${task.progress || 0}%</div>
            ` : ''}
            <div class="task-actions">
                ${task.status === 'completed' ? `
                    <button type="button" onclick="scrollToVideoResult('${task.id}')" class="btn-small btn-refresh">查看预览</button>
                    <button type="button" onclick="downloadVideo('${task.id}', event)" class="btn-small btn-download">下载视频</button>
                ` : `
                    <button type="button" onclick="queryTask('${task.id}')" class="btn-small btn-refresh">刷新状态</button>
                `}
                <button type="button" onclick="removeTask('${task.id}')" class="btn-small btn-delete">删除</button>
            </div>
        </div>`;
    }).join('');

    localStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify(tasks));
}

async function copyTaskId(taskId) {
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(taskId);
        } else {
            const tempInput = document.createElement('input');
            tempInput.value = taskId;
            tempInput.style.position = 'fixed';
            tempInput.style.opacity = '0';
            document.body.appendChild(tempInput);
            tempInput.select();
            document.execCommand('copy');
            document.body.removeChild(tempInput);
        }
        showToast(`已复制 ID: ${taskId}`, 'success');
    } catch (error) {
        console.error('Copy ID failed:', error);
        showToast('复制失败，请手动复制', 'error');
    }
}

// ====================
// 任务查询和轮询
// ====================

async function queryTask(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    try {
        const headers = {};
        headers['keyidx'] = task.hasOwnProperty('apiKey') ? task.apiKey : "";
        headers['uuid'] = getOrSetUUID();
        const response = await fetch(`./v1/videos/${taskId}`, {
            method: 'GET',
            headers
        });

        const result = await parseResponse(response);

        if (response.ok) {
            if (result.error) {
                stopPolling(taskId);
                const message = extractErrorMessage(result, `任务 ${taskId} 失败`);
                updateTask(taskId, { status: 'failed', errorMessage: message });
                showToast(message, 'error');
                return;
            }

            const updates = {
                status: result.status,
                progress: result.progress || 0,
            };

            if (result.status === 'completed') {
                stopPolling(taskId);
                if (result.video_url) {
                    updates.videoUrl = result.video_url;
                }
                updateTask(taskId, updates);
                showToast(`任务 ${taskId} 已完成!`, 'success');
                displayVideoResult(taskId, tasks.find(t => t.id === taskId));
            } else if (result.status === 'failed') {
                stopPolling(taskId);
                const message = extractErrorMessage(result, `任务 ${taskId} 失败`);
                updates.errorMessage = message;
                updateTask(taskId, updates);
                showToast(`${message}`, 'error');
            } else {
                updateTask(taskId, updates);
            }
        } else {
            console.error('Query task error:', result);
            stopPolling(taskId);
            const message = extractErrorMessage(result, `任务 ${taskId} 查询失败`);
            updateTask(taskId, { status: 'failed', errorMessage: message });
            showToast(`${message}`, 'error');
        }
    } catch (error) {
        console.error('Query task error:', error);
        stopPolling(taskId);
        updateTask(taskId, { status: 'failed', errorMessage: error.message });
        showToast(`任务 ${taskId} 查询异常: ${error.message}`, 'error');
    }
}

function startPolling(taskId) {
    // 避免重复轮询
    if (pollIntervals[taskId]) return;

    pollIntervals[taskId] = setInterval(() => {
        queryTask(taskId);
    }, 5000); // 每5秒查询一次
}

function stopPolling(taskId) {
    if (pollIntervals[taskId]) {
        clearInterval(pollIntervals[taskId]);
        delete pollIntervals[taskId];
    }
}

function refreshAllTasks() {
    const incompleteTasks = tasks.filter(t => t.status !== 'completed' && t.status !== 'failed');

    if (incompleteTasks.length === 0) {
        showToast('没有需要刷新的任务', 'info');
        return;
    }

    showToast(`正在刷新 ${incompleteTasks.length} 个任务...`, 'info');

    incompleteTasks.forEach(task => {
        queryTask(task.id);
    });
}

// ====================
// 视频下载和显示
// ====================

async function downloadVideo(taskId, event) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    if (task.videoUrl) {
        showToast('正在准备下载...', 'info');
        try {
            const a = document.createElement('a');
            a.href = task.videoUrl;
            a.download = `sora_video_${taskId}.mp4`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            showToast('视频下载成功!', 'success');
        } catch (error) {
            showToast(`下载失败: ${error.message}`, 'error');
            console.error('Download error:', error);
        }
        return;
    }

    // 获取触发下载的按钮
    const downloadBtn = event ? event.target : null;

    // 检查是否正在下载
    if (downloadBtn && downloadBtn.disabled) {
        return; // 正在下载中，防止重复点击
    }

    try {
        // 禁用按钮并显示下载中状态
        if (downloadBtn) {
            downloadBtn.disabled = true;
            downloadBtn.textContent = '下载中...';
            downloadBtn.style.opacity = '0.6';
        }

        showToast('正在准备下载视频...', 'info');

        const headers = {};
        headers['keyidx'] = task.hasOwnProperty('apiKey') ? task.apiKey : "";
        headers['uuid'] = getOrSetUUID();
        const response = await fetch(`./v1/videos/${taskId}/content`, {
            method: 'GET',
            headers
        });

        if (response.ok) {
            showToast('正在下载视频文件...', 'info');

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `sora_video_${taskId}.mp4`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            showToast('视频下载成功!', 'success');
        } else {
            showToast('视频下载失败，请稍后重试', 'error');
        }
    } catch (error) {
        showToast(`下载失败: ${error.message}`, 'error');
        console.error('Download error:', error);
    } finally {
        // 恢复按钮状态
        if (downloadBtn) {
            downloadBtn.disabled = false;
            downloadBtn.textContent = '下载';
            downloadBtn.style.opacity = '1';
        }
    }
}

async function displayVideoResult(taskId, task) {
    const landscapeContainer = document.getElementById('landscape-results');
    const portraitContainer = document.getElementById('portrait-results');

    // 确定目标容器
    const isPortrait = task.size === '720x1280';
    const targetContainer = isPortrait ? portraitContainer : landscapeContainer;

    // 检查是否已存在该结果卡片
    const existingCard = document.getElementById(`result-${taskId}`);
    if (existingCard) {
        return; // 已存在，不重复添加
    }

    let videoUrlToDisplay;

    if (task.videoUrl) {
        videoUrlToDisplay = task.videoUrl;
    } else {
        try {
            const headers = {};
            headers['keyidx'] = task.hasOwnProperty('apiKey') ? task.apiKey : "";
            headers['uuid'] = getOrSetUUID();
            const response = await fetch(`./v1/videos/${taskId}/content`, {
                headers
            });

            if (!response.ok) {
                throw new Error('获取视频失败');
            }
            const blob = await response.blob();
            videoUrlToDisplay = URL.createObjectURL(blob);
        } catch (error) {
            showToast(`加载视频失败: ${error.message}`, 'error');
            console.error('Video display error:', error);
            return;
        }
    }

    if (!videoUrlToDisplay) {
        showToast('无法获取视频URL', 'error');
        return;
    }

    const resultCard = document.createElement('div');
    resultCard.className = 'result-card';
    resultCard.id = `result-${taskId}`; // 添加ID用于查找
    resultCard.setAttribute('data-task-id', taskId);
    const promptId = `result-prompt-${taskId}`;
    const isLongPrompt = task.prompt.length > 100;
    const expandButton = isLongPrompt ? `<button onclick="togglePrompt('${promptId}', this)" class="btn-expand-prompt">展开</button>` : '';

    resultCard.innerHTML = `
        <div class="video-container" onclick="openMediaLightbox('${videoUrlToDisplay}', 'video', '${task.prompt.replace(/'/g, "\\'")}')">
            <video class="result-video" preload="metadata" muted loop playsinline>
                <source src="${videoUrlToDisplay}" type="video/mp4">
                您的浏览器不支持视频标签。
            </video>
            <div class="video-overlay">
                <div class="video-play-icon">▶</div>
            </div>
        </div>
        <div class="result-info">
            <div class="result-type">🎬 视频</div>
            <div class="result-prompt" id="${promptId}">${task.prompt}</div>
            ${expandButton}
            <div class="result-meta">
                ID：${taskId}
                ${task?.size ? ` · 方向 ${getSizeText(task.size)}` : ''}
            </div>
            <div class="result-actions">
                <button type="button" onclick="downloadVideo('${taskId}', event)" class="btn-small btn-download">下载</button>
                <button type="button" onclick="removeResult('result-${taskId}')" class="btn-small btn-delete">删除</button>
            </div>
        </div>
    `;

    // 移除空状态消息
    const emptyState = targetContainer.querySelector('.empty-state');
    if (emptyState) {
        emptyState.remove();
    }

    targetContainer.prepend(resultCard);
}

// 滚动到视频预览
function scrollToVideoResult(taskId) {
    let resultCard = document.getElementById(`result-${taskId}`);

    // 如果结果卡片不存在，尝试创建它
    if (!resultCard) {
        const task = tasks.find(t => t.id === taskId);

        // 确保任务存在且已完成
        if (task && task.status === 'completed') {
            displayVideoResult(taskId, task);
            resultCard = document.getElementById(`result-${taskId}`);
        } else {
            showToast('任务尚未完成，请稍候', 'info');
            return;
        }
    }

    // 滚动到结果卡片并添加高亮效果
    if (resultCard) {
        resultCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // 添加高亮效果
        resultCard.style.animation = 'highlightPulse 1.5s ease-in-out';
        setTimeout(() => {
            resultCard.style.animation = '';
        }, 1500);
    }
}

// 删除生成结果
async function removeResult(resultId) {
    const resultCard = document.getElementById(resultId);
    if (!resultCard) {
        return;
    }

    const parentContainer = resultCard.parentElement;

    // 获取结果信息用于确认提示
    const promptEl = resultCard.querySelector('.result-prompt');
    const prompt = promptEl ? promptEl.textContent : '无';

    const confirmMessage = `确定要删除这个结果吗？\n\n提示词: ${prompt}`;

    const confirmed = await showConfirmModal(confirmMessage);
    if (!confirmed) {
        return;
    }

    // 添加淡出动画
    resultCard.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    resultCard.style.opacity = '0';
    resultCard.style.transform = 'scale(0.95)';

    setTimeout(() => {
        const videoSource = resultCard.querySelector('video > source');
        if (videoSource && videoSource.src.startsWith('blob:')) {
            URL.revokeObjectURL(videoSource.src);
        }
        resultCard.remove();
        showToast('结果已删除', 'info');

        // 如果容器为空，则恢复空状态消息
        if (parentContainer && parentContainer.children.length === 0) {
            const isPortrait = parentContainer.id.includes('portrait');
            const emptyMessage = isPortrait ? '暂无竖屏视频结果' : '暂无横屏视频结果';
            parentContainer.innerHTML = `<p class="empty-state">${emptyMessage}</p>`;
        }
    }, 300);
}

// ====================
// 页面加载初始化
// ====================

window.addEventListener('DOMContentLoaded', () => {
    // Populate global elements cache
    elements = {
        videoRefImage: document.getElementById('videoRefImage'),
        videoRefImageBtn: document.getElementById('videoRefImageBtn'),
        clearVideoImageBtn: document.getElementById('clearVideoImageBtn'),
        generateVideoBtn: document.getElementById('generateVideoBtn'),
        refreshAllTasksBtn: document.getElementById('refreshAllTasksBtn'),
        cancelConfirmBtn: document.getElementById('cancelConfirmBtn'),
        confirmDeleteBtn: document.getElementById('confirmDeleteBtn')
    };

    // 初始化
    const sizeSelect = document.getElementById('videoSize');
    if (!sizeSelect) return;

    const sizes = ['1280x720', '720x1280'];
    sizeSelect.innerHTML = '';
    sizes.forEach(size => {
        const option = document.createElement('option');
        option.value = size;
        option.textContent = getSizeText(size);
        sizeSelect.appendChild(option);
    });

    // 事件监听
    elements.videoRefImage.addEventListener('change', () => previewImage(elements.videoRefImage, 'videoImagePreview'));
    elements.videoRefImageBtn.addEventListener('click', () => elements.videoRefImage.click());
    elements.clearVideoImageBtn.addEventListener('click', () => clearImagePreview('videoRefImage', 'videoImagePreview'));

    elements.generateVideoBtn.addEventListener('click', generateVideo);
    elements.refreshAllTasksBtn.addEventListener('click', refreshAllTasks);

    elements.cancelConfirmBtn.addEventListener('click', () => closeConfirmModal(false));
    elements.confirmDeleteBtn.addEventListener('click', () => closeConfirmModal(true));

    const savedTasks = localStorage.getItem(STORAGE_KEYS.tasks);
    if (savedTasks) {
        try {
            tasks = JSON.parse(savedTasks);
            renderTasks();

            // 为已完成的任务创建结果预览
            tasks.forEach(task => {
                if (task.status === 'completed') {
                    displayVideoResult(task.id, task);
                } else if (task.status !== 'failed') {
                    startPolling(task.id);
                }
            });

        } catch (error) {
            console.error('Failed to load tasks:', error);
        }
    }

});

window.addEventListener('beforeunload', () => {
    localStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify(tasks));
});

async function parseResponse(response) {
    const contentType = response.headers.get('content-type') || '';
    try {
        if (contentType.includes('application/json')) {
            return await response.json();
        }
        const text = await response.text();
        return text ? { error: text } : {};
    } catch (error) {
        console.error('Response parse error:', error);
        return { error: '无法解析服务器响应' };
    }
}

// ====================
// 媒体预览灯箱功能
// ====================

function openMediaLightbox(url, type, prompt) {
    // 创建灯箱元素
    let lightbox = document.getElementById('mediaLightbox');

    if (!lightbox) {
        lightbox = document.createElement('div');
        lightbox.id = 'mediaLightbox';
        lightbox.className = 'media-lightbox';
        document.body.appendChild(lightbox);
    }

    // 创建媒体元素
    let mediaElement;
    if (type === 'image') {
        mediaElement = `<img src="${url}" alt="${prompt}">`;
    } else {
        mediaElement = `<video controls autoplay><source src="${url}" type="video/mp4"></video>`;
    }

    lightbox.innerHTML = `
        <div class="media-lightbox-content">
            <button class="media-lightbox-close" onclick="closeMediaLightbox()">✕</button>
            ${mediaElement}
            <div class="media-lightbox-info">
                <p>${prompt}</p>
            </div>
        </div>
    `;

    // 显示灯箱
    setTimeout(() => {
        lightbox.classList.add('active');
    }, 10);

    // 阻止body滚动
    document.body.style.overflow = 'hidden';

    // 点击背景关闭
    lightbox.onclick = function(e) {
        if (e.target === lightbox) {
            closeMediaLightbox();
        }
    };

    // ESC键关闭
    document.addEventListener('keydown', handleLightboxEscape);
}

function closeMediaLightbox() {
    const lightbox = document.getElementById('mediaLightbox');
    if (lightbox) {
        lightbox.classList.remove('active');

        // 恢复body滚动
        document.body.style.overflow = '';

        // 移除ESC监听
        document.removeEventListener('keydown', handleLightboxEscape);

        // 延迟移除元素，等待动画完成
        setTimeout(() => {
            if (lightbox.parentNode) {
                lightbox.parentNode.removeChild(lightbox);
            }
        }, 300);
    }
}

function handleLightboxEscape(e) {
    if (e.key === 'Escape') {
        closeMediaLightbox();
    }
}

function togglePrompt(elementId, button) {
    const element = document.getElementById(elementId);
    if (element) {
        element.classList.toggle('expanded');
        if (element.classList.contains('expanded')) {
            button.textContent = '收起';
        } else {
            button.textContent = '展开';
        }
    }
}
