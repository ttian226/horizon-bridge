// Popup 入口

const checkBtn = document.getElementById('checkBtn');
const syncBtn = document.getElementById('syncBtn');
const indexBtn = document.getElementById('indexBtn');
const chartBtn = document.getElementById('chartBtn');
const debugBtn = document.getElementById('debugBtn');
const statusEl = document.getElementById('status');
const domOutput = document.getElementById('domOutput');
const sessionTitle = document.getElementById('sessionTitle');
const statsEl = document.getElementById('stats');
const totalCount = document.getElementById('totalCount');
const syncedCount = document.getElementById('syncedCount');
const unsyncedCount = document.getElementById('unsyncedCount');

// 存储当前状态
let currentData = null;
let syncStatus = null;

// 页面加载时自动获取会话信息
document.addEventListener('DOMContentLoaded', async () => {
  await loadSessionInfo();
});

/**
 * 加载会话信息
 */
async function loadSessionInfo() {
  const tab = await getCurrentGeminiTab();
  if (!tab) {
    setStatus('请先打开 Gemini 页面', 'error');
    return;
  }

  try {
    const response = await sendToContent(tab.id, { action: 'getConversationData' });
    if (response?.success) {
      currentData = response.data;
      sessionTitle.textContent = currentData.title;
      setStatus(`检测到 ${currentData.totalCount} 轮对话，点击检查同步状态`);
    }
  } catch (e) {
    setStatus('无法获取对话数据，请刷新 Gemini 页面', 'error');
  }
}

/**
 * 检查同步状态
 */
checkBtn.addEventListener('click', async () => {
  if (!currentData) {
    await loadSessionInfo();
    if (!currentData) return;
  }

  setStatus('检查中...', '');
  checkBtn.disabled = true;

  try {
    const response = await sendToBackground({
      action: 'checkSync',
      data: {
        title: currentData.title,
        conversations: currentData.conversations
      }
    });

    if (response?.success) {
      syncStatus = response;

      totalCount.textContent = response.total;
      syncedCount.textContent = response.synced;
      unsyncedCount.textContent = response.unsynced;
      statsEl.style.display = 'flex';

      if (response.unsynced > 0) {
        setStatus(`有 ${response.unsynced} 个对话待同步`, 'warning');
        syncBtn.disabled = false;
        syncBtn.classList.add('highlight');
        syncBtn.textContent = `同步 ${response.unsynced} 个对话`;
      } else {
        setStatus('所有对话已同步', 'success');
        syncBtn.disabled = true;
        syncBtn.classList.remove('highlight');
        syncBtn.textContent = '已全部同步';
      }
    } else {
      setStatus(`检查失败: ${response?.error || '未知错误'}`, 'error');
    }
  } catch (e) {
    setStatus(`检查失败: ${e.message}`, 'error');
  } finally {
    checkBtn.disabled = false;
  }
});

/**
 * 执行同步
 */
syncBtn.addEventListener('click', async () => {
  if (!currentData || !syncStatus) {
    setStatus('请先检查同步状态', 'error');
    return;
  }

  setStatus('同步中...', '');
  syncBtn.disabled = true;
  syncBtn.classList.remove('highlight');

  try {
    const response = await sendToBackground({
      action: 'sync',
      data: {
        title: currentData.title,
        conversations: currentData.conversations,
        syncedIds: syncStatus.syncedIds,
        maxIndex: syncStatus.maxIndex
      }
    });

    if (response?.success) {
      const { summary } = response;
      if (summary.fail === 0) {
        setStatus(`成功同步 ${summary.success} 个对话`, 'success');
      } else {
        setStatus(`同步完成: ${summary.success} 成功, ${summary.fail} 失败`, 'warning');
      }

      unsyncedCount.textContent = '0';
      syncedCount.textContent = parseInt(syncedCount.textContent) + summary.success;
      syncBtn.textContent = '已全部同步';
    } else {
      setStatus(`同步失败: ${response?.error || '未知错误'}`, 'error');
      syncBtn.disabled = false;
    }
  } catch (e) {
    setStatus(`同步失败: ${e.message}`, 'error');
    syncBtn.disabled = false;
  }
});

/**
 * 生成 _INDEX.md
 */
indexBtn.addEventListener('click', async () => {
  if (!currentData) {
    setStatus('请先获取会话数据', 'error');
    return;
  }

  setStatus('生成 _INDEX.md...', '');
  indexBtn.disabled = true;

  try {
    const response = await sendToBackground({
      action: 'generateIndex',
      data: { title: currentData.title }
    });

    if (response?.success) {
      setStatus(`_INDEX.md 已生成 (${response.filesCount} 个文件)`, 'success');
    } else {
      setStatus(`生成失败: ${response?.error || '未知错误'}`, 'error');
    }
  } catch (e) {
    setStatus(`生成失败: ${e.message}`, 'error');
  } finally {
    indexBtn.disabled = false;
  }
});

/**
 * 生成逻辑图谱（Canvas 版本）
 */
chartBtn.addEventListener('click', async () => {
  if (!currentData) {
    setStatus('请先获取会话数据', 'error');
    return;
  }

  const outputLang = document.getElementById('outputLang').value;
  setStatus('AI 正在分析对话生成 Canvas 图谱...', '');
  chartBtn.disabled = true;

  try {
    const response = await sendToBackground({
      action: 'generateChart',
      data: {
        title: currentData.title,
        conversations: currentData.conversations,
        outputLang
      }
    });

    if (response?.success) {
      // 构建详细统计信息
      const stats = [];
      stats.push(`${response.qaCount} 个 QA`);
      stats.push(`→ ${response.signalCount} 个节点`);
      if (response.phaseCount > 0) {
        stats.push(`${response.phaseCount} 个分组`);
      }
      if (response.offTopicCount > 0) {
        stats.push(`过滤 ${response.offTopicCount} 个噪音`);
      }

      setStatus(`Canvas 已生成 (${stats.join(', ')})`, 'success');

      console.log('Chart generated:', {
        mainTopic: response.mainTopic,
        summary: response.summary,
        qaCount: response.qaCount,
        signalCount: response.signalCount,
        offTopicCount: response.offTopicCount,
        phaseCount: response.phaseCount
      });
    } else if (response?.needSync) {
      // 需要先同步
      setStatus(response.error, 'warning');
      syncBtn.disabled = false;
      syncBtn.classList.add('highlight');
    } else {
      setStatus(`生成失败: ${response?.error || '未知错误'}`, 'error');
      console.error('Chart generation failed:', response);
    }
  } catch (e) {
    setStatus(`生成失败: ${e.message}`, 'error');
  } finally {
    chartBtn.disabled = false;
  }
});

/**
 * 调试按钮
 */
debugBtn.addEventListener('click', async () => {
  const tab = await getCurrentGeminiTab();
  if (!tab) {
    domOutput.value = '请先打开 Gemini 页面';
    domOutput.classList.add('show');
    return;
  }

  try {
    const response = await sendToContent(tab.id, { action: 'getDOM' });
    if (response?.success) {
      domOutput.value = response.data;
    } else {
      domOutput.value = '获取失败';
    }
  } catch (e) {
    domOutput.value = `错误: ${e.message}`;
  }

  domOutput.classList.toggle('show');
});

/**
 * 设置状态文本
 */
function setStatus(text, type = '') {
  statusEl.textContent = text;
  statusEl.className = 'status' + (type ? ` ${type}` : '');
}

/**
 * 获取当前 Gemini 标签页
 */
async function getCurrentGeminiTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url?.includes('gemini.google.com')) {
    return tab;
  }
  return null;
}

/**
 * 发送消息到 content script
 */
function sendToContent(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError.message });
      } else {
        resolve(response);
      }
    });
  });
}

/**
 * 发送消息到 background service worker
 */
function sendToBackground(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError.message });
      } else {
        resolve(response);
      }
    });
  });
}
