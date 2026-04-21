# chatmark-qq

一个本地优先的 QQ 聊天标注工具，适合浏览 `qq-chat-exporter` 导出的聊天 JSON，并整理成适用于 LLM 微调的数据集。  
A local-first annotation tool for QQ chat exports, designed for reviewing conversations and building datasets for LLM fine-tuning.

## 项目简介 | Overview

`chatmark-qq` 读取 QQ 聊天导出 JSON，保留原始消息顺序和发送者信息，并提供接近聊天软件的界面来进行消息选择、人工核对、标注管理和训练样本导出。  
`chatmark-qq` reads QQ chat export JSON files, preserves original message order and sender metadata, and provides a chat-like UI for message selection, review, annotation management, and dataset export.

## 功能特性 | Features

- 加载 [`shuakami/qq-chat-exporter`](https://github.com/shuakami/qq-chat-exporter) 导出的 JSON 文件  
  Load JSON files exported by [`shuakami/qq-chat-exporter`](https://github.com/shuakami/qq-chat-exporter)
- QQ 风格聊天界面，适合浏览长对话  
  QQ-style chat interface for browsing long conversations
- 虚拟列表渲染，大聊天记录也能快速加载  
  Virtualized message list for fast loading on large histories
- 支持多条消息选择、核对、改顺序、改内容后再提交  
  Select, review, reorder, and edit message spans before saving
- 标注管理界面，可再次定位、编辑或删除历史标注  
  Annotation manager for locating, editing, and deleting saved annotations
- 每条消息显示被标注次数，并按次数逐步加深高亮  
  Per-message annotation counts with progressive highlighting
- 一键回到最远已标注位置  
  Jump back to the farthest annotated position
- 标注结果和进度文件保存在原聊天文件同目录  
  Saves annotation output and progress files next to the original chat file
- 支持下载表情包（需表情包图链中的rkey）  
  Supports downloading stickers (requires `rkey` from sticker image URLs)

## 工作流程 | Workflow

1. 选择一份 QQ 聊天导出 JSON  
   Pick a QQ chat export JSON file
2. 在聊天界面中选择你想标注的消息片段  
   Select the message span you want to annotate
3. 在提交前核对弹窗中调整顺序和内容  
   Review and adjust order/content in the submission dialog
4. 保存后生成结构化标注和进度信息  
   Save the annotation and generate structured output plus progress data

## 本地运行 | Run Locally

### 运行要求 | Requirements

- Windows
- Node.js

### 启动方式 | Start

使用批处理：  
Using batch:

```bat
start.bat
```

或使用 PowerShell：  
Or with PowerShell:

```powershell
.\start.ps1
```

然后打开：  
Then open:

```text
http://127.0.0.1:41739
```

## 输出文件 | Output Files

假设你选择的聊天文件是：  
If your selected chat file is:

```text
your-chat.json
```

工具会在同目录生成：  
The tool will create the following files in the same folder:

```text
your-chat.annotations.json
your-chat.annotation-progress.json
your-chat.sticker-map.json
your-chat.stickers/
```

## 表情包下载说明 | Sticker Download Notes

如果你要批量下载表情包图片，需要先在 QQ 里自己发一个表情包，然后把可正常访问的图片直链复制到设置里的"可用图链"输入框，让工具提取 `rkey` 后再下载。  
If you want to batch-download sticker images, first send yourself a sticker in QQ, copy a working direct image URL into the Settings panel, let the tool extract the `rkey`, and then start downloading.

这是因为很多 QCE 导出的图片链接本身没有 `rkey`，这类地址通常会直接返回 `HTTP 400`。  
This is necessary because many image URLs exported by QCE do not include an `rkey`, and those URLs usually return `HTTP 400`.

## 当前状态 | Current Status

- 当前版本优先针对本地 Windows 使用场景优化  
  The current version is primarily optimized for local Windows usage
- 文件选择使用 Windows 原生文件选择框  
  The file picker currently uses the native Windows file dialog
- 前端界面已适配桌面、平板和手机尺寸  
  The frontend is responsive across desktop, tablet, and phone-sized screens

## License

[MIT](./LICENSE)
