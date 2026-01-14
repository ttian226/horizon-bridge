// Obsidian Local REST API 封装
import { CONFIG } from '../config.js';

export class ObsidianAPI {
  /**
   * 发送请求到 Obsidian API
   */
  static async request(method, path, body = null) {
    const url = `${CONFIG.obsidianBaseUrl}${path}`;
    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${CONFIG.obsidianApiKey}`,
        'Content-Type': 'text/markdown'
      }
    };

    if (body) {
      options.body = body;
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      throw new Error(`Obsidian API error: ${response.status} ${response.statusText}`);
    }

    // 根据 content-type 决定如何解析响应
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      return response.json();
    }
    return response.text();
  }

  /**
   * 检查 API 连接状态
   */
  static async checkConnection() {
    try {
      await this.request('GET', '/');
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * 获取文件夹下的文件列表
   * @param {string} folderPath - 文件夹路径
   */
  static async listFiles(folderPath) {
    const path = `/vault/${CONFIG.obsidianBasePath}/${folderPath}/`;
    try {
      const result = await this.request('GET', path);
      // 返回的是文件列表
      return { success: true, files: result.files || [] };
    } catch (e) {
      // 文件夹不存在时返回空列表
      if (e.message.includes('404')) {
        return { success: true, files: [] };
      }
      return { success: false, error: e.message, files: [] };
    }
  }

  /**
   * 读取文件内容
   * @param {string} filePath - 文件路径（相对于 basePath）
   */
  static async readFile(filePath) {
    const path = `/vault/${CONFIG.obsidianBasePath}/${filePath}`;
    try {
      const content = await this.request('GET', path);
      return { success: true, content };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * 创建或更新文件
   * @param {string} filePath - 文件路径（相对于 basePath）
   * @param {string} content - Markdown 内容
   */
  static async writeFile(filePath, content) {
    const path = `/vault/${CONFIG.obsidianBasePath}/${filePath}`;
    try {
      await this.request('PUT', path, content);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * 获取已同步的 gemini_id 列表
   * @param {string} sessionTitle - 会话标题（文件夹名）
   */
  static async getSyncedIds(sessionTitle) {
    const result = await this.listFiles(sessionTitle);
    if (!result.success) {
      return { success: false, syncedIds: [], maxIndex: 0 };
    }

    const syncedIds = [];
    let maxIndex = 0;

    // 解析文件名，提取编号和 gemini_id（从 frontmatter）
    for (const file of result.files) {
      if (!file.endsWith('.md')) continue;

      // 从文件名提取编号，如 "001-20260107-1030.md" -> 1
      const match = file.match(/^(\d+)-/);
      if (match) {
        const index = parseInt(match[1], 10);
        if (index > maxIndex) maxIndex = index;
      }

      // 读取文件获取 gemini_id
      const fileResult = await this.readFile(`${sessionTitle}/${file}`);
      if (fileResult.success) {
        const idMatch = fileResult.content.match(/gemini_id:\s*(\w+)/);
        if (idMatch) {
          syncedIds.push(idMatch[1]);
        }
      }
    }

    return { success: true, syncedIds, maxIndex };
  }

  /**
   * 生成 MD 文件内容
   * @param {object} conversation - 对话数据
   * @param {number} index - 编号
   */
  static generateMarkdown(conversation, index) {
    const now = new Date();
    const syncedAt = now.toISOString();

    return `---
index: ${index}
gemini_id: ${conversation.geminiId}
synced_at: ${syncedAt}
---

## Q

${conversation.question}

## A

${conversation.answer}
`;
  }

  /**
   * 🔥 智能文件名生成器 v2 (正则去噪版)
   * 策略：正则去噪 + 首句提取 + 长度控制
   * @param {number} index - 编号
   * @param {string} question - 原始提问
   */
  static generateFileName(index, question) {
    const indexStr = index.toString().padStart(3, '0');

    if (!question) return `${indexStr}-Untitled.md`;

    // 1. 预处理：只取第一行 (通常长描述的第一行是重点)
    let raw = question.split('\n')[0].trim();

    // 2. 正则去噪：移除常见的"废话前缀" (支持中英文)
    const noisePatterns = [
      /^(请问|请|帮忙|帮我|能否|能不能|可不可以|告诉我|解释一下|我想知道|我想问|关于|你好|嗨|哈喽)/i,
      /^(Hi|Hello|Hey|Gemini|Question|Help|Can you|Could you|I want to|I need to|Please|Explain|What is|How to|How do I)/i
    ];

    // 循环去除前缀，直到没有匹配
    let cleaned = raw;
    let hasMatch = true;
    while (hasMatch) {
      hasMatch = false;
      for (const p of noisePatterns) {
        if (p.test(cleaned)) {
          cleaned = cleaned.replace(p, '').trim();
          // 去除前缀后可能留下的逗号、冒号
          cleaned = cleaned.replace(/^[,，:：\s]+/, '');
          hasMatch = true;
        }
      }
    }

    // 3. 标点截断：只要第一句话 (遇到 。？! . ? ! 就停止)
    const sentenceEnd = cleaned.search(/[。？！\.\?\!]/);
    if (sentenceEnd > 0) {
      cleaned = cleaned.substring(0, sentenceEnd);
    }

    // 4. 再次去噪：移除 Markdown 符号和非法字符
    let safeName = cleaned
      .replace(/[\`\*\_\[\]\(\)\#\+\-\!\>\~]/g, '')  // 移除 MD 符号
      .replace(/[\\/:*?"<>|]/g, '')                  // 移除系统文件名非法字符
      .replace(/\s+/g, '_')                          // 空格转下划线
      .replace(/_+/g, '_')                           // 多个下划线合并
      .replace(/^_|_$/g, '');                        // 去除首尾下划线

    // 5. 长度熔断：如果还是很长，强制截取前 40 个字符
    if (safeName.length > 40) {
      safeName = safeName.slice(0, 40);
      // 避免截断在单词中间（对英文友好）
      const lastUnderscore = safeName.lastIndexOf('_');
      if (lastUnderscore > 30) {
        safeName = safeName.slice(0, lastUnderscore);
      }
    }

    // 6. 兜底：如果清洗完没字了
    if (safeName.length < 2) safeName = 'Discussion';

    return `${indexStr}-${safeName}.md`;
  }

  /**
   * 同步对话到 Obsidian
   * @param {string} sessionTitle - 会话标题
   * @param {array} conversations - 对话数组
   * @param {array} syncedIds - 已同步的 ID 列表
   * @param {number} startIndex - 起始编号
   */
  static async syncConversations(sessionTitle, conversations, syncedIds, startIndex) {
    const results = [];
    let currentIndex = startIndex;

    for (const conv of conversations) {
      // 跳过已同步的
      if (syncedIds.includes(conv.geminiId)) {
        continue;
      }

      currentIndex++;
      const fileName = this.generateFileName(currentIndex, conv.question);
      const content = this.generateMarkdown(conv, currentIndex);
      const filePath = `${sessionTitle}/${fileName}`;

      const result = await this.writeFile(filePath, content);
      results.push({
        index: currentIndex,
        geminiId: conv.geminiId,
        fileName,
        success: result.success,
        error: result.error
      });
    }

    return results;
  }

  /**
   * 生成 _INDEX.md 聚合页
   * @param {string} sessionTitle - 会话标题
   * @param {array} files - 文件列表（按编号排序）
   * @param {string} mermaidChart - Mermaid 流程图代码（可选，兼容旧版）
   */
  static generateIndexMarkdown(sessionTitle, files, mermaidChart = '') {
    const now = new Date();
    const updatedAt = now.toISOString();

    let content = `---
title: ${sessionTitle}
type: index
updated_at: ${updatedAt}
---

# ${sessionTitle}

`;

    // 添加 Mermaid 流程图（如果有）
    if (mermaidChart) {
      content += `## 逻辑图谱

\`\`\`mermaid
${mermaidChart}
\`\`\`

`;
    }

    // 添加嵌入链接
    content += `## 对话内容

`;

    // 按编号排序文件
    const sortedFiles = files
      .filter(f => f.endsWith('.md') && !f.startsWith('_'))
      .sort((a, b) => {
        const numA = parseInt(a.match(/^(\d+)/)?.[1] || '0');
        const numB = parseInt(b.match(/^(\d+)/)?.[1] || '0');
        return numA - numB;
      });

    sortedFiles.forEach(file => {
      const fileName = file.replace('.md', '');
      content += `![[${fileName}]]\n\n`;
    });

    return content;
  }

  /**
   * 生成带摘要和 Canvas 链接的 _INDEX.md
   * @param {string} sessionTitle - 会话标题
   * @param {array} files - 文件列表
   * @param {object} aiData - AI 生成的数据（包含 main_topic, summary）
   */
  static generateIndexWithCanvas(sessionTitle, files, aiData) {
    const now = new Date();
    const updatedAt = now.toISOString();

    let content = `---
title: ${sessionTitle}
type: index
topic: ${aiData.main_topic || sessionTitle}
updated_at: ${updatedAt}
---

# ${sessionTitle}

## 会话摘要

> ${aiData.summary || '（暂无摘要）'}

---

## 逻辑导航

[[Logic_Map.canvas|👉 点击查看完整逻辑图谱]]

---

## 对话内容

`;

    // 按编号排序文件
    const sortedFiles = files
      .filter(f => f.endsWith('.md') && !f.startsWith('_'))
      .sort((a, b) => {
        const numA = parseInt(a.match(/^(\d+)/)?.[1] || '0');
        const numB = parseInt(b.match(/^(\d+)/)?.[1] || '0');
        return numA - numB;
      });

    sortedFiles.forEach(file => {
      const fileName = file.replace('.md', '');
      content += `![[${fileName}]]\n\n`;
    });

    return content;
  }

  /**
   * 写入 Canvas 文件
   * @param {string} sessionTitle - 会话标题
   * @param {object} canvasData - Canvas JSON 数据
   */
  static async writeCanvas(sessionTitle, canvasData) {
    const filePath = `${sessionTitle}/Logic_Map.canvas`;
    const content = JSON.stringify(canvasData, null, 2);

    const path = `/vault/${CONFIG.obsidianBasePath}/${filePath}`;
    try {
      const response = await fetch(`${CONFIG.obsidianBaseUrl}${path}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${CONFIG.obsidianApiKey}`,
          'Content-Type': 'application/json'
        },
        body: content
      });

      if (!response.ok) {
        throw new Error(`Obsidian API error: ${response.status} ${response.statusText}`);
      }

      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * 获取文件映射（编号 -> 文件名）
   * @param {string} sessionTitle - 会话标题
   */
  static async getFileMapping(sessionTitle) {
    const result = await this.listFiles(sessionTitle);
    if (!result.success) {
      return [];
    }

    const mapping = [];
    for (const file of result.files) {
      if (!file.endsWith('.md') || file.startsWith('_')) continue;

      const match = file.match(/^(\d+)-/);
      if (match) {
        mapping.push({
          index: parseInt(match[1], 10),
          fileName: file
        });
      }
    }

    return mapping.sort((a, b) => a.index - b.index);
  }

  /**
   * 从本地 Obsidian 读取所有对话内容
   * @param {string} sessionTitle - 会话标题
   * @returns {array} conversations - [{index, geminiId, question, answer}]
   */
  static async readConversationsFromLocal(sessionTitle) {
    const fileMapping = await this.getFileMapping(sessionTitle);
    const conversations = [];

    for (const file of fileMapping) {
      const result = await this.readFile(`${sessionTitle}/${file.fileName}`);
      if (!result.success) continue;

      const content = result.content;

      // 解析 frontmatter
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      let geminiId = '';
      if (frontmatterMatch) {
        const idMatch = frontmatterMatch[1].match(/gemini_id:\s*(\w+)/);
        if (idMatch) geminiId = idMatch[1];
      }

      // 解析 Q 和 A
      const qMatch = content.match(/## Q\n\n([\s\S]*?)(?=\n## A\n|$)/);
      const aMatch = content.match(/## A\n\n([\s\S]*?)$/);

      const question = qMatch ? qMatch[1].trim() : '';
      const answer = aMatch ? aMatch[1].trim() : '';

      conversations.push({
        index: file.index,
        geminiId,
        question,
        answer,
        fileName: file.fileName
      });
    }

    return conversations;
  }

  /**
   * 写入 _INDEX.md
   * @param {string} sessionTitle - 会话标题
   * @param {string} content - 内容
   */
  static async writeIndex(sessionTitle, content) {
    const filePath = `${sessionTitle}/_INDEX.md`;
    return await this.writeFile(filePath, content);
  }

  /**
   * 获取会话文件夹下的所有文件
   * @param {string} sessionTitle - 会话标题
   */
  static async getSessionFiles(sessionTitle) {
    const result = await this.listFiles(sessionTitle);
    if (result.success) {
      return result.files || [];
    }
    return [];
  }
}
