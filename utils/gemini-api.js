// Gemini API 封装
import { CONFIG } from '../config.js';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export class GeminiAPI {
  /**
   * 调用 Gemini 生成内容
   * @param {string} prompt - 提示词
   * @param {string} systemPrompt - 系统提示词（可选）
   * @param {object} options - 额外配置
   */
  static async generate(prompt, systemPrompt = '', options = {}) {
    const url = `${API_BASE}/${CONFIG.geminiModel}:generateContent?key=${CONFIG.geminiApiKey}`;

    const contents = [];

    if (systemPrompt) {
      contents.push({
        role: 'user',
        parts: [{ text: systemPrompt }]
      });
      contents.push({
        role: 'model',
        parts: [{ text: '好的，我明白了。' }]
      });
    }

    contents.push({
      role: 'user',
      parts: [{ text: prompt }]
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: options.temperature ?? 0.7,
          maxOutputTokens: options.maxOutputTokens ?? 8192
        }
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return { success: true, text };
  }

  /**
   * 智能内容清洗 (Smart Content Trimmer)
   * 核心作用：在喂给 AI 前，去除对生成图谱无用的"噪音细节"
   * @param {string} text - 原始文本
   * @param {number} maxLength - 最大字符长度
   */
  static smartTrim(text, maxLength) {
    if (!text) return '';

    // 1. 代码块折叠 (Code Block Folding)
    // 如果代码块超过 6 行，替换为摘要
    let processed = text.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
      const lines = code.split('\n');
      if (lines.length > 6) {
        return `\`\`\`${lang}\n[Code: ${lines.length} lines hidden]\n\`\`\``;
      }
      return match; // 短代码块保留
    });

    // 2. 移除 Base64 图片 (防止 Token 爆炸)
    processed = processed.replace(/data:image\/[a-zA-Z]+;base64,[^\s"')]+/g, '[Base64 Image]');

    // 3. 字符硬截断 (Hard Truncation)
    if (processed.length > maxLength) {
      return processed.slice(0, maxLength) + '...(truncated)';
    }

    return processed;
  }

  /**
   * 四级自适应策略：根据数据量级动态计算压缩率和展示模式
   * @param {number} rawCount - 原始 QA 数量
   * @returns {object} 配置对象
   */
  static calculateGraphConfig(rawCount) {
    let config = {
      mode: 'simple',        // simple | story | map | architecture
      useGroups: false,      // 是否使用 Group 容器
      targetPhases: 0,       // 目标分组数
      mergeStrength: 'none', // 合并力度: none | medium | high | maximum
      nodesPerGroup: 10,     // 理想的单组节点容量
      estimatedNodes: rawCount, // 预估最终节点数
      cardWidth: 360         // 动态卡片宽度
    };

    if (rawCount <= 15) {
      // --- 🟢 Level 1: 微型模式 (1-15) ---
      // 策略：完全不压缩，展示所有细节，不分组
      config.mode = 'simple';
      config.useGroups = false;
      config.mergeStrength = 'none';
      config.targetPhases = 0;
      config.estimatedNodes = rawCount;
      config.cardWidth = 360;

    } else if (rawCount <= 50) {
      // --- 🔵 Level 2: 故事线模式 (16-50) ---
      // 策略：轻度压缩，分3-4个组，保留大部分流程
      config.mode = 'story';
      config.useGroups = true;
      config.mergeStrength = 'medium';
      config.estimatedNodes = Math.ceil(rawCount * 0.6); // 60% 保留率
      config.nodesPerGroup = 8;
      config.targetPhases = Math.ceil(config.estimatedNodes / config.nodesPerGroup);
      config.targetPhases = Math.max(2, Math.min(config.targetPhases, 5));
      config.cardWidth = 380;

    } else if (rawCount <= 120) {
      // --- 🟠 Level 3: 地图模式 (51-120) ---
      // 策略：强力压缩，分5-8个组，开始合并同类项
      config.mode = 'map';
      config.useGroups = true;
      config.mergeStrength = 'high';
      config.estimatedNodes = Math.ceil(rawCount * 0.3); // 30% 保留率
      config.nodesPerGroup = 10;
      config.targetPhases = Math.ceil(config.estimatedNodes / config.nodesPerGroup);
      config.targetPhases = Math.max(4, Math.min(config.targetPhases, 8));
      config.cardWidth = 400;

    } else {
      // --- 🔴 Level 4: 架构图模式 (120+) ---
      // 策略：极致压缩，使用"超级节点+列表"
      config.mode = 'architecture';
      config.useGroups = true;
      config.mergeStrength = 'maximum';
      // 核心：无论多长，最终只保留 30-40 个超级节点
      config.estimatedNodes = Math.min(40, Math.ceil(rawCount * 0.15)); // 15% 压缩率
      config.nodesPerGroup = 5; // 每个 Phase 只放 4-6 个大节点
      config.targetPhases = Math.ceil(config.estimatedNodes / config.nodesPerGroup);
      config.targetPhases = Math.min(config.targetPhases, 10); // 封顶 10 个组
      config.cardWidth = 480; // 宽卡片，为了放列表
    }

    console.log(`[GeminiAPI] Strategy: ${config.mode.toUpperCase()} (Raw: ${rawCount} -> Target: ~${config.estimatedNodes})`);
    return config;
  }

  /**
   * 分析对话，识别 Signal 和 Noise
   * @param {array} conversations - 对话数组
   */
  static async analyzeConversations(conversations) {
    const systemPrompt = `你是一个高级技术文档编辑。你的任务是分析一系列 QA 对话，识别哪些是有价值的知识（Signal），哪些是过程噪音（Noise）。

规则：
1. Signal（信号）：最终方案、关键结论、成功的代码、重要的概念解释
2. Noise（噪音）：失败的尝试、重复的调试、错误的假设、中间过渡

请返回 JSON 格式，包含每个 QA 的分类和简短摘要。`;

    const conversationText = conversations.map((conv, i) => {
      return `### QA ${i + 1} (ID: ${conv.geminiId})
**Q:** ${conv.question.slice(0, 200)}...
**A:** ${conv.answer.slice(0, 500)}...`;
    }).join('\n\n');

    const prompt = `请分析以下 ${conversations.length} 组 QA 对话：

${conversationText}

请返回 JSON 格式：
{
  "analysis": [
    {
      "index": 1,
      "geminiId": "xxx",
      "type": "signal" | "noise",
      "summary": "简短摘要（10字以内）",
      "reason": "分类理由"
    }
  ],
  "flowchart": "Mermaid 流程图代码，展示对话的逻辑脉络"
}`;

    try {
      const result = await this.generate(prompt, systemPrompt);

      // 尝试解析 JSON
      const jsonMatch = result.text.match(/```json\n?([\s\S]*?)\n?```/) ||
                        result.text.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const jsonStr = jsonMatch[1] || jsonMatch[0];
        const parsed = JSON.parse(jsonStr);
        return { success: true, data: parsed };
      }

      return { success: false, error: 'Failed to parse JSON response', raw: result.text };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * 生成 Mermaid 流程图（保留用于兼容）
   * @param {array} conversations - 对话数组
   * @param {string} sessionTitle - 会话标题
   */
  static async generateMermaidChart(conversations, sessionTitle) {
    const systemPrompt = `你是一个技术文档专家，擅长将复杂的对话整理成清晰的流程图。`;

    const conversationText = conversations.map((conv, i) => {
      return `### QA ${i + 1}
**Q:** ${conv.question.slice(0, 300)}
**A:** ${conv.answer.slice(0, 800)}`;
    }).join('\n\n---\n\n');

    const prompt = `请分析以下关于「${sessionTitle}」的对话，生成一个 Mermaid 流程图。

要求：
1. 识别对话的关键阶段：探索、试错、转折、最终方案
2. 用虚线表示失败的尝试
3. 关键节点需要标注对应的 QA 编号
4. 使用中文标签

对话内容：
${conversationText}

请只返回 Mermaid 代码，格式如下：
\`\`\`mermaid
graph TD
    ...
\`\`\``;

    try {
      const result = await this.generate(prompt, systemPrompt);

      // 提取 Mermaid 代码
      const mermaidMatch = result.text.match(/```mermaid\n?([\s\S]*?)\n?```/);

      if (mermaidMatch) {
        return { success: true, mermaid: mermaidMatch[1].trim() };
      }

      return { success: false, error: 'Failed to extract Mermaid code', raw: result.text };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * 生成 Canvas 数据（智能合并 + 自适应布局）
   * @param {array} conversations - 对话数组
   * @param {string} sessionTitle - 会话标题
   * @param {array} fileMapping - 文件映射 [{index, fileName}]
   * @param {string} outputLang - 输出语言: 'en' | 'zh'，默认 'en'
   */
  static async generateCanvasData(conversations, sessionTitle, fileMapping, outputLang = 'en') {
    const totalItems = conversations.length;

    // --- 使用动态配置计算器 ---
    const config = this.calculateGraphConfig(totalItems);
    console.log(`[GeminiAPI] Output language: ${outputLang === 'zh' ? 'Chinese' : 'English'}`);

    // --- 🔥 语言与风格策略 (Language & Style Protocol) ---
    // 根据 outputLang 参数强制输出指定语言
    const LANGUAGE_RULE = outputLang === 'zh'
      ? `
**LANGUAGE & STYLE PROTOCOL:**
1. **Output Language**: **CHINESE (中文)** - ALL output MUST be in Chinese.
2. **Content Structure (CRITICAL)**:
   - **Format**: **ALWAYS use Bullet Points (•)** for \`canvas_summary\`.
   - **Style**: **Structured & Informative (结构化表达)**.
     - **Requirement**: Use "动作 + 对象 + 上下文" structure.
     - **Avoid**: 4-character idioms (Too short) OR conversational filler (Too long).
     - **Bad**: "• 鉴权实现"
     - **Good**: "• 采用 OAuth2 协议实现用户鉴权，并集成 JWT"
3. **Tech Terms**: Keep specific keywords (OAuth2, Redis, LLM) in English.
4. **Labels & Titles**: Must be in Chinese (e.g. "阶段一: 项目初始化" NOT "Phase 1: Init").`
      : `
**LANGUAGE & STYLE PROTOCOL:**
1. **Output Language**: **ENGLISH** - ALL output MUST be in English.
2. **Content Structure (CRITICAL)**:
   - **Format**: **ALWAYS use Bullet Points (•)** for \`canvas_summary\`.
   - **Style**: Keep it Professional & Direct.
     - **Good**: "• Implemented OAuth2 auth flow"
     - **Good**: "• Configured Redis caching layer"
3. **Tech Terms**: Use standard technical terminology.
4. **Labels & Titles**: Must be in English (e.g. "Phase 1: Project Setup").`;

    // --- 构建合并指令 ---
    let mergeInstruction = '';
    let antiPattern = '';

    if (config.mergeStrength === 'none') {
      mergeInstruction = 'Create one node for each QA item.';
      antiPattern = '';
    } else {
      mergeInstruction = `Synthesize by TOPIC. Create ONE node per "Technical Topic".`;
      antiPattern = `**FORBIDDEN**: Linear 1:1 mapping. Compress ${totalItems} QAs -> ~${config.estimatedNodes} Nodes.`;
    }

    // --- 构建分组指令 ---
    let structureInstruction = config.mode === 'simple'
      ? 'Layout: Simple flowchart. Return empty phases [].'
      : `Grouping: Exactly ${config.targetPhases} logical Phases.`;

    // --- 🔥 统一核心规则 v11 (动态叶子节点版) ---
    const CORE_RULES = `
**CRITICAL RULES:**
1. **Granularity**: Synthesize multiple QAs into Insight Nodes.
2. **Content**: **MANDATORY BULLET POINTS (•)** for \`canvas_summary\`.
   - Each node MUST list 2-4 key technical points derived from the merged QAs.
3. **Linking Strategy (DYNAMIC LEAF-NODE PROTOCOL)**:
   - **The "Leaf Node" Rule (Crucial)**: Link *Sub-concepts*, NOT the *Main Topic*.
     - If the conversation is about "Vue Router":
       - ❌ STOP linking: [[Vue Router]], [[Vue]], [[Routing]]. (Context/Background)
       - ✅ START linking: [[Navigation Guards]], [[History Mode]], [[Lazy Loading]], [[Route Params]]. (Specifics)
     - If the conversation is about "Firebase":
       - ❌ STOP linking: [[Firebase]], [[Google]], [[Backend]]. (Context/Background)
       - ✅ START linking: [[Firestore Rules]], [[Snapshot Listeners]], [[Cloud Functions]]. (Specifics)
   - **The "Novelty" Rule**: Only link concepts that introduce *new structure* or *specificity* to the knowledge graph.
   - **The "Wikipedia Test"**: Ask yourself - "Is this word worthy of its own Wiki page?" If too generic (e.g. [[API]], [[Code]], [[Data]]), don't link.
   - **Format**: Wrap in double brackets.
4. **Emoji**: Mandatory relevant emoji.
5. **Nodes**: Max ${config.estimatedNodes} nodes.`;

    // --- 系统提示词 ---
    let systemPrompt;
    if (config.mode === 'architecture') {
      // 🔴 Level 4: 架构模式
      systemPrompt = `You are a Principal Software Architect building a Second Brain.
Goal: Create a HIGH-LEVEL Architecture Map with KNOWLEDGE LINKS for Obsidian.

${LANGUAGE_RULE}
${CORE_RULES}

**CONFIGURATION:**
- Mode: ARCHITECTURE (Super-Nodes)
- Output: Minified JSON

**MANDATORY:**
1. ${antiPattern}
2. ${mergeInstruction}
3. ${structureInstruction}
4. **Traceability**: qa_indices must capture ALL merged indices.`;
    } else {
      // 🟢 常规模式 (Story/Map)
      systemPrompt = `You are a Senior Technical Editor building a Knowledge Graph.
Goal: Compress conversation into logical structure with WIKI-LINKS for Obsidian.

${LANGUAGE_RULE}
${CORE_RULES}

**CONFIGURATION:**
- Mode: ${config.mode.toUpperCase()}
- Output: Minified JSON

**MANDATORY:**
1. ${antiPattern}
2. ${mergeInstruction}
3. ${structureInstruction}
4. **Traceability**: qa_indices must capture ALL merged indices.`;
    }

    // --- 动态调整输入长度（architecture 模式更激进压缩输入）---
    const maxQ = config.mode === 'architecture' ? 150 : (config.mode === 'map' ? 200 : (config.mode === 'story' ? 400 : 600));
    const maxA = config.mode === 'architecture' ? 300 : (config.mode === 'map' ? 400 : (config.mode === 'story' ? 800 : 1200));

    // 使用智能清洗：折叠代码块、移除 Base64，再截断
    const conversationText = conversations.map((conv, i) => {
      const cleanQ = this.smartTrim(conv.question, maxQ);
      const cleanA = this.smartTrim(conv.answer, maxA);
      return `[Item ${i}]
Q: ${cleanQ}
A: ${cleanA}`;
    }).join('\n\n');

    // --- 根据模式生成不同的 Prompt ---
    let prompt;
    if (config.mode === 'simple') {
      // 简单模式也尽量使用列表
      prompt = `Analyze "${sessionTitle}". Create flowchart.
${LANGUAGE_RULE}
${conversationText}

Output JSON: { "nodes": [{"id":"n1","type":"signal","emoji":"🚀","label":"Label","canvas_summary":"• Implemented [[Feature]] using [[Tool]]","qa_indices":[0]}], "edges":[] }`;
    } else {
      // 🔵/🟠/🔴 通用 User Prompt (强化列表格式示例)
      prompt = `Transform "${sessionTitle}" into Knowledge Map.

Raw Data (${totalItems} items):
${conversationText}

----------------
**YOUR TASK**: Compress into ~${config.estimatedNodes} nodes.
${LANGUAGE_RULE}

Output STRICT JSON:
{
  "main_topic": "Project Name",
  "summary": "Summary",
  "phases": [ {"id": "p1", "title": "Phase 1: Title", "summary": "..."} ],
  "nodes": [
    {
      "id": "n1",
      "phase_id": "p1",
      "type": "signal",
      "emoji": "🏗️",
      "label": "Topic Label",
      "canvas_summary": "• 采用 [[OAuth2]] 协议实现用户鉴权\\n• 集成 [[Redis]] 优化 [[Session]] 存储\\n• 使用 [[Docker]] 进行容器化部署",
      "qa_indices": [0, 1, 2]
    }
  ],
  "edges": [{"from": "n1", "to": "n2"}]
}
**CONSTRAINTS**:
- phases: ${config.targetPhases}
- nodes: ~${config.estimatedNodes}
- canvas_summary: **MUST be Bullet Points (•) with [[Wiki-Links]]**`;
    }

    try {
      // 稍微提高 temperature (0.4)，让 AI 有空间重组结构
      const result = await this.generate(prompt, systemPrompt, {
        temperature: 0.4,
        maxOutputTokens: 8192  // gemini-2.0-flash-lite 最大输出限制
      });
      console.log('[GeminiAPI] Raw response:', result.text.slice(0, 500));

      // 尝试多种方式提取 JSON
      let jsonStr = null;

      // 方式 1: ```json 代码块
      const jsonBlockMatch = result.text.match(/```json\n?([\s\S]*?)\n?```/);
      if (jsonBlockMatch) {
        jsonStr = jsonBlockMatch[1];
      }

      // 方式 2: ``` 代码块（无语言标记）
      if (!jsonStr) {
        const codeBlockMatch = result.text.match(/```\n?([\s\S]*?)\n?```/);
        if (codeBlockMatch && codeBlockMatch[1].trim().startsWith('{')) {
          jsonStr = codeBlockMatch[1];
        }
      }

      // 方式 3: 直接找 JSON 对象
      if (!jsonStr) {
        const jsonObjMatch = result.text.match(/\{[\s\S]*\}/);
        if (jsonObjMatch) {
          jsonStr = jsonObjMatch[0];
        }
      }

      if (jsonStr) {
        // 清理可能的尾随逗号等问题
        jsonStr = jsonStr.trim();
        console.log('[GeminiAPI] Extracted JSON length:', jsonStr.length);

        // 尝试修复截断的 JSON
        const repairJSON = (str) => {
          // 移除尾部不完整的对象/数组元素
          str = str.replace(/,\s*$/, '');  // 移除尾部逗号
          str = str.replace(/,\s*[}\]]$/, (m) => m.slice(-1));  // 修复 ",}" 或 ",]"

          // 计算未闭合的括号
          let braces = 0, brackets = 0;
          for (const c of str) {
            if (c === '{') braces++;
            else if (c === '}') braces--;
            else if (c === '[') brackets++;
            else if (c === ']') brackets--;
          }

          // 补齐缺失的闭合括号
          while (brackets > 0) { str += ']'; brackets--; }
          while (braces > 0) { str += '}'; braces--; }

          return str;
        };

        try {
          let parsed;
          try {
            parsed = JSON.parse(jsonStr);
          } catch (e) {
            // 尝试修复截断的 JSON
            console.log('[GeminiAPI] Attempting to repair truncated JSON...');
            const repairedStr = repairJSON(jsonStr);
            parsed = JSON.parse(repairedStr);
            console.log('[GeminiAPI] JSON repaired successfully');
          }

          // 处理 AI 直接返回数组的情况
          if (Array.isArray(parsed)) {
            console.log('[GeminiAPI] Response is array, wrapping as nodes');
            parsed = {
              main_topic: sessionTitle,
              summary: '',
              nodes: parsed,
              edges: []
            };
          }

          // 验证必要字段
          if (!parsed.nodes || !Array.isArray(parsed.nodes)) {
            console.error('[GeminiAPI] Invalid response: nodes missing or not array', parsed);
            return { success: false, error: 'AI 返回格式错误：缺少 nodes 数组', raw: result.text };
          }

          // 标准化节点字段（classification -> type）
          parsed.nodes = parsed.nodes.map(node => ({
            ...node,
            type: node.type || node.classification || 'signal',
            is_off_topic: node.is_off_topic || node.type === 'noise' || node.classification === 'noise'
          }));

          // 🔥 注入 meta 信息供 convertToCanvasJSON 使用
          parsed.meta = {
            mode: config.mode,
            cardWidth: config.cardWidth
          };

          console.log('[GeminiAPI] Parsed successfully, nodes count:', parsed.nodes.length);
          return { success: true, data: parsed };
        } catch (parseErr) {
          console.error('[GeminiAPI] JSON parse error:', parseErr.message);
          console.error('[GeminiAPI] JSON string:', jsonStr);
          return { success: false, error: `JSON 解析错误: ${parseErr.message}`, raw: result.text };
        }
      }

      return { success: false, error: 'AI 响应中未找到有效 JSON', raw: result.text };
    } catch (e) {
      console.error('[GeminiAPI] generateCanvasData error:', e);
      return { success: false, error: e.message };
    }
  }

  /**
   * 智能自适应布局 v5 (四级自适应 + Super-Node Layout)
   * 改进：动态卡片宽度、支持列表渲染、architecture 模式 2 列布局
   * @param {object} aiData - AI 返回的图谱数据（含 phases、nodes、edges、meta）
   * @param {string} sessionTitle - 会话标题
   * @param {array} fileMapping - 文件映射 [{index, fileName}]
   * @param {string} basePath - Obsidian 基础路径（如 'Gemini'）
   */
  static convertToCanvasJSON(aiData, sessionTitle, fileMapping, basePath = '') {
    const canvas = { nodes: [], edges: [] };

    if (!aiData || !aiData.nodes || !Array.isArray(aiData.nodes)) {
      console.error('[GeminiAPI] convertToCanvasJSON: invalid aiData', aiData);
      return canvas;
    }

    // --- 1. 从 meta 获取动态配置 ---
    const mode = aiData.meta?.mode || 'map';
    const dynamicCardWidth = aiData.meta?.cardWidth || 360;

    // --- 2. 基础配置（根据模式动态调整）---
    const CARD_WIDTH = dynamicCardWidth;
    const CARD_GAP_X = mode === 'architecture' ? 60 : 50;
    const CARD_GAP_Y = 100;

    // 章节(Group)布局参数
    const GROUP_PADDING = mode === 'architecture' ? 50 : 40;
    const GROUP_GAP_X = mode === 'architecture' ? 220 : 180;
    const GROUP_GAP_Y = mode === 'architecture' ? 180 : 150;

    // 网格参数：architecture 模式每行 2 个（宽卡片），其他模式 3 个
    const NODES_PER_ROW = mode === 'architecture' ? 2 : 3;

    // --- 3. 辅助函数 ---
    const fileMap = {};
    (fileMapping || []).forEach(f => fileMap[f.index - 1] = f.fileName);

    const buildFilePath = (fileName) => {
      if (!fileName) return null;
      return [basePath, sessionTitle, fileName].filter(p => p).join('/');
    };

    // 🔥 高度计算 v7：基于视觉权重的精准计算（解决中文遮挡）
    const estimateHeight = (text) => {
      if (!text) return 100;

      // 1. 模拟渲染：去掉链接语法，只保留显示文本 "QA1"
      const renderedText = text.replace(/\[\[.*?\|(.*?)\]\]/g, '$1');
      const lines = renderedText.split('\n');

      // 🔥 核心：计算视觉长度（汉字算 1.8，英文算 1）
      const getVisualLength = (str) => {
        let len = 0;
        for (let i = 0; i < str.length; i++) {
          const code = str.charCodeAt(i);
          if (code > 255) len += 1.8; // 中文/全角符号
          else len += 1;              // 英文/半角符号
        }
        return len;
      };

      // 基础 Padding (Top 25 + Bottom 25)
      let totalHeight = 50;

      // 定义每行的"视觉容量"
      // 宽卡片(480px)约容纳 50 个英文字符单位，窄卡片(360px)约 38
      const visualCapacity = CARD_WIDTH > 400 ? 50 : 38;

      lines.forEach(line => {
        const trimmed = line.trim();

        if (trimmed.length === 0) {
          totalHeight += 5;
        } else if (trimmed.startsWith('###')) {
          totalHeight += 40; // 标题
        } else if (trimmed.startsWith('---')) {
          totalHeight += 15; // 分割线
        } else {
          // 列表项或普通文本：使用视觉长度计算
          const visualLen = getVisualLength(trimmed);
          const rows = Math.ceil(visualLen / visualCapacity) || 1;
          totalHeight += rows * 26; // 行高
        }
      });

      return totalHeight + 15; // 底部缓冲
    };

    // 构建内容：动态 Emoji + 横排链接
    const buildCardContent = (node) => {
      // 优先使用 AI 生成的 emoji，没有则回退到默认
      const defaultIcon = node.type === 'signal' ? '🟢' : '🔸';
      const icon = node.emoji || defaultIcon;

      let cardText = `### ${icon} ${node.label || 'Node'}\n\n`;
      cardText += node.canvas_summary || '暂无摘要';

      if (node.qa_indices && Array.isArray(node.qa_indices) && node.qa_indices.length > 0) {
        cardText += '\n\n---\n';

        // 收集链接，最多显示 6 个
        const links = [];
        const maxLinks = 6;
        const displayIndices = node.qa_indices.slice(0, maxLinks);

        displayIndices.forEach(idx => {
          const fName = fileMap[idx];
          if (fName) {
            links.push(`[[${buildFilePath(fName)}|QA${idx + 1}]]`);
          }
        });

        if (node.qa_indices.length > maxLinks) {
          links.push(`+${node.qa_indices.length - maxLinks}more`);
        }

        // 横排：使用空格连接，节省高度
        cardText += links.join(' ');

      } else if (node.index !== undefined) {
        const fName = fileMap[node.index];
        if (fName) cardText += `\n\n---\n[[${buildFilePath(fName)}|📄 详情]]`;
      }
      return cardText;
    };

    // --- 3. 数据预处理 ---
    const hasPhases = aiData.phases && aiData.phases.length > 0;
    const isSimpleMode = !hasPhases;
    const phases = hasPhases ? aiData.phases : [{ id: 'root', title: '' }];
    const nodesByPhase = {};
    phases.forEach(p => nodesByPhase[p.id] = []);

    aiData.nodes.forEach(node => {
      if (node.type === 'noise' || node.is_off_topic) return;
      const pid = (hasPhases && node.phase_id) ? node.phase_id : 'root';
      if (!nodesByPhase[pid]) nodesByPhase[pid] = [];
      nodesByPhase[pid].push(node);
    });

    const activePhases = phases.filter(p => nodesByPhase[p.id] && nodesByPhase[p.id].length > 0);

    // 大区块排列列数
    const PHASE_COLS = activePhases.length > 4 ? 2 : activePhases.length;

    const nodeIdMap = {};
    const nodePhaseMap = {};

    // --- 4. 核心布局循环 (Grid Matrix System) ---
    let phaseStartX = 0;
    let phaseStartY = 0;
    let maxRowHeight = 0; // 记录当前 Phase 行最高的 Group

    activePhases.forEach((phase, phaseIndex) => {
      // Phase 换行逻辑 (Group 级别的 Grid)
      if (!isSimpleMode && phaseIndex > 0 && phaseIndex % PHASE_COLS === 0) {
        phaseStartX = 0;
        phaseStartY += maxRowHeight + GROUP_GAP_Y;
        maxRowHeight = 0;
      }

      const phaseNodes = nodesByPhase[phase.id];

      // --- Phase 内部网格计算 (Node 级别的 Grid) ---
      let maxInnerWidth = 0;
      let maxInnerHeight = 0;
      const rowHeights = {}; // 记录每一行的最大高度

      // 第一遍遍历：预计算每一行的高度 (解决高度对齐问题)
      phaseNodes.forEach((node, i) => {
        const cardText = buildCardContent(node);
        const h = estimateHeight(cardText);
        node._cardText = cardText;
        node._height = h;

        const row = Math.floor(i / NODES_PER_ROW);
        if (!rowHeights[row]) rowHeights[row] = 0;
        rowHeights[row] = Math.max(rowHeights[row], h);
      });

      // 第二遍遍历：确定坐标
      phaseNodes.forEach((node, i) => {
        const canvasNodeId = node.id || `node-${phaseIndex}-${i}`;

        const col = i % NODES_PER_ROW;
        const row = Math.floor(i / NODES_PER_ROW);

        // 计算 Y 轴偏移：累加前面所有行的高度 + 间距
        let yOffset = 0;
        for (let r = 0; r < row; r++) {
          yOffset += rowHeights[r] + CARD_GAP_Y;
        }

        const absX = phaseStartX + (isSimpleMode ? 0 : GROUP_PADDING) + col * (CARD_WIDTH + CARD_GAP_X);
        const absY = phaseStartY + (isSimpleMode ? 0 : GROUP_PADDING + 40) + yOffset;

        nodeIdMap[node.id] = canvasNodeId;
        nodePhaseMap[canvasNodeId] = phase.id;

        canvas.nodes.push({
          id: canvasNodeId,
          type: 'text',
          text: node._cardText,
          x: absX,
          y: absY,
          width: CARD_WIDTH,
          height: node._height,
          color: node.type === 'signal' ? '4' : '3'
        });

        // 统计 Group 尺寸
        const rightEdge = col * (CARD_WIDTH + CARD_GAP_X) + CARD_WIDTH;
        const bottomEdge = yOffset + node._height;
        maxInnerWidth = Math.max(maxInnerWidth, rightEdge);
        maxInnerHeight = Math.max(maxInnerHeight, bottomEdge);
      });

      // 创建 Group 框 (仅分组模式)
      const groupWidth = maxInnerWidth + GROUP_PADDING * 2;
      const groupHeight = maxInnerHeight + GROUP_PADDING * 2 + 40;

      if (!isSimpleMode && phase.title) {
        canvas.nodes.push({
          id: `group-${phase.id}`,
          type: 'group',
          // 🔥 修复：去掉重复数字前缀，直接使用 AI 返回的 phase.title
          // AI 返回的 title 已包含 "Phase 1: ..." 格式
          label: phase.title,
          x: phaseStartX,
          y: phaseStartY,
          width: groupWidth,
          height: groupHeight,
          color: '6'
        });
      }

      // 更新下一个 Phase 的位置
      if (isSimpleMode) {
        phaseStartY += maxInnerHeight + GROUP_GAP_Y;
      } else {
        phaseStartX += groupWidth + GROUP_GAP_X;
        maxRowHeight = Math.max(maxRowHeight, groupHeight);
      }
    });

    // --- 5. 连线生成 (Grid 适配版) ---

    // 策略 A: 组内连线 (Z-Pattern / Reading Order)
    activePhases.forEach(phase => {
      const nodes = nodesByPhase[phase.id];
      for (let i = 0; i < nodes.length - 1; i++) {
        const curr = nodes[i];
        const next = nodes[i + 1];
        const currId = nodeIdMap[curr.id];
        const nextId = nodeIdMap[next.id];

        // 判断是否换行了
        const currRow = Math.floor(i / NODES_PER_ROW);
        const nextRow = Math.floor((i + 1) / NODES_PER_ROW);

        let fromSide = 'right';
        let toSide = 'left';

        if (currRow !== nextRow) {
          // 换行连接：上一行末尾(Bottom) -> 下一行开头(Top)
          fromSide = 'bottom';
          toSide = 'top';
        }

        canvas.edges.push({
          id: `edge-inner-${currId}-${nextId}`,
          fromNode: currId,
          toNode: nextId,
          fromSide: fromSide,
          toSide: toSide,
          color: '3'
        });
      }
    });

    // 策略 B: 组间连线 (Group -> Group)
    if (!isSimpleMode) {
      activePhases.forEach((phase, i) => {
        if (i < activePhases.length - 1) {
          const nextPhase = activePhases[i + 1];
          canvas.edges.push({
            id: `edge-group-${i}`,
            fromNode: `group-${phase.id}`,
            toNode: `group-${nextPhase.id}`,
            fromSide: 'right',
            toSide: 'left',
            color: '4'
          });
        }
      });
    }

    // 策略 C: AI 额外连线 (同 Phase 内的跳跃连线)
    if (aiData.edges && Array.isArray(aiData.edges)) {
      aiData.edges.forEach((edge, i) => {
        const fromId = nodeIdMap[edge.from] || edge.from;
        const toId = nodeIdMap[edge.to] || edge.to;

        // 过滤跨 Phase 连线 (交给 Group 连线处理)
        const fromPhase = nodePhaseMap[fromId];
        const toPhase = nodePhaseMap[toId];
        if (fromPhase && toPhase && fromPhase !== toPhase) return;

        const fromExists = canvas.nodes.some(n => n.id === fromId);
        const toExists = canvas.nodes.some(n => n.id === toId);

        if (fromExists && toExists) {
          // 检查是否已存在
          const exists = canvas.edges.some(e => e.fromNode === fromId && e.toNode === toId);
          if (!exists) {
            canvas.edges.push({
              id: `edge-ai-${i}`,
              fromNode: fromId,
              toNode: toId,
              fromSide: 'bottom',
              toSide: 'top',
              color: '3'
            });
          }
        }
      });
    }

    return canvas;
  }
}
