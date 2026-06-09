# LocalStorage Inspector

一个基于 Chrome DevTools 的 `localStorage` 可视化查看与编辑扩展，适合前端调试和数据排查。

## 功能简介

- 在 DevTools 中新增独立面板，集中查看当前页面的 `localStorage` 数据。
- 支持按 `key/value` 搜索与过滤，并显示条目数量。
- 支持新增、编辑、删除单条数据，以及一键清空全部数据（带确认）。
- 支持 JSON 值的树形展示、展开/折叠与嵌套内容编辑。
- 支持导入/导出 JSON（导入支持 `merge` 与 `replace` 两种模式）。
- 支持一键复制值内容（JSON 会自动格式化后复制）。
- 支持实时监控（轮询刷新）和手动刷新。
- 支持主题切换（深色/浅色）与中英文切换。
- 支持 Key 索引侧栏，快速定位条目。
- 支持常用快捷键：
  - `Alt+N`：新增条目
  - `Alt+S`：在编辑弹窗中保存
  - `/`：快速聚焦搜索框

## 安装方式（开发模式）

> 适用于 Chrome / Edge（Chromium 内核，建议版本 >= 105）

1. 下载或克隆本项目到本地。
2. 打开浏览器扩展管理页：
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
3. 打开“开发者模式”。
4. 点击“加载已解压的扩展程序（Load unpacked）”。
5. 选择本项目根目录（即包含 `manifest.json` 的目录）。
6. 安装完成后，打开任意网页并按 `F12` 打开 DevTools，在顶部面板中找到 `LocalStorage Inspector`。
