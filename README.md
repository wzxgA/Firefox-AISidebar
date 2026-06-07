# LLM Sidebar — 使用指南

一个可在 Firefox 浏览器侧边栏中与大语言模型对话的扩展插件，支持自定义 API 地址和密钥。

## 安装

1. 打开 Firefox 浏览器，地址栏输入 `about:debugging`
2. 点击左侧 **"此 Firefox"（This Firefox）**
3. 点击 **"临时载入附加组件"（Load Temporary Add-on）**
4. 选择项目根目录下的 `manifest.json` 文件
5. 侧边栏会自动打开，工具栏也会出现扩展图标

## 配置

### 方式一：侧边栏内配置（推荐）

1. 点击侧边栏右上角的 **齿轮图标（⚙）**
2. 填写三个配置项：
   - **API Endpoint URL**：API 基础地址，例如 `https://api.openai.com`
   - **API Key**：你的 API 密钥（点击眼睛图标可切换显示/隐藏）
   - **Model Name**：模型名称，例如 `gpt-4o`、`deepseek-chat`
3. 点击 **Save** 保存

### 方式二：选项页面

1. 在 Firefox 地址栏输入 `about:addons`
2. 找到 "LLM Sidebar"，点击 **"选项"（Options）**
3. 填写配置并保存

### 支持的 API 服务商

任何兼容 OpenAI 接口格式的服务均可使用：

| 服务商 | API URL | 示例模型名 |
|--------|---------|-----------|
| OpenAI 官方 | `https://api.openai.com` | `gpt-4o` |
| DeepSeek | `https://api.deepseek.com` | `deepseek-chat` |
| Groq | `https://api.groq.com/openai` | `llama-3.3-70b` |
| Ollama（本地） | `http://localhost:11434` | `llama3` |
| 其他兼容服务 | 填写对应地址 | 填写对应模型名 |

> **注意**：Ollama 等本地服务不需要 API Key，但扩展要求非空，可以随意填一个占位值。

## 使用

### 1. 框选网页文字提问

在任意网页上选中一段文字，选中区域旁边会出现 **"Ask LLM"** 紫色按钮，点击它：

- 选中的文字会自动填入侧边栏的输入框
- 你可以在输入框里继续编辑文字，或者追加提问（例如："翻译成英文"、"总结这段内容"）
- 按 **Enter** 发送
- 在输入框输入你的问题（例如："翻译成英文"、"总结这段内容"、"这段代码是什么意思"）
- 按 **Enter** 发送

### 2. 右键菜单提问

选中文字后右键，点击 **"Ask Sidebar LLM about selection"**，选中文字同样会发送到侧边栏。

### 3. 直接对话

不选中文字也可以直接在侧边栏输入框中提问，当作普通聊天窗口使用。

### 4. 多轮对话

扩展保留当前会话的对话历史，LLM 可以记住上下文进行连续对话。

### 快捷键

| 操作 | 快捷键 |
|------|--------|
| 发送消息 | `Enter` |
| 换行 | `Shift + Enter` |
| 中断回答 | `Esc` |

## 按钮说明

| 按钮 | 功能 |
|------|------|
| ⚙ 齿轮 | 打开设置面板 |
| 🗑 垃圾桶 | 清空对话历史 |
| 👁 眼睛 | 显示/隐藏 API Key |

## 常见问题

**Q: 发送后没有反应？**
检查 API URL 是否正确，以及 API Key 是否有效。

**Q: 报错 "401 Unauthorized"？**
API Key 填写错误或已过期。

**Q: 报错 "Network error"？**
API URL 地址无法访问，检查网络或 URL 是否正确。

**Q: 支持哪些模型？**
任何兼容 OpenAI Chat Completions API 并支持 streaming 的模型均可。

**Q: API Key 安全吗？**
API Key 存储在你的浏览器本地（`browser.storage.local`），不会上传到任何第三方服务器，只在你配置的 API 端点使用。

## 项目结构

```
llq/
├── manifest.json          # 扩展清单
├── background.js           # 后台脚本（右键菜单）
├── sidebar/
│   ├── sidebar.html        # 侧边栏界面
│   ├── sidebar.css         # 样式
│   └── sidebar.js          # 核心逻辑（聊天、API调用、流式响应）
├── content/
│   └── content.js          # 网页文字选中检测
├── options/
│   ├── options.html        # 独立设置页面
│   ├── options.css
│   └── options.js
└── icons/                  # 扩展图标
```
