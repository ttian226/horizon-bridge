# Horizon Bridge

一款 Chrome 扩展，将 Gemini 对话同步到 Obsidian，并自动生成 AI 知识图谱。

**[English](./README.md)**

## 功能特性

- **一键同步**：将 Gemini 对话导出为 Obsidian Markdown 文件
- **AI 知识图谱**：自动生成 Canvas 思维导图，按主题聚类
- **智能压缩**：4 级自适应策略，支持大量对话 (15/50/120+ 轮)
- **视觉美化**：语义配色、可变卡片尺寸 (S/M/L)、Hub & Spoke 布局
- **可点击链接**：每张卡片可跳转到原始 Q&A 文件

## 前置要求

- Google Chrome 浏览器
- [Obsidian](https://obsidian.md/) (v1.0+)
- [Obsidian Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api) 插件
- [Gemini API Key](https://aistudio.google.com/app/apikey) (有免费额度)

## 安装步骤

### 第一步：配置 Obsidian Local REST API

1. 打开 Obsidian → 设置 → 第三方插件
2. 浏览并安装 **"Local REST API"**
3. 启用该插件
4. 在插件设置中：
   - 开启 **"Enable Non-encrypted (HTTP) Server"**
   - 记录你的 **API Key**（稍后需要使用）
   - 默认地址：`http://127.0.0.1:27123`

### 第二步：获取 Gemini API Key

1. 访问 [Google AI Studio](https://aistudio.google.com/app/apikey)
2. 点击 "Create API Key"
3. 复制并保存你的 API Key

### 第三步：安装扩展

1. 下载或克隆本仓库：
   ```bash
   git clone https://github.com/YOUR_USERNAME/horizon-bridge.git
   ```

2. 创建配置文件：
   ```bash
   cp config.example.js config.js
   ```

3. 编辑 `config.js`，填入你的 API Keys：
   ```javascript
   export const CONFIG = {
     // Gemini API
     geminiApiKey: 'YOUR_GEMINI_API_KEY',      // 第二步获取的 Key
     geminiModel: 'gemini-2.0-flash-lite',     // 推荐模型

     // Obsidian Local REST API
     obsidianApiKey: 'YOUR_OBSIDIAN_API_KEY',  // 第一步获取的 Key
     obsidianBaseUrl: 'http://127.0.0.1:27123', // 默认端口
     obsidianBasePath: 'Gemini'                 // 在 Vault 中的文件夹名
   };
   ```

4. 在 Chrome 中加载扩展：
   - 打开 `chrome://extensions/`
   - 开启右上角的 **"开发者模式"**
   - 点击 **"加载已解压的扩展程序"**
   - 选择 `horizon-bridge` 文件夹

5. 将扩展固定到工具栏，方便使用

## 使用方法

1. 在 Chrome 中打开任意 [Gemini 对话](https://gemini.google.com/)
2. 点击 **Horizon Bridge** 扩展图标
3. 点击 **"Sync to Obsidian"**
4. 等待同步完成
5. 在 Obsidian 中查看：`Vault/Gemini/[会话名称]/`

## 输出结构

```
Gemini/
└── [会话名称]/
    ├── _INDEX.md           # 概览页，包含摘要和嵌入链接
    ├── Logic_Map.canvas    # AI 生成的知识图谱
    ├── 001-主题A.md         # 单条 Q&A 文件
    ├── 002-主题B.md         # 单条 Q&A 文件
    └── ...
```

### Canvas 知识图谱特性

- **Hub & Spoke 布局**：核心概念作为 Hub，细节作为卫星节点
- **语义配色**：
  - 紫色 (6)：核心架构、主要概念
  - 绿色 (4)：解决方案、最佳实践
  - 红色 (1)：问题、警告
  - 黄色 (3)：工具、资源
  - 青色 (5)：示例、代码
  - 灰色 (0)：背景信息
- **可变尺寸**：Hub 用 L (大)，细节用 M/S (中/小)
- **可点击链接**：从任意卡片跳转到原始 Q&A

## 常见问题

### "无法连接到 Obsidian"
- 确保 Obsidian 正在运行
- 检查 Local REST API 插件是否已启用
- 确认端口号 (默认 27123) 与配置一致

### "Gemini API 错误"
- 检查 Gemini API Key 是否正确
- 在 [Google AI Studio](https://aistudio.google.com/) 查看 API 配额

### Canvas 中的链接无法点击
- 确保使用 v18 或更高版本
- 重新同步对话以重新生成 Canvas

## 版本历史

| 版本 | 功能 |
|------|------|
| v18 | 紧凑页脚，可点击的 Wiki-Links |
| v17 | 可变尺寸 (S/M/L) + 语义配色 |
| v16 | 视觉降噪，灰色连接线 |
| v15 | 彩虹 Hub 主题，Gateway 协议 |

## 开源协议

MIT

## 参与贡献

欢迎提交 Issue 和 Pull Request！
