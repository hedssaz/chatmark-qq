# chatmark-qq

一个本地优先的 QQ 聊天标注工具，适合浏览 `qq-chat-exporter` 导出的聊天 JSON，并整理成适用于 LLM 微调的数据集。

中文 | [English](./README.zh.md)

## 项目简介

`chatmark-qq` 读取 QQ 聊天导出 JSON，保留原始消息顺序和发送者信息，并提供接近聊天软件的界面来进行消息选择、人工核对、标注管理和训练样本导出。

## 功能特性

- 加载 [`shuakami/qq-chat-exporter`](https://github.com/shuakami/qq-chat-exporter) 导出的 JSON 文件
- QQ 风格聊天界面，适合浏览长对话
- 虚拟列表渲染，大聊天记录也能快速加载
- 支持多条消息选择、核对、改顺序、改内容后再提交
- 标注管理界面，可再次定位、编辑或删除历史标注
- 每条消息显示被标注次数，并按次数逐步加深高亮
- 一键回到最远已标注位置
- 标注结果和进度文件保存在原聊天文件同目录
- 支持下载表情包/图片，并将 `[图片: xxx.png]` 导出为 `<stickerX,Ytimes>`

## 工作流程

1. 选择一份 QQ 聊天导出 JSON
2. 在聊天界面中选择你想标注的消息片段
3. 在提交前核对弹窗中调整顺序和内容
4. 保存后生成结构化标注和进度信息

## 本地运行

### 运行要求

- Windows
- Node.js

### 启动方式

使用批处理：

```bat
start.bat
```

或使用 PowerShell：

```powershell
.\start.ps1
```

然后打开：

```text
http://127.0.0.1:41739
```

## 输出文件

假设你选择的聊天文件是：

```text
your-chat.json
```

工具会在同目录生成：

```text
your-chat.annotations.json
your-chat.annotation-progress.json
your-chat.sticker-map.json
your-chat.stickers/
```

## 表情包/图片下载说明

如果你要批量下载表情包/图片，需要先在 QQ 里自己发一个表情包或图片，然后把可正常访问的图片直链复制到设置里的“可用图链”输入框，让工具提取 `rkey` 后再下载。

默认下载策略是：
- 只尝试下载出现至少 `2` 次的图片/表情包
- “最近天数”默认 `0`，表示不限制

这样可以尽量避开 QQ 已经过期的普通用户图片。

这是因为很多 QCE 导出的图片链接本身没有 `rkey`，这类地址通常会直接返回 `HTTP 400`。

## 当前状态

- 当前版本优先针对本地 Windows 使用场景优化
- 文件选择使用 Windows 原生文件选择框
- 前端界面已适配桌面、平板和手机尺寸

## License

[MIT](./LICENSE)
