# chatmark-qq

A local-first annotation tool for QQ chat exports, designed for conversation review and LLM fine-tuning dataset creation.

## Features

- Loads JSON files exported by [`shuakami/qq-chat-exporter`](https://github.com/shuakami/qq-chat-exporter)
- QQ-style chat UI for browsing long conversations
- Virtualized message list for fast loading on large histories
- Message selection, review, reordering, editing, and per-item submission
- Annotation manager for revisiting, editing, locating, and deleting saved annotations
- Per-message annotation counts with progressive highlighting
- Jump back to the farthest annotated position
- Saves annotation data next to the selected chat file

## How It Works

`chatmark-qq` reads a QQ chat export JSON, normalizes sender metadata, and lets you build supervised fine-tuning samples from selected message spans.

Each saved annotation stores:

- The selected raw messages
- A reviewed JSON preview
- Annotation metadata and update timestamps
- Per-message progress data for revisit workflows

## Run Locally

Requirements:

- Windows with Node.js installed

Start with:

```bat
start.bat
```

Or in PowerShell:

```powershell
.\start.ps1
```

Then open:

```text
http://127.0.0.1:41739
```

## Data Output

For a selected chat file like:

```text
your-chat.json
```

the tool writes:

```text
your-chat.annotations.json
your-chat.annotation-progress.json
```

in the same folder as the original chat export.

## Notes

- This project is currently optimized for local Windows use.
- The file picker uses the native Windows dialog.
- The UI is responsive across desktop, tablet, and phone-sized screens.

## License

[MIT](./LICENSE)
