// Service Worker

import { ObsidianAPI } from '../utils/obsidian-api.js';
import { GeminiAPI } from '../utils/gemini-api.js';
import { CONFIG } from '../config.js';

console.log('[Horizon Bridge] Service worker started');

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  handleMessage(request)
    .then(result => sendResponse(result))
    .catch(err => sendResponse({ success: false, error: err.message }));
  return true; // 异步响应
});

async function handleMessage(request) {
  switch (request.action) {
    case 'checkConnection':
      return await ObsidianAPI.checkConnection();

    case 'checkSync':
      return await checkSyncStatus(request.data);

    case 'sync':
      return await performSync(request.data);

    case 'generateIndex':
      return await generateIndex(request.data);

    case 'generateChart':
      return await generateChart(request.data);

    default:
      return { success: false, error: 'Unknown action' };
  }
}

/**
 * 检查同步状态
 */
async function checkSyncStatus(data) {
  const { title, conversations } = data;

  const syncedResult = await ObsidianAPI.getSyncedIds(title);

  if (!syncedResult.success) {
    return {
      success: false,
      error: syncedResult.error || 'Failed to get synced IDs'
    };
  }

  const { syncedIds, maxIndex } = syncedResult;

  const unsyncedConversations = conversations.filter(
    conv => !syncedIds.includes(conv.geminiId)
  );

  return {
    success: true,
    total: conversations.length,
    synced: syncedIds.length,
    unsynced: unsyncedConversations.length,
    maxIndex,
    syncedIds,
    unsyncedConversations
  };
}

/**
 * 执行同步
 */
async function performSync(data) {
  const { title, conversations, syncedIds, maxIndex } = data;

  const results = await ObsidianAPI.syncConversations(
    title,
    conversations,
    syncedIds,
    maxIndex
  );

  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;

  return {
    success: true,
    results,
    summary: {
      total: results.length,
      success: successCount,
      fail: failCount
    }
  };
}

/**
 * 生成 _INDEX.md（不含图谱）
 */
async function generateIndex(data) {
  const { title } = data;

  try {
    // 获取文件列表
    const files = await ObsidianAPI.getSessionFiles(title);

    // 生成 _INDEX.md 内容
    const content = ObsidianAPI.generateIndexMarkdown(title, files);

    // 写入文件
    const result = await ObsidianAPI.writeIndex(title, content);

    return {
      success: result.success,
      error: result.error,
      filesCount: files.filter(f => f.endsWith('.md') && !f.startsWith('_')).length
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * 生成带图谱的 _INDEX.md（Canvas 版本）
 * 优先从本地 Obsidian 读取数据，无需重新爬取 DOM
 */
async function generateChart(data) {
  const { title, conversations: domConversations, outputLang = 'en' } = data;

  try {
    // 1. 检查同步状态
    console.log('[Horizon Bridge] Checking sync status...');
    const syncedResult = await ObsidianAPI.getSyncedIds(title);
    const localCount = syncedResult.syncedIds?.length || 0;
    const domCount = domConversations?.length || 0;

    // 检查是否有未同步的对话
    if (domConversations && domCount > 0) {
      const unsyncedCount = domConversations.filter(
        conv => !syncedResult.syncedIds.includes(conv.geminiId)
      ).length;

      if (unsyncedCount > 0) {
        return {
          success: false,
          needSync: true,
          error: `请先同步 ${unsyncedCount} 个对话，再生成图谱`,
          unsyncedCount
        };
      }
    }

    // 2. 从本地 Obsidian 读取对话内容（不依赖 DOM）
    console.log('[Horizon Bridge] Reading conversations from local Obsidian...');
    const conversations = await ObsidianAPI.readConversationsFromLocal(title);

    if (conversations.length === 0) {
      return {
        success: false,
        error: '本地没有已同步的对话，请先同步'
      };
    }

    console.log('[Horizon Bridge] Loaded', conversations.length, 'conversations from local');

    // 3. 获取文件映射
    const fileMapping = await ObsidianAPI.getFileMapping(title);
    console.log('[Horizon Bridge] File mapping:', fileMapping.length, 'files');

    // 4. 调用 Gemini API 生成 Canvas 数据（带噪音过滤）
    console.log('[Horizon Bridge] Calling Gemini API to generate canvas data...');
    const canvasResult = await GeminiAPI.generateCanvasData(conversations, title, fileMapping, outputLang);

    if (!canvasResult.success) {
      return {
        success: false,
        error: `AI 生成图谱失败: ${canvasResult.error}`,
        raw: canvasResult.raw
      };
    }

    const aiData = canvasResult.data;
    console.log('[Horizon Bridge] AI data received:', {
      main_topic: aiData.main_topic,
      nodesCount: aiData.nodes?.length,
      edgesCount: aiData.edges?.length
    });

    // 3. 转换为 Obsidian Canvas JSON（传入 basePath）
    const canvasJSON = GeminiAPI.convertToCanvasJSON(aiData, title, fileMapping, CONFIG.obsidianBasePath);
    console.log('[Horizon Bridge] Canvas JSON generated, nodes:', canvasJSON.nodes.length);

    // 4. 写入 Canvas 文件
    const canvasWriteResult = await ObsidianAPI.writeCanvas(title, canvasJSON);
    if (!canvasWriteResult.success) {
      return {
        success: false,
        error: `写入 Canvas 失败: ${canvasWriteResult.error}`
      };
    }

    // 5. 获取文件列表
    const files = await ObsidianAPI.getSessionFiles(title);

    // 6. 生成带摘要和 Canvas 链接的 _INDEX.md
    const content = ObsidianAPI.generateIndexWithCanvas(title, files, aiData);

    // 7. 写入 _INDEX.md
    const indexWriteResult = await ObsidianAPI.writeIndex(title, content);

    // 统计节点
    const offTopicCount = aiData.nodes?.filter(n => n.is_off_topic || n.type === 'noise').length || 0;
    const signalCount = aiData.nodes?.filter(n => !n.is_off_topic && n.type !== 'noise').length || 0;
    const qaCount = conversations.length;
    const phaseCount = aiData.phases?.length || 0;

    console.log('[Horizon Bridge] Stats:', { qaCount, signalCount, offTopicCount, phaseCount });

    return {
      success: indexWriteResult.success,
      error: indexWriteResult.error,
      summary: aiData.summary,
      mainTopic: aiData.main_topic,
      qaCount,        // 原始 QA 数量
      signalCount,    // 有效节点数量
      offTopicCount,  // 噪音节点数量
      phaseCount,     // 分组数量
      filesCount: files.filter(f => f.endsWith('.md') && !f.startsWith('_')).length
    };
  } catch (e) {
    console.error('[Horizon Bridge] generateChart error:', e);
    return { success: false, error: e.message };
  }
}
