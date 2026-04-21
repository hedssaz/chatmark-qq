# chatmark-qq

A local-first annotation tool for QQ chat exports, designed for reviewing conversations and building datasets for LLM fine-tuning.

English | [中文](./README.zh.md)

## Overview

`chatmark-qq` reads QQ chat export JSON files, preserves original message order and sender metadata, and provides a chat-like UI for message selection, review, annotation management, and dataset export.

## Features

- Load JSON files exported by [`shuakami/qq-chat-exporter`](https://github.com/shuakami/qq-chat-exporter)
- QQ-style chat interface for browsing long conversations
- Virtualized message list for fast loading on large histories
- Select, review, reorder, and edit message spans before saving
- Annotation manager for locating, editing, and deleting saved annotations
- Per-message annotation counts with progressive highlighting
- Jump back to the farthest annotated position
- Saves annotation output and progress files next to the original chat file
- Supports downloading stickers (requires `rkey` from sticker image URLs)

## Workflow

1. Pick a QQ chat export JSON file
2. Select the message span you want to annotate
3. Review and adjust order/content in the submission dialog
4. Save the annotation and generate structured output plus progress data

## Run Locally

### Requirements

- Windows
- Node.js

### Start

Using batch:

```bat
start.bat
```

Or with PowerShell:

```powershell
.\start.ps1
```

Then open:

```text
http://127.0.0.1:41739
```

## Output Files

If your selected chat file is:

```text
your-chat.json
```

The tool will create the following files in the same folder:

```text
your-chat.annotations.json
your-chat.annotation-progress.json
your-chat.sticker-map.json
your-chat.stickers/
```

## Sticker Download Notes

If you want to batch-download sticker images, first send yourself a sticker in QQ, copy a working direct image URL into the Settings panel, let the tool extract the `rkey`, and then start downloading.

This is necessary because many image URLs exported by QCE do not include an `rkey`, and those URLs usually return `HTTP 400`.

## Current Status

- The current version is primarily optimized for local Windows usage
- The file picker currently uses the native Windows file dialog
- The frontend is responsive across desktop, tablet, and phone-sized screens

## License

[MIT](./LICENSE)
