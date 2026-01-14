// Gemini API 封装
import { CONFIG } from '../config.js';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export class GeminiAPI {
  /**
   * 调用 Gemini 生成内容
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
   * 智能内容清洗
   */
  static smartTrim(text, maxLength) {
    if (!text) return '';
    let processed = text.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
      const lines = code.split('\n');
      if (lines.length > 6) {
        return `\`\`\`${lang}\n[Code: ${lines.length} lines hidden]\n\`\`\``;
      }
      return match;
    });
    processed = processed.replace(/data:image\/[a-zA-Z]+;base64,[^\s"')]+/g, '[Base64 Image]');
    if (processed.length > maxLength) {
      return processed.slice(0, maxLength) + '...(truncated)';
    }
    return processed;
  }

  /**
   * 四级自适应策略 (v14: 降低密度，优化美观度)
   */
  static calculateGraphConfig(rawCount) {
    let config = {
      mode: 'simple',
      useGroups: false,
      targetPhases: 0,
      mergeStrength: 'none',
      nodesPerGroup: 6,     // 🔥 降低默认容量 (原10)，防止单个区块过大
      estimatedNodes: rawCount,
      cardWidth: 360
    };

    if (rawCount <= 15) {
      // Level 1: Simple
      config.mode = 'simple';
      config.useGroups = false;
      config.mergeStrength = 'none';
      config.targetPhases = 0;
      config.estimatedNodes = rawCount;
      config.cardWidth = 360;

    } else if (rawCount <= 50) {
      // Level 2: Story
      config.mode = 'story';
      config.useGroups = true;
      config.mergeStrength = 'medium';
      config.estimatedNodes = Math.ceil(rawCount * 0.6);
      config.nodesPerGroup = 6; // 🔥 更小的组，更精致
      config.targetPhases = Math.ceil(config.estimatedNodes / config.nodesPerGroup);
      config.targetPhases = Math.max(2, Math.min(config.targetPhases, 6));
      config.cardWidth = 380;

    } else if (rawCount <= 120) {
      // Level 3: Map
      config.mode = 'map';
      config.useGroups = true;
      config.mergeStrength = 'high';
      config.estimatedNodes = Math.ceil(rawCount * 0.3);
      config.nodesPerGroup = 8; // 🔥 适度降低
      config.targetPhases = Math.ceil(config.estimatedNodes / config.nodesPerGroup);
      config.targetPhases = Math.max(5, Math.min(config.targetPhases, 10)); // 允许更多组
      config.cardWidth = 400;

    } else {
      // Level 4: Architecture
      config.mode = 'architecture';
      config.useGroups = true;
      config.mergeStrength = 'maximum';
      config.estimatedNodes = Math.min(40, Math.ceil(rawCount * 0.15));
      config.nodesPerGroup = 5; // 🔥 超级节点模式，每组只放5个
      config.targetPhases = Math.ceil(config.estimatedNodes / config.nodesPerGroup);
      config.targetPhases = Math.min(config.targetPhases, 12);
      config.cardWidth = 480;
    }

    console.log(`[GeminiAPI] Strategy: ${config.mode.toUpperCase()} (Target Nodes: ~${config.estimatedNodes}, Groups: ${config.targetPhases})`);
    return config;
  }

  /**
   * 生成 Canvas 数据
   */
  static async generateCanvasData(conversations, sessionTitle, fileMapping, outputLang = 'en') {
    const totalItems = conversations.length;
    const config = this.calculateGraphConfig(totalItems);

    // --- 语言与风格 ---
    const LANGUAGE_RULE = outputLang === 'zh'
      ? `
**LANGUAGE & STYLE PROTOCOL:**
1. **Output Language**: **CHINESE (中文)** - ALL output MUST be in Chinese.
2. **Content Structure**: **ALWAYS use Bullet Points (•)**.
3. **Labels**: Use Chinese labels (e.g. "阶段一: 初始化").`
      : `
**LANGUAGE & STYLE PROTOCOL:**
1. **Output Language**: **ENGLISH**.
2. **Content Structure**: **ALWAYS use Bullet Points (•)**.`;

    // --- 核心规则 v12 ---
    const CORE_RULES = `
**CRITICAL RULES:**
1. **Granularity**: Synthesize multiple QAs into Insight Nodes.
2. **Content**: **MANDATORY BULLET POINTS (•)** for \`canvas_summary\`.
3. **Linking**: Use [[Wiki-Links]] for specific sub-concepts (Leaf Nodes).

**4. 🕸️ TOPOLOGY STRATEGY (THEMATIC CLUSTERING):**
   - **GOAL**: Re-organize by **TOPIC**, NOT by TIME.
   - **Grouping**: Put related QAs into the SAME Phase/Group.
   - **Strict Hierarchy**: Each Phase MUST have one "Core Concept" (Hub) and several "Detail Nodes" (Spokes).

**5. 🔗 WIRING INSTRUCTIONS:**
   - **Hub-to-Hub**: Connect related Phases via their Main Concepts.
   - **Back-Linking**: Create loops if discussion returns to a previous topic.

6. **Nodes**: Max ${config.estimatedNodes} nodes.`;

    const systemPrompt = `You are a Knowledge Architect.
Goal: Create a Structured Knowledge Graph for Obsidian.
${LANGUAGE_RULE}
${CORE_RULES}
Configuration: Mode=${config.mode.toUpperCase()}, Output=JSON`;

    const maxQ = config.mode === 'architecture' ? 150 : 300;
    const maxA = config.mode === 'architecture' ? 300 : 600;

    const conversationText = conversations.map((conv, i) => {
      const cleanQ = this.smartTrim(conv.question, maxQ);
      const cleanA = this.smartTrim(conv.answer, maxA);
      return `[Item ${i}] Q: ${cleanQ}\nA: ${cleanA}`;
    }).join('\n\n');

    const prompt = `Transform "${sessionTitle}" into Knowledge Map.
Raw Data (${totalItems} items):
${conversationText}

----------------
**YOUR TASK**: Compress into ~${config.estimatedNodes} nodes in ${config.targetPhases} thematic phases.
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
      "emoji": "💡",
      "label": "Concept Label",
      "canvas_summary": "• Point 1 with [[Link]]\\n• Point 2",
      "qa_indices": [0, 1]
    }
  ],
  "edges": [{"from": "n1", "to": "n2", "label": "relates to"}]
}`;

    try {
      const result = await this.generate(prompt, systemPrompt, { temperature: 0.4 });
      let jsonStr = result.text.match(/\{[\s\S]*\}/)?.[0];

      if (!jsonStr) {
          const codeBlock = result.text.match(/```json\n?([\s\S]*?)\n?```/) || result.text.match(/```\n?([\s\S]*?)\n?```/);
          if (codeBlock) jsonStr = codeBlock[1];
      }
      if (!jsonStr) throw new Error("No JSON found");

      // 简单修复 JSON
      jsonStr = jsonStr.trim().replace(/,\s*$/, '').replace(/,\s*[}\]]$/, (m) => m.slice(-1));

      let parsed;
      try { parsed = JSON.parse(jsonStr); } catch(e) {
          // 再次尝试简单的括号补全
          const openBraces = (jsonStr.match(/\{/g)||[]).length;
          const closeBraces = (jsonStr.match(/\}/g)||[]).length;
          if (openBraces > closeBraces) jsonStr += '}'.repeat(openBraces - closeBraces);
          parsed = JSON.parse(jsonStr);
      }

      if (Array.isArray(parsed)) parsed = { nodes: parsed, edges: [] };

      parsed.meta = { mode: config.mode, cardWidth: config.cardWidth };
      return { success: true, data: parsed };

    } catch (e) {
      console.error(e);
      return { success: false, error: e.message };
    }
  }

  /**
   * 智能自适应布局 v15 (Gateway Protocol & Rainbow Hubs)
   * 核心改进：
   * 1. 🛡️ Gateway Protocol (网关协议):
   *    - 跨区块连线被强制"升维"为 Hub-to-Hub
   *    - 即使 AI 连接的是两个小节点，视觉上也只显示它们所属 Hub 之间的连接
   *    - 彻底消灭"穿透线"和"斜切线"
   * 2. 🌈 Rainbow Theme: 保持彩虹配色
   * 3. 🧩 Strict Hierarchy: 严格的 Hub-Spoke 星型拓扑
   */
  static convertToCanvasJSON(aiData, sessionTitle, fileMapping, basePath = '') {
    const canvas = { nodes: [], edges: [] };

    if (!aiData || !aiData.nodes || !Array.isArray(aiData.nodes)) return canvas;

    // --- 1. 配置参数 ---
    const mode = aiData.meta?.mode || 'map';
    const CARD_WIDTH = aiData.meta?.cardWidth || 400;

    const GAP_X = 60;
    const GAP_Y = 120;
    const GROUP_PADDING = 60;
    const GROUP_GAP_X = 250; // 加大组间距，让高速公路更宽敞
    const GROUP_GAP_Y = 250;
    const PHASES_PER_ROW = 2;
    const SATELLITES_PER_ROW = 3;

    // 🎨 Obsidian Canvas 颜色代码
    const PHASE_COLORS = ['1', '2', '3', '4', '5', '6'];

    // --- 2. 辅助函数 ---
    const fileMap = {};
    (fileMapping || []).forEach(f => fileMap[f.index - 1] = f.fileName);

    const buildFilePath = (fileName) => {
      if (!fileName) return null;
      return [basePath, sessionTitle, fileName].filter(p => p).join('/');
    };

    const estimateHeight = (text) => {
      if (!text) return 100;
      const renderedText = text.replace(/\[\[.*?\|(.*?)\]\]/g, '$1');
      const lines = renderedText.split('\n');
      let totalHeight = 50;
      const visualCapacity = CARD_WIDTH > 400 ? 50 : 38;
      lines.forEach(line => {
        const trimmed = line.trim();
        let len = 0;
        for (let i = 0; i < trimmed.length; i++) len += (trimmed.charCodeAt(i) > 255 ? 1.8 : 1);
        if (trimmed.startsWith('###')) totalHeight += 40;
        else if (trimmed.startsWith('---')) totalHeight += 15;
        else totalHeight += (Math.ceil(len / visualCapacity) || 1) * 26;
      });
      return totalHeight + 15;
    };

    const buildCardContent = (node) => {
      const defaultIcon = node.type === 'signal' ? '🟢' : '🔸';
      const icon = node.emoji || defaultIcon;
      let cardText = `### ${icon} ${node.label || 'Node'}\n\n${node.canvas_summary || '暂无摘要'}`;
      if (node.qa_indices && node.qa_indices.length > 0) {
        cardText += '\n\n---\n';
        const links = [];
        node.qa_indices.slice(0, 6).forEach(idx => {
          const fName = fileMap[idx];
          if (fName) links.push(`[[${buildFilePath(fName)}|QA${idx + 1}]]`);
        });
        if (node.qa_indices.length > 6) links.push(`+${node.qa_indices.length - 6}more`);
        cardText += links.join(' ');
      }
      return cardText;
    };

    // --- 3. 数据分组 ---
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
    const nodeIdMap = {};     // originalId -> canvasId
    const nodePhaseMap = {};  // canvasId -> phaseId
    const phaseHubMap = {};   // phaseId -> hubCanvasId (关键：记录每个区块的 Hub ID)

    // --- 4. 布局计算 ---
    let phaseStartX = 0;
    let phaseStartY = 0;
    let currentRowMaxHeight = 0;

    activePhases.forEach((phase, phaseIndex) => {
      // 🎨 分配颜色
      const themeColor = PHASE_COLORS[phaseIndex % PHASE_COLORS.length];

      if (phaseIndex > 0 && phaseIndex % PHASES_PER_ROW === 0) {
        phaseStartX = 0;
        phaseStartY += currentRowMaxHeight + GROUP_GAP_Y;
        currentRowMaxHeight = 0;
      }

      const phaseNodes = nodesByPhase[phase.id];
      if (phaseNodes.length === 0) return;

      const hubNode = phaseNodes[0];
      const satelliteNodes = phaseNodes.slice(1);

      const satelliteRows = Math.ceil(satelliteNodes.length / SATELLITES_PER_ROW);
      const satellitesWidth = Math.min(satelliteNodes.length, SATELLITES_PER_ROW) * (CARD_WIDTH + GAP_X) - GAP_X;
      const innerGroupWidth = Math.max(CARD_WIDTH, satellitesWidth);

      // Hub 位置
      const hubX = phaseStartX + GROUP_PADDING + (innerGroupWidth - CARD_WIDTH) / 2;
      const hubY = phaseStartY + GROUP_PADDING + 40;

      const hubCardText = buildCardContent(hubNode);
      const hubHeight = estimateHeight(hubCardText);
      const hubCanvasId = hubNode.id || `node-${phaseIndex}-hub`;

      nodeIdMap[hubNode.id] = hubCanvasId;
      nodePhaseMap[hubCanvasId] = phase.id;
      phaseHubMap[phase.id] = hubCanvasId; // 🌟 注册 Hub

      canvas.nodes.push({
        id: hubCanvasId,
        type: 'text',
        text: hubCardText,
        x: hubX,
        y: hubY,
        width: CARD_WIDTH,
        height: hubHeight,
        color: themeColor
      });

      // Satellites 位置
      let maxSatY = hubY + hubHeight;
      const satStartY = hubY + hubHeight + GAP_Y;

      // 预计算每行高度
      const rowHeights = {};
      satelliteNodes.forEach((node, i) => {
        const h = estimateHeight(buildCardContent(node));
        const row = Math.floor(i / SATELLITES_PER_ROW);
        rowHeights[row] = Math.max(rowHeights[row] || 0, h);
      });

      satelliteNodes.forEach((node, i) => {
        const col = i % SATELLITES_PER_ROW;
        const row = Math.floor(i / SATELLITES_PER_ROW);
        const cardText = buildCardContent(node);
        const h = estimateHeight(cardText);
        const canvasNodeId = node.id || `node-${phaseIndex}-${i + 1}`;

        const rowItemsCount = (row === satelliteRows - 1 && satelliteNodes.length % SATELLITES_PER_ROW !== 0)
          ? satelliteNodes.length % SATELLITES_PER_ROW
          : SATELLITES_PER_ROW;
        const rowWidth = rowItemsCount * CARD_WIDTH + (rowItemsCount - 1) * GAP_X;
        const rowStartOffset = (innerGroupWidth - rowWidth) / 2;

        const absX = phaseStartX + GROUP_PADDING + rowStartOffset + col * (CARD_WIDTH + GAP_X);

        let yOffset = 0;
        for (let r = 0; r < row; r++) yOffset += (rowHeights[r] || 200) + GAP_Y;
        const absY = satStartY + yOffset;

        nodeIdMap[node.id] = canvasNodeId;
        nodePhaseMap[canvasNodeId] = phase.id;

        canvas.nodes.push({
          id: canvasNodeId,
          type: 'text',
          text: cardText,
          x: absX,
          y: absY,
          width: CARD_WIDTH,
          height: h,
          color: '0'
        });

        maxSatY = Math.max(maxSatY, absY + h);
      });

      // Group 容器
      const groupWidth = innerGroupWidth + GROUP_PADDING * 2;
      const groupHeight = (maxSatY - phaseStartY) + GROUP_PADDING;

      if (!isSimpleMode && phase.title) {
        canvas.nodes.push({
          id: `group-${phase.id}`,
          type: 'group',
          label: phase.title,
          x: phaseStartX,
          y: phaseStartY,
          width: groupWidth,
          height: groupHeight,
          color: themeColor
        });
      }

      currentRowMaxHeight = Math.max(currentRowMaxHeight, groupHeight);
      phaseStartX += groupWidth + GROUP_GAP_X;
    });

    // --- 5. 纯净连线 (The Gateway Protocol) ---

    // 用于去重 (防止多条子节点连线合并成多条重复的 Hub 连线)
    const processedEdges = new Set();

    // 1. Hub -> Satellites (组内连线：保持星型)
    activePhases.forEach(phase => {
      const phaseNodes = nodesByPhase[phase.id];
      if (phaseNodes.length < 2) return;
      const hubId = nodeIdMap[phaseNodes[0].id];

      for (let i = 1; i < phaseNodes.length; i++) {
        const satId = nodeIdMap[phaseNodes[i].id];
        canvas.edges.push({
          id: `edge-inner-${hubId}-${satId}`,
          fromNode: hubId,
          toNode: satId,
          fromSide: 'bottom',
          toSide: 'top',
          color: '0' // 极淡的灰色
        });
      }
    });

    // 2. AI 逻辑连线 (跨组连线：强制升维)
    if (aiData.edges && Array.isArray(aiData.edges)) {
      aiData.edges.forEach((edge, i) => {
        const rawFromId = nodeIdMap[edge.from] || edge.from;
        const rawToId = nodeIdMap[edge.to] || edge.to;

        // 验证节点存在
        if (!canvas.nodes.some(n => n.id === rawFromId) || !canvas.nodes.some(n => n.id === rawToId)) return;

        const fromPhase = nodePhaseMap[rawFromId];
        const toPhase = nodePhaseMap[rawToId];

        // 🌟 核心逻辑：路由判定 🌟
        let finalFromId = rawFromId;
        let finalToId = rawToId;
        let isCrossGroup = false;

        if (fromPhase !== toPhase) {
          isCrossGroup = true;
          // 🚀 升维打击：如果是跨组，强制将起止点重定向为该组的 Hub
          // 无论本来连的是小弟还是大哥，现在统统由大哥出面
          finalFromId = phaseHubMap[fromPhase];
          finalToId = phaseHubMap[toPhase];
        }

        // 去重检查 (因为可能多个小弟连多个小弟，升维后会变成多条 Hub-Hub 重复线)
        const edgeSignature = `${finalFromId}-${finalToId}`;
        if (processedEdges.has(edgeSignature)) return; // 跳过重复
        processedEdges.add(edgeSignature);

        // 获取最终节点的坐标，用于计算连线方向
        const fromNode = canvas.nodes.find(n => n.id === finalFromId);
        const toNode = canvas.nodes.find(n => n.id === finalToId);

        // 连线样式策略
        let edgeColor = '1'; // 逻辑红线
        let fromSide = 'bottom';
        let toSide = 'top';

        if (isCrossGroup) {
          // 跨组连线：使用更粗的、显眼的连接方式
          // 如果是回溯 (To 在 From 上方)，从右边绕
          if (toNode.y < fromNode.y) {
            fromSide = 'right';
            toSide = 'right';
          } else if (Math.abs(toNode.y - fromNode.y) < 50) { // 同行
            fromSide = 'right';
            toSide = 'left';
          } else {
            // 正常上下级
            fromSide = 'bottom';
            toSide = 'top';
          }
        } else {
          // 组内连线 (AI 认为有直接联系的两个小弟)
          // 这种可以保留，增加组内丰富度，但不宜太抢眼
          edgeColor = '4'; // 绿色表示同组关联
          if (toNode.y === fromNode.y) {
            fromSide = 'right';
            toSide = 'left';
          }
        }

        canvas.edges.push({
          id: `edge-ai-${i}`,
          fromNode: finalFromId,
          toNode: finalToId,
          label: edge.label || '', // 保留 AI 的连线意图文字
          fromSide: fromSide,
          toSide: toSide,
          color: edgeColor
        });
      });
    }

    // 3. Group 间连线 (仅当 AI 完全没生成连线时的保底)
    // 如果 AI 已经很智能了，这个其实可以去掉，为了保险先留着，但颜色设为最淡
    if (!isSimpleMode && aiData.edges && aiData.edges.length === 0) {
      activePhases.forEach((phase, i) => {
        if (i < activePhases.length - 1) {
          const nextPhase = activePhases[i + 1];
          // 也是 Hub 连 Hub
          const fromHub = phaseHubMap[phase.id];
          const toHub = phaseHubMap[nextPhase.id];

          canvas.edges.push({
            id: `edge-group-flow-${i}`,
            fromNode: fromHub,
            toNode: toHub,
            fromSide: 'right',
            toSide: 'left',
            color: '0'
          });
        }
      });
    }

    return canvas;
  }
}
