# Horizon Bridge

> **Powered by Vibe Coding** ✨
> *代码由 AI 辅助生成，灵感由人类提供。主打一个"能跑就行，开心就好"。*

一款 Chrome 扩展，将 Gemini 网页端对话同步到 Obsidian，并基于对话内容自动生成结构化的 AI 知识图谱 (Canvas)。

**[English](./README.md)**

---

## ⚠️ 免责声明 (请先阅读)

**这是一个"个人自用"性质的实验性项目，开源仅供学习和参考。**

1. **Vibe Coding 作品**：本项目大部分代码由 LLM (Claude/Gemini) 在我的"意念控制"下生成。代码风格可能不够严谨，逻辑可能比较狂野，但它确实解决了我的问题。
2. **失效风险**：本扩展依赖于解析 Gemini 网页的 DOM 结构。**一旦 Google 更新了 Gemini 界面，扩展将立即失效。** 届时你需要自己 F12 并在 AI 的帮助下修复它。
3. **维护状态**：**不承诺**长期维护。我开源是为了方便有动手能力的开发者参考，而不是提供商业级产品服务。
4. **数据隐私**：本扩展是纯客户端应用。数据仅在 **你的浏览器**、**Google Gemini API** 和 **你的本地 Obsidian** 之间流转，**绝不**上传第三方服务器。

---

## 功能特性

- **对话归档**：将 Gemini 网页对话无损导出为 Obsidian Markdown 文件
- **AI 知识图谱**：**独立功能模块**，按需调用 Gemini API 生成 Canvas 思维导图
- **智能降噪**：过滤闲聊，提取核心知识点
- **可视化增强**：Hub & Spoke 布局、语义配色、双向链接
- **多语言支持**：支持选择生成图谱的语言（English/中文）

## 前置要求

1. **Google Chrome 浏览器**
2. **Obsidian** (v1.0+)
3. **Gemini API Key** ([点击获取](https://aistudio.google.com/app/apikey))
   - *推荐理由*：Gemini 拥有超长上下文窗口 (1M+ tokens)，非常适合分析长对话
   - 如果想用 OpenAI/Claude 等其他模型，需自行修改 `utils/gemini-api.js`

### 必需的 Obsidian 插件

你只需要安装 **一个** 插件：

| 插件 | 状态 | 用途 |
|------|------|------|
| [Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api) | **必需** | 允许扩展向你的 Obsidian Vault 写入文件 |

## 安装与配置

### 第一步：配置 Obsidian Local REST API

1. 在 Obsidian 中安装并启用 **Local REST API** 插件
2. 进入插件设置页面（设置 → 第三方插件 → Local REST API 齿轮图标）
3. 开启 **"Enable Non-encrypted (HTTP) Server"**
4. **记录关键信息**：
   - **API Key**：点击眼睛图标显示，复制这串字符
   - **Port**：默认为 `27123`
   - *验证*：浏览器访问 `http://127.0.0.1:27123`，看到响应说明成功

### 第二步：获取 Gemini API Key

1. 访问 [Google AI Studio](https://aistudio.google.com/app/apikey)
2. 创建并复制你的 API Key

### 第三步：安装 Chrome 扩展

1. **下载代码**：
   ```bash
   git clone https://github.com/ttian226/horizon-bridge.git
   # 或者直接下载 ZIP 包并解压
   ```

2. **配置密钥**：
   - 将 `config.example.js` 复制为 `config.js`
   - 编辑 `config.js`，填入你的 Key：
   ```javascript
   export const CONFIG = {
     // Gemini API (用于生成图谱)
     geminiApiKey: '填入你的_GEMINI_API_KEY',
     geminiModel: 'gemini-2.0-flash', // 推荐 Flash 模型，速度快且免费额度高

     // Obsidian 配置
     obsidianApiKey: '填入你的_OBSIDIAN_PLUGIN_KEY',
     obsidianBaseUrl: 'http://127.0.0.1:27123',
     obsidianBasePath: 'Gemini' // 文件将保存在 Vault/Gemini 目录下
   };
   ```

3. **加载扩展**：
   - Chrome 地址栏输入 `chrome://extensions/`
   - 开启右上角 **"开发者模式"**
   - 点击 **"加载已解压的扩展程序"** → 选择本项目文件夹

## 使用指南

1. 打开任意 [Gemini 网页版](https://gemini.google.com/) 对话

2. **⚠️ 关键步骤：手动加载完整对话**
   - 如果是长对话，Gemini 默认只加载最近的几轮
   - **请务必手动滚动页面至顶部**，直到看到第一条消息，确保所有内容都已加载
   - *如果不做这一步，导出的内容将不完整*

3. 点击浏览器右上角的 **Horizon Bridge** 图标，将弹出操作面板：

   **第一阶段：基础同步**
   - **检查状态**：点击 **"检查同步状态"**，确保能连接到 Obsidian 本地服务
   - **导出文档**：点击 **"同步到 Obsidian"**
     - *这一步会将对话内容保存为 Markdown 文件（`001-xxx.md`, `002-xxx.md`...）*

   **第二阶段：AI 增强 (可选)**
   - **选择语言**：在"图谱生成"区域，选择你希望 AI 生成内容的语言
   - **生成索引**：点击 **"生成 _INDEX.md"**
     - *生成包含导航和摘要的主页文件*
   - **生成图谱**：点击 **"生成逻辑图谱 (AI)"**
     - *此步骤会消耗 Gemini API 额度，长对话可能需要 30-60 秒*

4. 回到 Obsidian，在 `Gemini/` 目录下查看结果

## 输出文件结构

```
Gemini/
└── [会话标题]/
    ├── _INDEX.md           # 索引页（摘要和导航）
    ├── Logic_Map.canvas    # AI 生成的知识图谱
    ├── 001-问题摘要.md      # 分割后的独立文档
    ├── 002-回答摘要.md
    └── ...
```

## 常见问题 (FAQ)

**Q: 为什么导出的对话只有最近几条？**

Gemini 网页采用了"懒加载"机制。请参考"使用指南"第 2 步，同步前必须手动滚动到页面顶部，把历史记录加载出来。

**Q: 为什么要把"同步"和"生成图谱"分成两个按钮？**

为了灵活性和节省 Token。有时候你可能只想备份对话内容（同步），而不需要消耗 AI 额度去生成图谱。分步操作也避免了因 AI 响应超时而导致文件保存失败。

**Q: 点击同步没反应/报错？**

按 F12 打开控制台 (Console) 查看红色报错信息：
- `401/403 Error`：Obsidian API Key 填错了，或 Local REST API 插件没开 HTTP 模式
- `DOM Error`：Google 改版了，需要自行修复 `content.js`

**Q: 我能换成 GPT-4 吗？**

可以，但需要修改代码。请修改 `utils/gemini-api.js`，重写 `generate` 方法适配 OpenAI 格式。注意 GPT-4 的上下文窗口和 token 成本较高。

## 自行修改指南

如果扩展失效或你想定制功能，主要修改这些文件：

| 文件 | 用途 |
|------|------|
| `content.js` | DOM 解析逻辑（Gemini 改版后需修改这里） |
| `utils/gemini-api.js` | AI 提示词和 Canvas 生成逻辑 |
| `config.js` | API Keys 和基础配置 |

## 贡献与修改

本项目是 **Vibe Coding** 的产物。

如果你发现 bug 或者想加新功能：
1. **推荐**：直接问 AI (Claude/Gemini/GPT)，把代码丢给它，说出你的需求，然后自己修好它
2. **Pull Request**：如果你觉得修得不错，欢迎提交 PR

## 开源协议

MIT License
