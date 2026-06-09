<div align="center">

# LocalStorage Inspector

**A Chrome DevTools extension for visualizing and editing `localStorage` data**

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.0-cyan.svg)](https://github.com/DullSword/localstorage-inspector/releases)
[![Chrome](https://img.shields.io/badge/Chrome-≥105-4285F4?logo=google-chrome&logoColor=white)]()
[![Edge](https://img.shields.io/badge/Edge-≥105-0078D7?logo=microsoft-edge&logoColor=white)]()
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/DullSword/localstorage-inspector/pulls)

English · [简体中文](README.md)

</div>

## 📦 Features

- Dedicated DevTools panel to view all `localStorage` data of the current page
- Search & filter by `key` or `value` with entry count display
- Add, edit, delete individual entries, and clear all data with confirmation
- JSON values displayed as a collapsible tree with nested editing support
- Import / Export JSON (import supports `merge` and `replace` modes)
- One-click copy value (JSON gets auto-formatted)
- Live monitoring (polling) + manual refresh
- Theme switching (Dark / Light)
- English / Chinese language switching
- Key index sidebar for quick navigation
- Keyboard shortcuts:
  - `Alt+N` — Add new entry
  - `Alt+S` — Save in edit modal
  - `/` — Focus search box

## 📸 Screenshots

### Overview

![overview](screenshots/en/overview.png)

### Search & Inline Edit

![search-and-inline-edit](screenshots/en/search-and-inline-edit.png)

### Edit KV

![editKV](screenshots/en/editKV.png)

### Import

![import](screenshots/en/import.png)

## 🚀 Installation (Developer Mode)

> Works with Chrome / Edge (Chromium-based, version ≥ 105 recommended).

1. Download or clone this repository
2. Open the extensions management page:
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
3. Enable **Developer mode**
4. Click **Load unpacked**
5. Select the project root directory (the one containing `manifest.json`)
6. Open any webpage, press `F12` to open DevTools, and find the **LocalStorage Inspector** tab

## 🛠️ Tech Stack

- **Manifest V3** — Latest extension specification
- Vanilla JavaScript + HTML + CSS — No external dependencies

## 🤝 Contributing

Issues and Pull Requests are welcome!

## 📄 License

This project is licensed under the MIT License.
