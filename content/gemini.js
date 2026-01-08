// Gemini 页面 Content Script

console.log('[Horizon Bridge] Content script loaded');

// 初始化 Turndown
const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced'
});

// 自定义代码块处理
turndownService.addRule('codeBlock', {
  filter: function (node) {
    return node.nodeName === 'CODE-BLOCK' ||
           (node.nodeName === 'PRE' && node.querySelector('code'));
  },
  replacement: function (content, node) {
    const code = node.querySelector('code') || node;
    const lang = code.className?.match(/language-(\w+)/)?.[1] || '';
    const text = code.textContent || '';
    return '\n```' + lang + '\n' + text + '\n```\n';
  }
});

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getConversationData') {
    const data = extractAllConversations();
    sendResponse({ success: true, data });
  }

  if (request.action === 'getDOM') {
    const domInfo = extractDOMStructure();
    sendResponse({ success: true, data: domInfo });
  }

  return true;
});

/**
 * 获取会话标题
 */
function getSessionTitle() {
  const titleEl = document.querySelector('.conversation-title');
  return titleEl?.innerText?.trim() || '未命名会话';
}

/**
 * 提取所有对话数据
 */
function extractAllConversations() {
  const title = getSessionTitle();
  const turns = document.querySelectorAll('.conversation-container');

  const conversations = [];

  turns.forEach((turn, index) => {
    const geminiId = turn.id;

    // 用户问题
    const queryEl = turn.querySelector('.query-content');
    const question = queryEl?.innerText?.trim() || '';

    // AI 回复 - 用 Turndown 转换
    const markdownEl = turn.querySelector('.markdown');
    let answer = '';
    if (markdownEl) {
      try {
        answer = turndownService.turndown(markdownEl.innerHTML);
      } catch (e) {
        console.error('[Horizon Bridge] Turndown error:', e);
        answer = markdownEl.innerText || '';
      }
    }

    conversations.push({
      index: index + 1,  // 1-based index
      geminiId,
      question,
      answer
    });
  });

  return {
    title,
    conversations,
    totalCount: conversations.length
  };
}

/**
 * 调试用
 */
function extractDOMStructure() {
  const data = extractAllConversations();
  const results = [];

  results.push(`=== 会话: ${data.title} ===`);
  results.push(`共 ${data.totalCount} 轮对话\n`);

  data.conversations.forEach((conv, i) => {
    results.push(`--- 第 ${conv.index} 轮 (ID: ${conv.geminiId}) ---`);
    results.push(`[Q] ${conv.question.slice(0, 100)}...`);
    results.push(`[A] ${conv.answer.slice(0, 200)}...`);
    results.push('');
  });

  return results.join('\n');
}
