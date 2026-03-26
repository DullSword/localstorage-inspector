/**
 * LocalStorage Inspector - DevTools Panel - LocalStorage Inspector DevTools 面板
 * A powerful localStorage viewer & editor for developers - 面向开发者的强大 localStorage 查看与编辑工具
 */

(function () {
    'use strict';
    const THEME_STORAGE_KEY = 'lsinspector_theme';
    const LIVE_ENABLED_STORAGE_KEY = 'lsinspector_live_enabled';

    // ============================================
    // DOM References - DOM 引用
    // ============================================
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const searchInput = $('#searchInput');
    const clearSearch = $('#clearSearch');
    const entryCount = $('#entryCount');
    const tableBody = $('#tableBody');
    const emptyState = $('#emptyState');
    const noResultsState = $('#noResultsState');
    const searchBox = searchInput.parentElement;
    const btnThemeToggle = $('#btnThemeToggle');

    // Modal elements - 模态框元素
    const modalOverlay = $('#modalOverlay');
    const modalTitle = $('#modalTitle');
    const modalKey = $('#modalKey');
    const modalValue = $('#modalValue');
    const modalSave = $('#modalSave');
    const modalCancel = $('#modalCancel');
    const modalClose = $('#modalClose');
    const valueTypeBadge = $('#valueTypeBadge');


    // Import modal - 导入模态框
    const importModalOverlay = $('#importModalOverlay');
    const importDropZone = $('#importDropZone');
    const importFileInput = $('#importFileInput');
    const importTextarea = $('#importTextarea');
    const importConfirm = $('#importConfirm');
    const importCancel = $('#importCancel');
    const importModalClose = $('#importModalClose');
    const btnSelectFile = $('#btnSelectFile');

    // Confirm dialog - 确认对话框
    const confirmOverlay = $('#confirmOverlay');
    const confirmTitle = $('#confirmTitle');
    const confirmMessage = $('#confirmMessage');
    const confirmOk = $('#confirmOk');
    const confirmCancel = $('#confirmCancel');

    // Toast - 提示消息容器
    const toastContainer = $('#toastContainer');

    // ============================================
    // State - 状态变量
    // ============================================
    let allEntries = []; // { key, value (raw string) } - { 键, 值 (原始字符串) }
    let filteredEntries = [];
    let currentSearchTerm = '';
    let editingKey = null; // null = add mode, string = edit mode - null = 新增模式, string = 编辑模式
    let confirmCallback = null;
    let lastDataHash = ''; // for detecting changes - 用于检测数据变化
    let isLiveEnabled = true; // live monitoring toggle - 实时监控开关
    let currentTheme = 'dark'; // theme toggle - 主题切换

    // Direct editing state - 直接编辑状态
    function createEmptyEditingState() {
        return {
            isEditing: false,
            isSaving: false,
            row: null,
            container: null,
            editTarget: null,
            editingElement: null,
            originalValue: null,
            originalEntryValue: null,
            valueType: 'string'
        };
    }

    let currentEditing = createEmptyEditingState();

    // ============================================
    // LocalStorage Access via DevTools API - 通过 DevTools API 访问 LocalStorage
    // ============================================
    function evalInPage(expression) {
        return new Promise((resolve, reject) => {
            chrome.devtools.inspectedWindow.eval(expression, (result, isException) => {
                if (isException) {
                    reject(isException);
                } else {
                    resolve(result);
                }
            });
        });
    }

    async function loadLocalStorage(silent = false) {
        try {
            const data = await evalInPage(`
        (function() {
          var result = {};
          for (var i = 0; i < localStorage.length; i++) {
            var key = localStorage.key(i);
            result[key] = localStorage.getItem(key);
          }
          return JSON.stringify(result);
        })()
      `);

            // Check if data changed - 检查数据是否变化
            const newHash = simpleHash(data);
            if (newHash === lastDataHash) {
                return false; // No changes - 无变化
            }
            lastDataHash = newHash;

            const parsed = JSON.parse(data);
            allEntries = Object.entries(parsed).map(([key, value]) => ({ key, value }));
            allEntries.sort((a, b) => a.key.localeCompare(b.key));
            applyFilter();
            return true;
        } catch (e) {
            console.error('Failed to load localStorage:', e);
            if (!silent) {
                showToast('无法读取 localStorage', 'error');
            }
            return false;
        }
    }

    // Simple hash function for change detection - 简单哈希函数用于变化检测
    function simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString();
    }

    async function setLocalStorageItem(key, value) {
        try {
            const escapedKey = escapeJsString(key);
            const escapedValue = escapeJsString(value);
            await evalInPage(`localStorage.setItem('${escapedKey}', '${escapedValue}')`);
            return true;
        } catch (e) {
            console.error('Failed to set localStorage item:', e);
            showToast('保存失败: ' + e.message, 'error');
            return false;
        }
    }

    async function removeLocalStorageItem(key) {
        try {
            const escapedKey = escapeJsString(key);
            await evalInPage(`localStorage.removeItem('${escapedKey}')`);
            return true;
        } catch (e) {
            console.error('Failed to remove localStorage item:', e);
            showToast('删除失败: ' + e.message, 'error');
            return false;
        }
    }

    async function clearAllLocalStorage() {
        try {
            await evalInPage(`localStorage.clear()`);
            return true;
        } catch (e) {
            console.error('Failed to clear localStorage:', e);
            showToast('清空失败: ' + e.message, 'error');
            return false;
        }
    }

    function escapeJsString(str) {
        return str
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/"/g, '\\"')
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r')
            .replace(/\t/g, '\\t')
            .replace(/\0/g, '\\0');
    }

    // ============================================
    // Rendering - 渲染
    // ============================================
    function applyFilter() {
        const term = currentSearchTerm.toLowerCase().trim();
        if (!term) {
            filteredEntries = [...allEntries];
        } else {
            filteredEntries = allEntries.filter(entry => {
                return entry.key.toLowerCase().includes(term) ||
                    entry.value.toLowerCase().includes(term);
            });
        }
        renderTable();
        updateEntryCount();
    }

    function renderTable() {
        tableBody.innerHTML = '';

        if (allEntries.length === 0) {
            emptyState.style.display = 'flex';
            noResultsState.style.display = 'none';
            tableBody.style.display = 'none';
            return;
        }

        emptyState.style.display = 'none';

        if (filteredEntries.length === 0) {
            noResultsState.style.display = 'flex';
            tableBody.style.display = 'none';
            return;
        }

        noResultsState.style.display = 'none';
        tableBody.style.display = 'block';

        const fragment = document.createDocumentFragment();
        for (const entry of filteredEntries) {
            fragment.appendChild(createEntryRow(entry));
        }
        tableBody.appendChild(fragment);
    }

    function createEntryRow(entry) {
        const row = document.createElement('div');
        row.className = 'entry-row';
        row.dataset.key = entry.key;

        // Key column - 键列
        const colKey = document.createElement('div');
        colKey.className = 'col-key';
        colKey.textContent = entry.key;
        if (currentSearchTerm) {
            colKey.innerHTML = highlightText(entry.key, currentSearchTerm);
        }
        setEditableMetadata(colKey, {
            kind: 'top-key',
            path: [],
            storageKey: entry.key
        });

        // Value column - 值列
        const colValue = document.createElement('div');
        colValue.className = 'col-value';
        const valueDisplay = renderValue(entry);
        colValue.appendChild(valueDisplay);

        // Actions column - 操作列
        const colActions = document.createElement('div');
        colActions.className = 'col-actions';
        const actions = document.createElement('div');
        actions.className = 'row-actions';

        // Copy button - 复制按钮
        const btnCopy = createActionButton(
            '<svg viewBox="0 0 16 16" fill="none"><rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M3 10.5V3a1.5 1.5 0 0 1 1.5-1.5H11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
            '复制值',
            () => copyToClipboard(entry.value)
        );

        // Edit button - 编辑按钮
        const btnEdit = createActionButton(
            '<svg viewBox="0 0 16 16" fill="none"><path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
            '编辑',
            () => openEditModal(entry.key, entry.value)
        );

        // Delete button - 删除按钮
        const btnDelete = createActionButton(
            '<svg viewBox="0 0 16 16" fill="none"><path d="M2 4h12M5.33 4V2.67a1.33 1.33 0 0 1 1.34-1.34h2.66a1.33 1.33 0 0 1 1.34 1.34V4m2 0v9.33a1.33 1.33 0 0 1-1.34 1.34H4.67a1.33 1.33 0 0 1-1.34-1.34V4h9.34Z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
            '删除',
            () => deleteEntry(entry.key)
        );
        btnDelete.classList.add('btn-delete');

        actions.append(btnCopy, btnEdit, btnDelete);
        colActions.appendChild(actions);
        row.append(colKey, colValue, colActions);

        // Double-click behavior - 双击行为：
        // 1) editable target => direct edit - 1) 可编辑目标 => 直接编辑
        // 2) JSON value blank/symbol area => fallback to modal edit - 2) JSON 值空白/符号区域 => 回退到模态框编辑
        // 3) non-JSON value area => keep top-level direct edit - 3) 非 JSON 值区域 => 保持顶层直接编辑
        row.addEventListener('dblclick', (e) => {
            e.stopPropagation();

            const targetElement = e.target instanceof Element ? e.target : null;
            if (!targetElement) {
                return;
            }

            const editableElement = targetElement.closest('[data-editable="true"]');
            if (editableElement && row.contains(editableElement)) {
                const editTarget = buildEditTarget(editableElement);
                if (!editTarget) {
                    return;
                }
                startDirectEdit(row, editableElement, editTarget);
                return;
            }

            const valueColumn = targetElement.closest('.col-value');
            if (!valueColumn || !row.contains(valueColumn)) {
                return;
            }

            // JSON rows: fallback to modal when dblclicking non-editable areas. - JSON 行：双击不可编辑区域时回退到模态框编辑。
            if (valueColumn.querySelector('.json-tree')) {
                const nonFallbackControl = targetElement.closest('.json-toggle, button, input, textarea, select, option, [contenteditable="true"]');
                if (nonFallbackControl && row.contains(nonFallbackControl)) {
                    return;
                }

                if (currentEditing.isEditing) {
                    safeCancelCurrentEdit();
                }

                const latestEntry = allEntries.find((item) => item.key === row.dataset.key) || entry;
                if (!latestEntry) {
                    return;
                }

                openEditModal(latestEntry.key, latestEntry.value);
                return;
            }

            const topValueElement = valueColumn.querySelector('[data-editable="true"][data-edit-kind="top-value"]');
            if (!topValueElement) {
                return;
            }

            const topValueTarget = buildEditTarget(topValueElement);
            if (!topValueTarget) {
                return;
            }

            startDirectEdit(row, topValueElement, topValueTarget);
        });

        return row;
    }

    function createActionButton(svgHtml, title, onClick) {
        const btn = document.createElement('button');
        btn.className = 'btn-row-action';
        btn.innerHTML = svgHtml;
        btn.title = title;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            onClick();
        });
        return btn;
    }

    // ============================================
    // Utility Functions - 工具函数
    // ============================================

    // Debounce function - 防抖函数
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Auto-format JSON function - 自动格式化 JSON 函数
    function autoFormatJSON() {
        const value = modalValue.value.trim();
        if (!value) return;

        try {
            const parsed = JSON.parse(value);
            if (typeof parsed === 'object' && parsed !== null) {
                const formatted = JSON.stringify(parsed, null, 2);
                // Only update if different from current value - 仅当与当前值不同时更新
                if (formatted !== modalValue.value) {
                    modalValue.value = formatted;
                    updateValueTypeBadge(formatted);
                }
            }
        } catch (e) {
            // Not valid JSON, skip formatting - 不是有效的 JSON，跳过格式化
        }
    }

    // ============================================
    // Value Rendering (JSON Tree) - 值渲染 (JSON 树)
    // ============================================
    function renderValue(rawValue) {
        // Try to parse as JSON - 尝试解析为 JSON
        let parsed;
        let isJson = false;
        try {
            parsed = JSON.parse(rawValue);
            if (typeof parsed === 'object' && parsed !== null) {
                isJson = true;
            }
        } catch (e) {
            // Not JSON - 不是 JSON
        }

        if (isJson) {
            return renderJsonTree(parsed);
        }

        // Simple value - 简单值
        const span = document.createElement('span');
        span.className = 'value-simple';
        // Add editing metadata to dataset - 添加编辑信息到 dataset
        span.dataset.editKind = 'top-value';
        span.dataset.storageKey = null; // Will be set in createEntryRow - 将在 createEntryRow 中设置
        // Add editing metadata to dataset - 添加编辑信息到 dataset
        span.dataset.editKind = 'top-value';
        span.dataset.storageKey = null; // Will be set in createEntryRow - 将在 createEntryRow 中设置

        if (rawValue === 'true' || rawValue === 'false') {
            span.classList.add('json-boolean');
            const displayValue = rawValue;
            if (currentSearchTerm) {
                span.innerHTML = highlightText(displayValue, currentSearchTerm);
            } else {
                span.textContent = displayValue;
            }
        } else if (rawValue === 'null') {
            span.classList.add('json-null');
            const displayValue = 'null';
            if (currentSearchTerm) {
                span.innerHTML = highlightText(displayValue, currentSearchTerm);
            } else {
                span.textContent = displayValue;
            }
        } else if (!isNaN(rawValue) && rawValue.trim() !== '') {
            span.classList.add('json-number');
            const displayValue = rawValue;
            if (currentSearchTerm) {
                span.innerHTML = highlightText(displayValue, currentSearchTerm);
            } else {
                span.textContent = displayValue;
            }
        } else {
            span.classList.add('json-string');
            const displayValue = rawValue.length > 500 ? rawValue.substring(0, 500) + '...' : rawValue;
            if (currentSearchTerm) {
                span.innerHTML = '"' + highlightText(displayValue, currentSearchTerm) + '"';
            } else {
                span.textContent = '"' + displayValue + '"';
            }
        }

        return span;
    }

    function renderJsonTree(data, depth = 0) {
        const container = document.createElement('div');
        container.className = 'json-tree';

        const tree = buildJsonNode(data, depth, null, true);
        container.appendChild(tree);
        return container;
    }

    function buildJsonNode(value, depth, key, isLast) {
        if (value === null) {
            return buildPrimitive('null', 'json-null', key, isLast);
        }

        const type = typeof value;

        if (type === 'string') {
            return buildPrimitive('"' + escapeHtml(value) + '"', 'json-string', key, isLast);
        }
        if (type === 'number') {
            return buildPrimitive(String(value), 'json-number', key, isLast);
        }
        if (type === 'boolean') {
            return buildPrimitive(String(value), 'json-boolean', key, isLast);
        }

        if (Array.isArray(value)) {
            return buildComposite(value, key, isLast, depth, true);
        }
        if (type === 'object') {
            return buildComposite(value, key, isLast, depth, false);
        }

        return buildPrimitive(String(value), 'json-string', key, isLast);
    }

    function buildPrimitive(displayValue, className, key, isLast, depth) {
        const line = document.createElement('div');
        line.className = 'json-line';

        if (key !== null) {
            const keySpan = document.createElement('span');
            keySpan.className = 'json-key';
            const keyText = '"' + key + '"';
            if (currentSearchTerm) {
                keySpan.innerHTML = highlightText(keyText, currentSearchTerm);
            } else {
                keySpan.textContent = keyText;
            }
            const colon = document.createElement('span');
            colon.className = 'json-colon';
            colon.textContent = ':';
            line.append(keySpan, colon);
        }

        const valueSpan = document.createElement('span');
        valueSpan.className = className;
        if (currentSearchTerm) {
            valueSpan.innerHTML = highlightText(displayValue, currentSearchTerm);
        } else {
            valueSpan.textContent = displayValue;
        }

        // Add editing metadata - 添加编辑信息
        if (key !== null) {
            // Nested key supports rename editing - 嵌套 key，支持重命名编辑
            valueSpan.dataset.editKind = 'nested-key';
            valueSpan.dataset.keyName = key;
            valueSpan.dataset.parentPath = depth > 0 ? buildPathString(key, depth) : '';
        } else if (Array.isArray(value)) {
            // Array element supports value editing - 数组元素，支持值编辑
            valueSpan.dataset.editKind = 'nested-value';
            valueSpan.dataset.parentPath = buildPathString(key || String(entries.findIndex(([k]) => k === key)), depth);
        } else {
            // Top-level value supports value editing - 顶层值，支持值编辑
            valueSpan.dataset.editKind = 'top-value';
            valueSpan.dataset.parentPath = '';
        }
        line.appendChild(valueSpan);

        if (!isLast) {
            const comma = document.createElement('span');
            comma.className = 'json-comma';
            comma.textContent = ',';
            line.appendChild(comma);
        }

        return line;
    }

    function buildComposite(value, key, isLast, depth, isArray) {
        const entries = isArray ? value : Object.entries(value);
        const count = isArray ? value.length : entries.length;
        const openBracket = isArray ? '[' : '{';
        const closeBracket = isArray ? ']' : '}';

        const node = document.createElement('div');
        node.className = 'json-node';

        // First line with toggle + opening bracket - 带折叠按钮和左括号的第一行
        const firstLine = document.createElement('div');
        firstLine.className = 'json-line';

        // Toggle arrow - 折叠箭头
        const toggle = document.createElement('span');
        toggle.className = 'json-toggle';
        toggle.innerHTML = '<svg viewBox="0 0 10 10"><path d="M3 2l4 3-4 3z" fill="currentColor"/></svg>';
        firstLine.appendChild(toggle);

        if (key !== null) {
            const keySpan = document.createElement('span');
            keySpan.className = 'json-key';
            const keyText = '"' + key + '"';
            if (currentSearchTerm) {
                keySpan.innerHTML = highlightText(keyText, currentSearchTerm);
            } else {
                keySpan.textContent = keyText;
            }
            const colon = document.createElement('span');
            colon.className = 'json-colon';
            colon.textContent = ':';
            firstLine.append(keySpan, colon);
        }

        const openSpan = document.createElement('span');
        openSpan.className = 'json-bracket';
        openSpan.textContent = openBracket;
        firstLine.appendChild(openSpan);

        // Ellipsis (shown when collapsed) - 省略号 (折叠时显示)
        const ellipsis = document.createElement('span');
        ellipsis.className = 'json-ellipsis';
        const summaryText = count === 0 ? '' : ` ... ${count} ${isArray ? '项' : '个属性'} `;
        if (currentSearchTerm) {
            ellipsis.innerHTML = highlightText(summaryText, currentSearchTerm);
        } else {
            ellipsis.textContent = summaryText;
        }
        firstLine.appendChild(ellipsis);

        // Inline closing bracket (shown when collapsed) - 内联右括号 (折叠时显示)
        const inlineClose = document.createElement('span');
        inlineClose.className = 'json-bracket json-ellipsis';
        inlineClose.textContent = closeBracket;
        firstLine.appendChild(inlineClose);

        if (!isLast) {
            const commaCollapsed = document.createElement('span');
            commaCollapsed.className = 'json-comma json-ellipsis';
            commaCollapsed.textContent = ',';
            firstLine.appendChild(commaCollapsed);
        }

        node.appendChild(firstLine);

        // Children - 子元素
        const children = document.createElement('div');
        children.className = 'json-children';

        if (isArray) {
            for (let i = 0; i < value.length; i++) {
                children.appendChild(buildJsonNode(value[i], depth + 1, null, i === value.length - 1));
            }
        } else {
            for (let i = 0; i < entries.length; i++) {
                const [k, v] = entries[i];
                children.appendChild(buildJsonNode(v, depth + 1, k, i === entries.length - 1));
            }
        }

        node.appendChild(children);

        // Closing bracket - 右括号
        const closing = document.createElement('div');
        closing.className = 'json-closing';
        const closeSpan = document.createElement('span');
        closeSpan.className = 'json-bracket';
        closeSpan.textContent = closeBracket;
        closing.appendChild(closeSpan);

        if (!isLast) {
            const comma = document.createElement('span');
            comma.className = 'json-comma';
            comma.textContent = ',';
            closing.appendChild(comma);
        }
        node.appendChild(closing);

        // Toggle click handler - 折叠点击处理
        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            node.classList.toggle('is-collapsed');
            toggle.classList.toggle('collapsed');
        });

        // Auto-collapse deep nesting (depth > 3) - 自动折叠深层嵌套 (深度 > 3)
        if (depth > 3) {
            node.classList.add('is-collapsed');
            toggle.classList.add('collapsed');
        }

        return node;
    }

    // ============================================
    // Direct Editing Functions - 直接编辑功能
    // ============================================

    function startDirectKeyEdit(row, cell, currentKey) {
        if (currentEditing.isEditing) {
            // If this key is already being edited and unchanged, exit edit mode directly - 如果是当前正在编辑的 key，且没有修改，则直接退出编辑状态
            if (currentEditing.entryKey === currentKey) {
                cancelDirectEdit();
                return;
            }
            // Otherwise, safely cancel current edit first - 否则，先安全地取消当前编辑
            safeCancelCurrentEdit();

            // Add a delay to ensure DOM updates are complete - 添加一个延迟以确保 DOM 更新完成
            setTimeout(() => {
                createAndStartKeyEdit(row, cell, currentKey);
            }, 10);
            return;
        }

        // If there is no active edit, start a new edit directly - 如果没有编辑状态，直接开始新的编辑
        createAndStartKeyEdit(row, cell, currentKey);
    }

    function createAndStartKeyEdit(row, cell, currentKey) {
        const newKeyInput = createEditInput(currentKey, 'key');
        cell.innerHTML = '';
        cell.appendChild(newKeyInput);
        newKeyInput.focus();
        newKeyInput.select();

        // Reset the editing state object - 重置编辑状态对象
        currentEditing = {
            isEditing: true,
            row: row,
            cell: cell,
            entryKey: currentKey,
            entryValue: allEntries.find(e => e.key === currentKey)?.value || '',
            isKeyEdit: true,
            valuePath: [],
            editingElement: newKeyInput,
            originalValue: currentKey
        };

        // Add save/cancel handlers - 添加保存/取消处理
        const blurHandler = (e) => {
            // Use setTimeout to finish the event loop and avoid save when canceling a new edit - 使用 setTimeout 确保事件循环完成，避免在取消新编辑时触发保存
            setTimeout(() => {
                if (currentEditing.isEditing && currentEditing.editingElement === newKeyInput) {
                    saveDirectEdit();
                }
            }, 0);
        };
        const keydownHandler = (e) => {
            if (e.key === 'Enter') {
                saveDirectEdit();
            } else if (e.key === 'Escape') {
                cancelDirectEdit();
            }
        };

        newKeyInput.addEventListener('blur', blurHandler);
        newKeyInput.addEventListener('keydown', keydownHandler);
    }

    function startDirectValueEdit(row, cell, key, value, event) {
        if (currentEditing.isEditing) {
            // Safely cancel current edit first without triggering blur - 先安全地取消当前编辑，不触发 blur 事件
            safeCancelCurrentEdit();

            // Add a delay to ensure DOM updates are complete - 添加一个延迟以确保 DOM 更新完成
            setTimeout(() => {
                createAndStartValueEdit(row, cell, key, value, event);
            }, 10);
            return;
        }

        // If there is no active edit, start a new edit directly - 如果没有编辑状态，直接开始新的编辑
        createAndStartValueEdit(row, cell, key, value, event);
    }

    function createAndStartValueEdit(row, cell, key, value, event) {
        const target = event.target;
        const valuePath = parseValuePath(target);

        try {
            const parsedValue = JSON.parse(value);
            const newValue = getValueAtPath(parsedValue, valuePath);
            const displayValue = displayValueForEdit(newValue);

            const valueInput = createEditInput(displayValue, 'value');

            // Replace the clicked element with input - 用输入框替换被点击元素
            if (target.closest('.json-line')) {
                const line = target.closest('.json-line');
                const valueSpan = line.querySelector('.json-string, .json-number, .json-boolean, .json-null');
                if (valueSpan) {
                    valueSpan.innerHTML = '';
                    valueSpan.appendChild(valueInput);
                } else {
                    line.appendChild(valueInput);
                }
            } else {
                // For simple values or JSON tree nodes - 适用于简单值或 JSON 树节点
                const elementToReplace = target.closest('.value-simple, .json-node, .json-line');
                if (elementToReplace) {
                    elementToReplace.innerHTML = '';
                    elementToReplace.appendChild(valueInput);
                }
            }

            valueInput.focus();
            if (typeof newValue === 'string') {
                // Select text content for strings, not quotes - 字符串仅选中文本内容，不包含引号
                valueInput.setSelectionRange(1, valueInput.value.length - 1);
            } else {
                valueInput.select();
            }

            // Reset the editing state object - 重置编辑状态对象
            currentEditing = {
                isEditing: true,
                row: row,
                cell: cell,
                entryKey: key,
                entryValue: value,
                isKeyEdit: false,
                valuePath: valuePath,
                editingElement: valueInput,
                originalValue: newValue
            };

            // Add save/cancel handlers - 添加保存/取消处理
            const blurHandler = (e) => {
                // Use setTimeout to finish the event loop and avoid save when canceling a new edit - 使用 setTimeout 确保事件循环完成，避免在取消新编辑时触发保存
                setTimeout(() => {
                    if (currentEditing.isEditing && currentEditing.editingElement === valueInput) {
                        saveDirectEdit();
                    }
                }, 0);
            };
            const keydownHandler = (e) => {
                if (e.key === 'Enter') {
                    saveDirectEdit();
                } else if (e.key === 'Escape') {
                    cancelDirectEdit();
                }
            };

            valueInput.addEventListener('blur', blurHandler);
            valueInput.addEventListener('keydown', keydownHandler);

        } catch (e) {
            // Fallback for simple values that can't be parsed as JSON - 无法解析为 JSON 的简单值回退处理
            const displayValue = value.replace(/^"|"$/g, ''); // Remove quotes from string display - 移除字符串显示中的引号
            const valueInput = createEditInput(displayValue, 'value');

            if (target.closest('.value-simple')) {
                const parent = target.closest('.value-simple');
                parent.innerHTML = '';
                parent.appendChild(valueInput);
            }

            valueInput.focus();
            valueInput.select();

            // Reset the editing state object - 重置编辑状态对象
            currentEditing = {
                isEditing: true,
                row: row,
                cell: cell,
                entryKey: key,
                entryValue: value,
                isKeyEdit: false,
                valuePath: [],
                editingElement: valueInput,
                originalValue: value
            };

            // Add save/cancel handlers - 添加保存/取消处理
            const blurHandler = (e) => {
                // Use setTimeout to finish the event loop and avoid save when canceling a new edit - 使用 setTimeout 确保事件循环完成，避免在取消新编辑时触发保存
                setTimeout(() => {
                    if (currentEditing.isEditing && currentEditing.editingElement === valueInput) {
                        saveDirectEdit();
                    }
                }, 0);
            };
            const keydownHandler = (e) => {
                if (e.key === 'Enter') {
                    saveDirectEdit();
                } else if (e.key === 'Escape') {
                    cancelDirectEdit();
                }
            };

            valueInput.addEventListener('blur', blurHandler);
            valueInput.addEventListener('keydown', keydownHandler);
        }
    }

    function parseValuePath(element) {
        const path = [];

        // Navigate up the DOM to find the path - 向上遍历 DOM 查找路径
        let current = element;
        while (current && current !== document.body) {
            if (current.classList.contains('json-line')) {
                const keySpan = current.querySelector('.json-key');
                const indexMatch = current.querySelector('[data-index]');

                if (keySpan && keySpan.textContent) {
                    const key = keySpan.textContent.replace(/^"|"$/g, ''); // Remove quotes - 移除引号
                    path.unshift(key);
                } else if (indexMatch) {
                    path.unshift(parseInt(indexMatch.dataset.index));
                }
            }
            current = current.parentElement;
        }

        return path;
    }

    function getValueAtPath(obj, path) {
        let current = obj;
        for (const key of path) {
            current = current[key];
        }
        return current;
    }

    function setValueAtPath(obj, path, value) {
        let current = obj;
        for (let i = 0; i < path.length - 1; i++) {
            current = current[path[i]];
        }
        current[path[path.length - 1]] = value;
    }

    function displayValueForEdit(value) {
        if (typeof value === 'string') {
            return value;
        } else if (value === null) {
            return 'null';
        } else if (typeof value === 'boolean') {
            return value.toString();
        } else if (typeof value === 'number') {
            return value.toString();
        } else {
            return JSON.stringify(value, null, 2);
        }
    }

    async function saveDirectEdit() {
        if (!currentEditing.isEditing) return;

        const newValue = currentEditing.editingElement.value.trim();

        if (currentEditing.isKeyEdit) {
            // Edit key - 编辑键名
            if (!newValue) {
                showToast('Key 不能为空', 'warning');
                currentEditing.isEditing = false;
                // Restore original state without saving - 不保存并恢复原始状态
                const row = currentEditing.row;
                const entry = allEntries.find(e => e.key === currentEditing.entryKey);
                if (entry) {
                    const newRow = createEntryRow(entry);
                    row.parentNode.replaceChild(newRow, row);
                }
                return;
            }

            // Check if new key already exists (except for current key) - 检查新键是否已存在（排除当前键）
            const exists = allEntries.find(e => e.key === newValue && e.key !== currentEditing.entryKey);
            if (exists) {
                showToast('Key 已存在', 'warning');
                currentEditing.isEditing = false;
                // Restore original state without saving - 不保存并恢复原始状态
                const row = currentEditing.row;
                const entry = allEntries.find(e => e.key === currentEditing.entryKey);
                if (entry) {
                    const newRow = createEntryRow(entry);
                    row.parentNode.replaceChild(newRow, row);
                }
                return;
            }

            // Save new key (only if actually changed) - 保存新键（仅在确实变更时）
            if (newValue !== currentEditing.entryKey) {
                const oldValue = currentEditing.entryValue;
                const success = await setLocalStorageItem(newValue, oldValue);

                if (success) {
                    // Remove old key - 移除旧键
                    await removeLocalStorageItem(currentEditing.entryKey);
                    showToast('Key 已更新', 'success');
                    lastDataHash = '';
                    await loadLocalStorage(true);
                }
            } else {
                // Key didn't actually change, restore original display state - 键名实际未变化，恢复原始显示状态
                const row = currentEditing.row;
                const entry = allEntries.find(e => e.key === currentEditing.entryKey);
                if (entry) {
                    const newRow = createEntryRow(entry);
                    row.parentNode.replaceChild(newRow, row);
                }
                currentEditing.isEditing = false;
                showToast('Key 未修改', 'info');
            }
        } else {
            // Edit value - 编辑值
            if (!newValue) {
                showToast('Value 不能为空', 'warning');
                currentEditing.isEditing = false;
                // Restore original state without saving - 不保存并恢复原始状态
                const row = currentEditing.row;
                const entry = allEntries.find(e => e.key === currentEditing.entryKey);
                if (entry) {
                    const newRow = createEntryRow(entry);
                    row.parentNode.replaceChild(newRow, row);
                }
                return;
            }

            let finalValue = newValue;

            try {
                // Try to parse as JSON if it looks like JSON - 若看起来像 JSON 则尝试解析
                if (newValue.startsWith('{') || newValue.startsWith('[') ||
                    (newValue.startsWith('"') && newValue.endsWith('"')) ||
                    newValue === 'null' || newValue === 'true' || newValue === 'false' ||
                    !isNaN(newValue)) {
                    finalValue = JSON.parse(newValue);
                }
            } catch (e) {
                // Keep as string if not valid JSON - 若不是有效 JSON 则保持字符串
            }

            const success = await setLocalStorageItem(currentEditing.entryKey, finalValue);

            if (success) {
                // If value did not actually change, restore original display state - 如果值没有实际改变，恢复原始显示状态
                if (finalValue === currentEditing.originalValue) {
                    const row = currentEditing.row;
                    const entry = allEntries.find(e => e.key === currentEditing.entryKey);
                    if (entry) {
                        const newRow = createEntryRow(entry);
                        row.parentNode.replaceChild(newRow, row);
                    }
                    showToast('Value 未修改', 'info');
                } else {
                    showToast('Value 已更新', 'success');
                    lastDataHash = '';
                    await loadLocalStorage(true);
                }
            }
        }

        currentEditing.isEditing = false;
    }

    function safeCancelCurrentEdit() {
        if (!currentEditing.isEditing) return;

        // Save current editing state info - 保存当前编辑状态信息
        const currentRow = currentEditing.row;
        const currentEntryKey = currentEditing.entryKey;

        // Re-render current row directly; this clears all inputs and event listeners - 直接重新渲染当前行，这会自动清理所有输入框和事件监听器
        const entry = allEntries.find(e => e.key === currentEntryKey);
        if (entry && currentRow) {
            const newRow = createEntryRow(entry);
            currentRow.parentNode.replaceChild(newRow, currentRow);
        }

        // Reset the editing state object - 重置编辑状态对象
        currentEditing = {
            isEditing: false,
            row: null,
            cell: null,
            entryKey: null,
            entryValue: null,
            isKeyEdit: false,
            valuePath: [],
            editingElement: null,
            originalValue: null
        };
    }

    function cancelDirectEdit() {
        if (!currentEditing.isEditing) return;

        // Cancel any pending save operations - 取消所有待执行的保存操作
        const editingElements = document.querySelectorAll('.direct-edit-input');
        editingElements.forEach(input => input.remove());

        currentEditing.isEditing = false;

        // Re-render the row to restore original state WITHOUT saving - 重新渲染该行以恢复原始状态（不保存）
        const row = currentEditing.row;
        const entry = allEntries.find(e => e.key === currentEditing.entryKey);
        if (entry) {
            const newRow = createEntryRow(entry);
            row.parentNode.replaceChild(newRow, row);
        }
    }

    function buildPathString(keys, depth) {
        if (!Array.isArray(keys)) {
            return keys;
        }
        // Build path string: use JSON string format - 构建路径字符串：使用 JSON 字符串格式
        return JSON.stringify(keys);
    }

    // Build path string helper - 构建路径字符串辅助函数
    function buildPathString(keys, depth) {
        if (!Array.isArray(keys)) {
            return keys;
        }
        // Build path string: use JSON string format - 构建路径字符串：使用 JSON 字符串格式
        return JSON.stringify(keys);
    }

    // Build path string helper - 构建路径字符串辅助函数
    function buildPathString(keys, depth) {
        if (!Array.isArray(keys)) {
            return keys;
        }
        // Build path string: use JSON string format - 构建路径字符串：使用 JSON 字符串格式
        return JSON.stringify(keys);
    }

    // ============================================
    // Entry Count - 条目计数
    // ============================================
    function renderValue(entry) {
        let parsed;
        let isJson = false;

        try {
            parsed = JSON.parse(entry.value);
            if (typeof parsed === 'object' && parsed !== null) {
                isJson = true;
            }
        } catch (e) {
            // Not JSON - 不是 JSON
        }

        if (isJson) {
            return renderJsonTree(parsed, entry.key);
        }

        return renderSimpleValue(entry.value, entry.key);
    }

    function renderSimpleValue(rawValue, storageKey) {
        const span = document.createElement('span');
        span.className = 'value-simple';
        setEditableMetadata(span, {
            kind: 'top-value',
            path: [],
            storageKey: storageKey
        });

        if (rawValue === 'true' || rawValue === 'false') {
            span.classList.add('json-boolean');
            setHighlightedText(span, rawValue);
        } else if (rawValue === 'null') {
            span.classList.add('json-null');
            setHighlightedText(span, 'null');
        } else if (!isNaN(rawValue) && rawValue.trim() !== '') {
            span.classList.add('json-number');
            setHighlightedText(span, rawValue);
        } else {
            span.classList.add('json-string');
            const displayValue = rawValue.length > 500 ? rawValue.substring(0, 500) + '...' : rawValue;
            if (currentSearchTerm) {
                span.innerHTML = '"' + highlightText(displayValue, currentSearchTerm) + '"';
            } else {
                span.textContent = '"' + displayValue + '"';
            }
        }

        return span;
    }

    function renderJsonTree(data, storageKey) {
        const container = document.createElement('div');
        container.className = 'json-tree';
        container.appendChild(buildJsonNode(data, [], storageKey, 0, true, false));
        return container;
    }

    function buildJsonNode(value, path, storageKey, depth, isLast, appendComma) {
        if (value === null) {
            return buildPrimitiveNode('null', 'json-null', path, storageKey, isLast, appendComma);
        }

        const valueType = typeof value;

        if (valueType === 'string') {
            return buildPrimitiveNode('"' + value + '"', 'json-string', path, storageKey, isLast, appendComma);
        }
        if (valueType === 'number') {
            return buildPrimitiveNode(String(value), 'json-number', path, storageKey, isLast, appendComma);
        }
        if (valueType === 'boolean') {
            return buildPrimitiveNode(String(value), 'json-boolean', path, storageKey, isLast, appendComma);
        }
        if (Array.isArray(value)) {
            return buildCompositeNode(value, path, storageKey, depth, isLast, true, appendComma);
        }
        if (valueType === 'object') {
            return buildCompositeNode(value, path, storageKey, depth, isLast, false, appendComma);
        }

        return buildPrimitiveNode(String(value), 'json-string', path, storageKey, isLast, appendComma);
    }

    function buildPrimitiveNode(displayValue, className, path, storageKey, isLast, appendComma) {
        const line = document.createElement('div');
        line.className = 'json-line';

        appendJsonKey(line, path, storageKey);

        const valueSpan = document.createElement('span');
        valueSpan.className = className;
        if (path.length > 0) {
            valueSpan.classList.add('json-value-hitbox');
        }
        setHighlightedText(valueSpan, displayValue);
        setEditableMetadata(valueSpan, {
            kind: path.length === 0 ? 'top-value' : 'nested-value',
            path: path,
            storageKey: storageKey
        });
        line.appendChild(valueSpan);

        if (appendComma && !isLast) {
            const comma = document.createElement('span');
            comma.className = 'json-comma';
            comma.textContent = ',';
            line.appendChild(comma);
        }

        return line;
    }

    function buildCompositeNode(value, path, storageKey, depth, isLast, isArray, appendComma) {
        const entries = isArray ? value : Object.entries(value);
        const count = isArray ? value.length : entries.length;
        const openBracket = isArray ? '[' : '{';
        const closeBracket = isArray ? ']' : '}';

        const node = document.createElement('div');
        node.className = 'json-node';

        const firstLine = document.createElement('div');
        firstLine.className = 'json-line';

        const toggle = document.createElement('span');
        toggle.className = 'json-toggle';
        toggle.innerHTML = '<svg viewBox="0 0 10 10"><path d="M3 2l4 3-4 3z" fill="currentColor"/></svg>';
        firstLine.appendChild(toggle);

        appendJsonKey(firstLine, path, storageKey);

        const openSpan = document.createElement('span');
        openSpan.className = 'json-bracket';
        openSpan.textContent = openBracket;
        firstLine.appendChild(openSpan);

        const ellipsis = document.createElement('span');
        ellipsis.className = 'json-ellipsis';
        const summaryText = count === 0 ? '' : ` ... ${count} ${isArray ? '项' : '个属性'} `;
        setHighlightedText(ellipsis, summaryText);
        firstLine.appendChild(ellipsis);

        const inlineClose = document.createElement('span');
        inlineClose.className = 'json-bracket json-ellipsis';
        inlineClose.textContent = closeBracket;
        firstLine.appendChild(inlineClose);

        if (appendComma && !isLast) {
            const commaCollapsed = document.createElement('span');
            commaCollapsed.className = 'json-comma json-ellipsis';
            commaCollapsed.textContent = ',';
            firstLine.appendChild(commaCollapsed);
        }

        node.appendChild(firstLine);

        const children = document.createElement('div');
        children.className = 'json-children';
        const childAppendComma = isArray;

        if (isArray) {
            for (let i = 0; i < value.length; i++) {
                children.appendChild(buildJsonNode(value[i], path.concat(i), storageKey, depth + 1, i === value.length - 1, childAppendComma));
            }
        } else {
            for (let i = 0; i < entries.length; i++) {
                const [childKey, childValue] = entries[i];
                children.appendChild(buildJsonNode(childValue, path.concat(childKey), storageKey, depth + 1, i === entries.length - 1, childAppendComma));
            }
        }

        node.appendChild(children);

        const closing = document.createElement('div');
        closing.className = 'json-closing';
        const closeSpan = document.createElement('span');
        closeSpan.className = 'json-bracket';
        closeSpan.textContent = closeBracket;
        closing.appendChild(closeSpan);

        if (appendComma && !isLast) {
            const comma = document.createElement('span');
            comma.className = 'json-comma';
            comma.textContent = ',';
            closing.appendChild(comma);
        }

        node.appendChild(closing);

        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            node.classList.toggle('is-collapsed');
            toggle.classList.toggle('collapsed');
        });

        if (depth > 3) {
            node.classList.add('is-collapsed');
            toggle.classList.add('collapsed');
        }

        return node;
    }

    function appendJsonKey(line, path, storageKey) {
        if (!path.length) {
            return;
        }

        const keyName = path[path.length - 1];
        if (typeof keyName !== 'string') {
            return;
        }

        const keySpan = document.createElement('span');
        keySpan.className = 'json-key';
        const keyText = keyName;
        setHighlightedText(keySpan, keyText);
        setEditableMetadata(keySpan, {
            kind: 'nested-key',
            path: path,
            parentPath: path.slice(0, -1),
            keyName: keyName,
            storageKey: storageKey
        });

        const colon = document.createElement('span');
        colon.className = 'json-colon';
        colon.textContent = ':';
        line.append(keySpan, colon);
    }

    function setHighlightedText(element, text) {
        if (currentSearchTerm) {
            element.innerHTML = highlightText(text, currentSearchTerm);
        } else {
            element.textContent = text;
        }
    }

    function setEditableMetadata(element, target) {
        element.dataset.editable = 'true';
        element.dataset.editKind = target.kind;
        element.dataset.path = stringifyPath(target.path);
        element.dataset.storageKey = target.storageKey;

        if (target.kind === 'nested-key') {
            element.dataset.parentPath = stringifyPath(target.parentPath);
            element.dataset.keyName = target.keyName;
        }
    }

    function stringifyPath(path) {
        return JSON.stringify(Array.isArray(path) ? path : []);
    }

    function buildEditTarget(element) {
        const kind = element.dataset.editKind;
        const storageKey = element.dataset.storageKey;

        if (!kind || storageKey == null) {
            return null;
        }

        const target = {
            kind: kind,
            path: parseDatasetPath(element.dataset.path),
            storageKey: storageKey
        };

        if (kind === 'nested-key') {
            target.parentPath = parseDatasetPath(element.dataset.parentPath);
            target.keyName = element.dataset.keyName;
        }

        return target;
    }

    function parseDatasetPath(pathString) {
        if (!pathString) {
            return [];
        }

        try {
            const parsed = JSON.parse(pathString);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            return [];
        }
    }

    function startDirectEdit(row, editableElement, editTarget) {
        if (currentEditing.isSaving) {
            return;
        }

        let activeRow = row;
        let activeElement = editableElement;

        if (currentEditing.isEditing) {
            safeCancelCurrentEdit();
            activeRow = findEntryRow(editTarget.storageKey);
            activeElement = activeRow ? findEditableElement(activeRow, editTarget) : null;
        }

        if (!activeRow || !activeElement) {
            return;
        }

        const entry = allEntries.find((item) => item.key === editTarget.storageKey);
        if (!entry) {
            return;
        }

        const originalValue = resolveOriginalEditValue(entry, editTarget);
        if (typeof originalValue === 'undefined') {
            return;
        }

        const valueType = resolveEditValueType(editTarget, entry.value, originalValue);
        const inputType = isKeyEditKind(editTarget.kind) ? 'key' : 'value';
        const inputValue = getEditInputValue(editTarget, entry.value, originalValue);
        const input = createEditInput(inputValue, inputType, valueType);
        applyEditInputLayout(input, editTarget, inputValue);

        activeElement.replaceChildren(input);

        currentEditing = {
            isEditing: true,
            isSaving: false,
            row: activeRow,
            container: activeElement,
            editTarget: editTarget,
            editingElement: input,
            originalValue: originalValue,
            originalEntryValue: entry.value,
            valueType: valueType
        };

        input.focus();
        input.select();
        bindDirectEditEvents(input);
    }

    function findEntryRow(storageKey) {
        const rows = tableBody.querySelectorAll('.entry-row');
        for (const row of rows) {
            if (row.dataset.key === storageKey) {
                return row;
            }
        }
        return null;
    }

    function findEditableElement(row, editTarget) {
        const editableElements = row.querySelectorAll('[data-editable="true"]');
        for (const element of editableElements) {
            const target = buildEditTarget(element);
            if (isSameEditTarget(target, editTarget)) {
                return element;
            }
        }
        return null;
    }

    function isSameEditTarget(left, right) {
        if (!left || !right) {
            return false;
        }

        return left.kind === right.kind &&
            left.storageKey === right.storageKey &&
            stringifyPath(left.path) === stringifyPath(right.path) &&
            stringifyPath(left.parentPath) === stringifyPath(right.parentPath) &&
            String(left.keyName || '') === String(right.keyName || '');
    }

    function resolveOriginalEditValue(entry, editTarget) {
        if (editTarget.kind === 'top-key') {
            return entry.key;
        }
        if (editTarget.kind === 'top-value') {
            return entry.value;
        }
        if (editTarget.kind === 'nested-key') {
            return editTarget.keyName;
        }
        if (editTarget.kind === 'nested-value') {
            try {
                const parsed = JSON.parse(entry.value);
                return getValueAtPath(parsed, editTarget.path);
            } catch (e) {
                showToast('JSON 解析失败，无法编辑该值', 'error');
            }
        }
    }

    function resolveEditValueType(editTarget, rawEntryValue, originalValue) {
        if (editTarget.kind === 'top-value') {
            return inferTopLevelValueType(rawEntryValue);
        }
        return inferValueType(originalValue);
    }

    function inferTopLevelValueType(rawValue) {
        if (rawValue === 'true' || rawValue === 'false') {
            return 'boolean';
        }
        if (rawValue === 'null') {
            return 'null';
        }
        if (!isNaN(rawValue) && rawValue.trim() !== '') {
            return 'number';
        }
        return 'string';
    }

    function inferValueType(value) {
        if (value === null) {
            return 'null';
        }
        if (Array.isArray(value)) {
            return 'array';
        }
        return typeof value;
    }

    function isKeyEditKind(kind) {
        return kind === 'top-key' || kind === 'nested-key';
    }

    function getEditInputValue(editTarget, rawEntryValue, originalValue) {
        if (editTarget.kind === 'top-value') {
            return rawEntryValue;
        }
        return displayValueForEdit(originalValue);
    }

    function bindDirectEditEvents(input) {
        input.addEventListener('blur', () => {
            setTimeout(() => {
                if (currentEditing.isEditing && currentEditing.editingElement === input) {
                    saveDirectEdit();
                }
            }, 0);
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveDirectEdit();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelDirectEdit();
            }
        });
    }

    function createEditInput(value, type, valueType) {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'direct-edit-input';
        input.value = value;

        const width = type === 'key'
            ? '100%'
            : (valueType === 'boolean' || valueType === 'number' ? '100px' :
                valueType === 'null' ? '60px' : '300px');

        input.style.cssText = `
            background: var(--edit-input-bg);
            border: 2px solid var(--edit-input-border);
            color: var(--text-primary);
            padding: 4px 8px;
            border-radius: 4px;
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 14px;
            outline: none;
            width: ${width};
            ${type === 'key' ? 'min-width: 200px;' : ''}
        `;

        return input;
    }

    function applyEditInputLayout(input, editTarget, inputValue) {
        if (editTarget.kind === 'nested-key') {
            const textLength = String(inputValue || '').length;
            const widthInCh = Math.min(Math.max(textLength + 2, 8), 24);
            input.style.width = `${widthInCh}ch`;
            input.style.minWidth = '0';
            input.style.maxWidth = '100%';
            input.style.display = 'inline-block';
            input.style.verticalAlign = 'middle';
        }
    }

    function getValueAtPath(obj, path) {
        let current = obj;
        for (const key of path) {
            current = current[key];
        }
        return current;
    }

    function setValueAtPath(obj, path, value) {
        if (!path.length) {
            return value;
        }

        let current = obj;
        for (let i = 0; i < path.length - 1; i++) {
            current = current[path[i]];
        }
        current[path[path.length - 1]] = value;
        return obj;
    }

    function displayValueForEdit(value) {
        if (typeof value === 'string') {
            return value;
        }
        if (value === null) {
            return 'null';
        }
        if (typeof value === 'boolean' || typeof value === 'number') {
            return String(value);
        }
        return JSON.stringify(value);
    }

    async function saveDirectEdit() {
        if (!currentEditing.isEditing || currentEditing.isSaving) {
            return;
        }

        currentEditing.isSaving = true;
        const editingState = currentEditing;
        const rawInput = editingState.editingElement.value;
        const trimmedInput = rawInput.trim();

        if (editingState.editTarget.kind === 'top-key') {
            await saveTopLevelKey(editingState, trimmedInput);
        } else if (editingState.editTarget.kind === 'top-value') {
            await saveTopLevelValue(editingState, rawInput);
        } else if (editingState.editTarget.kind === 'nested-key') {
            await saveNestedKey(editingState, trimmedInput);
        } else if (editingState.editTarget.kind === 'nested-value') {
            await saveNestedValue(editingState, rawInput);
        }

        if (currentEditing === editingState) {
            currentEditing.isSaving = false;
        }
    }

    async function saveTopLevelKey(editingState, nextKey) {
        const currentKey = editingState.editTarget.storageKey;

        if (!nextKey) {
            showToast('Key 不能为空', 'warning');
            restoreEditingStateRow(editingState);
            return;
        }

        if (nextKey === currentKey) {
            showToast('Key 未修改', 'info');
            restoreEditingStateRow(editingState);
            return;
        }

        const exists = allEntries.some((entry) => entry.key === nextKey && entry.key !== currentKey);
        if (exists) {
            showToast('Key 已存在', 'warning');
            restoreEditingStateRow(editingState);
            return;
        }

        const saved = await setLocalStorageItem(nextKey, editingState.originalEntryValue);
        if (!saved) {
            restoreEditingStateRow(editingState);
            return;
        }

        const removed = await removeLocalStorageItem(currentKey);
        if (!removed) {
            await refreshDirectEditState();
            return;
        }

        showToast('Key 已更新', 'success');
        await refreshDirectEditState();
    }

    async function saveTopLevelValue(editingState, nextValue) {
        if (nextValue === editingState.originalEntryValue) {
            showToast('Value 未修改', 'info');
            restoreEditingStateRow(editingState);
            return;
        }

        const saved = await setLocalStorageItem(editingState.editTarget.storageKey, nextValue);
        if (!saved) {
            restoreEditingStateRow(editingState);
            return;
        }

        showToast('Value 已更新', 'success');
        await refreshDirectEditState();
    }

    async function saveNestedValue(editingState, rawInput) {
        let parsedRoot;

        try {
            parsedRoot = JSON.parse(editingState.originalEntryValue);
        } catch (e) {
            showToast('JSON 解析失败，无法保存', 'error');
            restoreEditingStateRow(editingState);
            return;
        }

        const nextValue = parseEditedValue(rawInput);
        if (areValuesEqual(nextValue, editingState.originalValue)) {
            showToast('Value 未修改', 'info');
            restoreEditingStateRow(editingState);
            return;
        }

        setValueAtPath(parsedRoot, editingState.editTarget.path, nextValue);

        const saved = await setLocalStorageItem(editingState.editTarget.storageKey, JSON.stringify(parsedRoot));
        if (!saved) {
            restoreEditingStateRow(editingState);
            return;
        }

        showToast('Value 已更新', 'success');
        await refreshDirectEditState();
    }

    async function saveNestedKey(editingState, nextKey) {
        const currentKey = editingState.editTarget.keyName;

        if (!nextKey) {
            showToast('Key 不能为空', 'warning');
            restoreEditingStateRow(editingState);
            return;
        }

        if (nextKey === currentKey) {
            showToast('Key 未修改', 'info');
            restoreEditingStateRow(editingState);
            return;
        }

        let parsedRoot;
        try {
            parsedRoot = JSON.parse(editingState.originalEntryValue);
        } catch (e) {
            showToast('JSON 解析失败，无法保存', 'error');
            restoreEditingStateRow(editingState);
            return;
        }

        const parentValue = getValueAtPath(parsedRoot, editingState.editTarget.parentPath || []);
        if (!parentValue || Array.isArray(parentValue) || typeof parentValue !== 'object') {
            showToast('数组索引不支持重命名', 'warning');
            restoreEditingStateRow(editingState);
            return;
        }

        if (Object.prototype.hasOwnProperty.call(parentValue, nextKey)) {
            showToast('Key 已存在', 'warning');
            restoreEditingStateRow(editingState);
            return;
        }

        const renamedParent = renameObjectKey(parentValue, currentKey, nextKey);
        if ((editingState.editTarget.parentPath || []).length === 0) {
            parsedRoot = renamedParent;
        } else {
            setValueAtPath(parsedRoot, editingState.editTarget.parentPath, renamedParent);
        }

        const saved = await setLocalStorageItem(editingState.editTarget.storageKey, JSON.stringify(parsedRoot));
        if (!saved) {
            restoreEditingStateRow(editingState);
            return;
        }

        showToast('Key 已更新', 'success');
        await refreshDirectEditState();
    }

    function renameObjectKey(parentValue, currentKey, nextKey) {
        const renamed = {};
        Object.keys(parentValue).forEach((key) => {
            if (key === currentKey) {
                renamed[nextKey] = parentValue[key];
            } else {
                renamed[key] = parentValue[key];
            }
        });
        return renamed;
    }

    function parseEditedValue(rawInput) {
        const trimmedInput = rawInput.trim();

        if (!looksLikeJsonInput(trimmedInput)) {
            return rawInput;
        }

        try {
            return JSON.parse(trimmedInput);
        } catch (e) {
            return rawInput;
        }
    }

    function looksLikeJsonInput(value) {
        if (!value) {
            return false;
        }

        if ((value.startsWith('{') && value.endsWith('}')) ||
            (value.startsWith('[') && value.endsWith(']')) ||
            (value.startsWith('"') && value.endsWith('"'))) {
            return true;
        }

        return value === 'null' ||
            value === 'true' ||
            value === 'false' ||
            !isNaN(value);
    }

    function areValuesEqual(left, right) {
        return JSON.stringify(left) === JSON.stringify(right);
    }

    function restoreEditingStateRow(editingState) {
        const row = editingState.row;
        const storageKey = editingState.editTarget ? editingState.editTarget.storageKey : null;

        currentEditing = createEmptyEditingState();

        if (!row || !row.parentNode || !storageKey) {
            return;
        }

        const entry = allEntries.find((item) => item.key === storageKey);
        if (entry) {
            row.parentNode.replaceChild(createEntryRow(entry), row);
        } else {
            row.remove();
        }
    }

    async function refreshDirectEditState() {
        currentEditing = createEmptyEditingState();
        lastDataHash = '';
        await loadLocalStorage(true);
    }

    function safeCancelCurrentEdit() {
        if (!currentEditing.isEditing) {
            return;
        }

        restoreEditingStateRow(currentEditing);
    }

    function cancelDirectEdit() {
        safeCancelCurrentEdit();
    }

    function updateEntryCount() {
        if (currentSearchTerm) {
            entryCount.textContent = `${filteredEntries.length} / ${allEntries.length} 项`;
        } else {
            entryCount.textContent = `${allEntries.length} 项`;
        }
    }

    // ============================================
    // Search - 搜索
    // ============================================
    searchInput.addEventListener('input', () => {
        currentSearchTerm = searchInput.value;
        if (currentSearchTerm) {
            searchBox.classList.add('has-value');
        } else {
            searchBox.classList.remove('has-value');
        }
        applyFilter();
    });

    clearSearch.addEventListener('click', () => {
        searchInput.value = '';
        currentSearchTerm = '';
        searchBox.classList.remove('has-value');
        searchInput.focus();
        applyFilter();
    });

    function highlightText(text, term) {
        if (!term) return escapeHtml(text);
        const lowerText = text.toLowerCase();
        const lowerTerm = term.toLowerCase();
        let result = '';
        let lastIndex = 0;
        let index = lowerText.indexOf(lowerTerm);

        while (index !== -1) {
            result += escapeHtml(text.substring(lastIndex, index));
            result += '<span class="search-highlight">' + escapeHtml(text.substring(index, index + term.length)) + '</span>';
            lastIndex = index + term.length;
            index = lowerText.indexOf(lowerTerm, lastIndex);
        }
        result += escapeHtml(text.substring(lastIndex));
        return result;
    }

    // ============================================
    // Add / Edit Modal - 新增/编辑模态框
    // ============================================
    function openAddModal() {
        editingKey = null;
        modalTitle.textContent = '新增条目';
        modalKey.value = '';
        modalValue.value = '';
        modalKey.disabled = false;
        updateValueTypeBadge('');
        showModal(modalOverlay);
        modalKey.focus();
    }

    function openEditModal(key, value) {
        editingKey = key;
        modalTitle.textContent = '编辑条目';
        modalKey.value = key;
        modalKey.disabled = true;

        // Try to format JSON for editing - 尝试格式化 JSON 以便编辑
        try {
            const parsed = JSON.parse(value);
            if (typeof parsed === 'object' && parsed !== null) {
                modalValue.value = JSON.stringify(parsed, null, 2);
            } else {
                modalValue.value = value;
            }
        } catch (e) {
            modalValue.value = value;
        }

        updateValueTypeBadge(modalValue.value);
        showModal(modalOverlay);
        modalValue.focus();
    }

    function updateValueTypeBadge(value) {
        const trimmed = value.trim();
        let type = 'string';

        if (trimmed === '') {
            type = 'string';
        } else if (trimmed === 'null') {
            type = 'null';
        } else if (trimmed === 'true' || trimmed === 'false') {
            type = 'boolean';
        } else if (!isNaN(trimmed) && trimmed !== '') {
            type = 'number';
        } else {
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) type = 'array';
                else if (typeof parsed === 'object' && parsed !== null) type = 'object';
            } catch (e) {
                type = 'string';
            }
        }

        valueTypeBadge.textContent = type;
        valueTypeBadge.className = 'value-type-badge type-' + type;
    }

    modalValue.addEventListener('input', () => {
        updateValueTypeBadge(modalValue.value);
    });

    async function saveEntry() {
        const key = modalKey.value.trim();
        const value = modalValue.value;

        if (!key) {
            showToast('Key 不能为空', 'warning');
            modalKey.focus();
            return;
        }

        // Check if key already exists when adding new - 新增时检查键是否已存在
        if (editingKey === null) {
            const exists = allEntries.find(e => e.key === key);
            if (exists) {
                showConfirm(
                    '覆盖确认',
                    `Key "${key}" 已存在，是否覆盖其值？`,
                    async () => {
                        await performSave(key, value);
                    }
                );
                return;
            }
        }

        await performSave(key, value);
    }

    async function performSave(key, value) {
        // If value looks like JSON, try to compact it for storage - 如果值看起来像 JSON，尝试压缩后存储
        let storeValue = value;
        try {
            const parsed = JSON.parse(value);
            if (typeof parsed === 'object' && parsed !== null) {
                storeValue = JSON.stringify(parsed);
            }
        } catch (e) {
            // Store as-is - 按原样存储
        }

        const success = await setLocalStorageItem(key, storeValue);
        if (success) {
            hideModal(modalOverlay);
            showToast(editingKey === null ? '已添加' : '已保存', 'success');
            lastDataHash = ''; // Force refresh - 强制刷新
            await loadLocalStorage(true);

            // Highlight the modified row - 高亮修改的行
            setTimeout(() => {
                const row = tableBody.querySelector(`.entry-row[data-key="${CSS.escape(key)}"]`);
                if (row) {
                    row.classList.add('highlight');
                    row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            }, 50);
        }
    }

    modalSave.addEventListener('click', saveEntry);
    modalCancel.addEventListener('click', () => hideModal(modalOverlay));
    modalClose.addEventListener('click', () => hideModal(modalOverlay));



    // Auto-format on input change - 输入时自动格式化
    const debouncedAutoFormat = debounce(autoFormatJSON, 1000);
    modalValue.addEventListener('input', () => {
        debouncedAutoFormat();
    });

    // Keyboard shortcuts in modal - 模态框中的键盘快捷键
    modalValue.addEventListener('keydown', (e) => {
        // Alt+S to save (only works inside modal) - Alt+S 保存（仅在模态框内有效）
        if (e.altKey && !e.ctrlKey && !e.shiftKey && e.key === 's') {
            e.preventDefault();
            console.log('Alt+S triggered in modalValue, modalOverlay.style.display:', modalOverlay.style.display);
            console.log('Alt+S triggered in modalValue, saving entry...');
            saveEntry();
        }

        // Tab key to indent - Tab 键缩进
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = modalValue.selectionStart;
            const end = modalValue.selectionEnd;
            if (e.shiftKey) {
                // Unindent - 取消缩进
                const lineStart = modalValue.value.lastIndexOf('\n', start - 1) + 1;
                const lineText = modalValue.value.substring(lineStart, start);
                if (lineText.startsWith('  ')) {
                    modalValue.value = modalValue.value.substring(0, lineStart) + modalValue.value.substring(lineStart + 2);
                    modalValue.selectionStart = modalValue.selectionEnd = start - 2;
                }
            } else {
                modalValue.value = modalValue.value.substring(0, start) + '  ' + modalValue.value.substring(end);
                modalValue.selectionStart = modalValue.selectionEnd = start + 2;
            }
        }
    });

    modalKey.addEventListener('keydown', (e) => {
        // Alt+S to save (only works inside modal) - Alt+S 保存（仅在模态框内有效）
        if (e.altKey && !e.ctrlKey && !e.shiftKey && e.key === 's') {
            e.preventDefault();
            console.log('Alt+S triggered in modalKey, saving entry...');
            saveEntry();
        }
        if (e.key === 'Enter') {
            e.preventDefault();
            modalValue.focus();
        }
    });

    // ============================================
    // Delete Entry - 删除条目
    // ============================================
    function deleteEntry(key) {
        showConfirm(
            '删除确认',
            `确定要删除 "${key}" 吗？此操作不可恢复。`,
            async () => {
                const success = await removeLocalStorageItem(key);
                if (success) {
                    showToast(`已删除 "${key}"`, 'success');
                    lastDataHash = '';
                    await loadLocalStorage(true);
                }
            }
        );
    }

    // ============================================
    // Clear All - 清空全部
    // ============================================
    $('#btnClearAll').addEventListener('click', () => {
        if (allEntries.length === 0) {
            showToast('localStorage 已经是空的', 'info');
            return;
        }
        showConfirm(
            '清空确认',
            `确定要清空所有 ${allEntries.length} 条 localStorage 数据吗？此操作不可恢复。`,
            async () => {
                const success = await clearAllLocalStorage();
                if (success) {
                    showToast('已清空所有数据', 'success');
                    lastDataHash = '';
                    await loadLocalStorage(true);
                }
            }
        );
    });

    // ============================================
    // Import / Export - 导入/导出
    // ============================================
    $('#btnExport').addEventListener('click', async () => {
        if (allEntries.length === 0) {
            showToast('没有数据可导出', 'warning');
            return;
        }

        const data = {};
        for (const entry of allEntries) {
            // Try to parse JSON values to export as objects - 尝试解析 JSON 值以便作为对象导出
            try {
                data[entry.key] = JSON.parse(entry.value);
            } catch (e) {
                data[entry.key] = entry.value;
            }
        }

        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        // Get the page hostname for filename - 获取页面主机名作为文件名
        let hostname = 'localstorage';
        try {
            hostname = await evalInPage('location.hostname');
        } catch (e) { }

        const a = document.createElement('a');
        a.href = url;
        a.download = `${hostname}_localStorage_${getTimestamp()}.json`;
        a.click();
        URL.revokeObjectURL(url);

        showToast(`已导出 ${allEntries.length} 条数据`, 'success');
    });

    $('#btnImport').addEventListener('click', () => {
        importTextarea.value = '';
        importFileInput.value = '';
        importDropZone.classList.remove('has-file');
        importDropZone.querySelector('p').innerHTML = '拖拽 JSON 文件到此处<br>或 <button class="btn-link" id="btnSelectFile">选择文件</button>';
        showModal(importModalOverlay);

        // Re-bind the select file button since innerHTML was reset - 由于 innerHTML 被重置，重新绑定选择文件按钮
        document.getElementById('btnSelectFile').addEventListener('click', () => importFileInput.click());
    });

    importCancel.addEventListener('click', () => hideModal(importModalOverlay));
    importModalClose.addEventListener('click', () => hideModal(importModalOverlay));

    // File selection - 文件选择
    btnSelectFile.addEventListener('click', () => importFileInput.click());

    importFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            readImportFile(file);
        }
    });

    // Drag and drop - 拖放
    importDropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        importDropZone.classList.add('drag-over');
    });
    importDropZone.addEventListener('dragleave', () => {
        importDropZone.classList.remove('drag-over');
    });
    importDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        importDropZone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) {
            readImportFile(file);
        }
    });

    function readImportFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            importTextarea.value = e.target.result;
            importDropZone.classList.add('has-file');
            importDropZone.querySelector('p').innerHTML = `已选择: <strong>${escapeHtml(file.name)}</strong> (${formatSize(file.size)})`;
        };
        reader.readAsText(file);
    }

    importConfirm.addEventListener('click', async () => {
        const text = importTextarea.value.trim();
        if (!text) {
            showToast('请选择文件或粘贴 JSON 内容', 'warning');
            return;
        }

        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            showToast('JSON 格式无效: ' + e.message, 'error');
            return;
        }

        if (typeof data !== 'object' || data === null || Array.isArray(data)) {
            showToast('JSON 内容必须是一个对象 (key-value 格式)', 'error');
            return;
        }

        const mode = document.querySelector('input[name="importMode"]:checked').value;
        const entries = Object.entries(data);

        if (mode === 'replace') {
            await clearAllLocalStorage();
        }

        let count = 0;
        for (const [key, value] of entries) {
            const strValue = typeof value === 'string' ? value : JSON.stringify(value);
            const success = await setLocalStorageItem(key, strValue);
            if (success) count++;
        }

        hideModal(importModalOverlay);
        showToast(`已导入 ${count} 条数据`, 'success');
        lastDataHash = '';
        await loadLocalStorage(true);
    });

    // ============================================
    // Clipboard - 剪贴板
    // ============================================
    function copyToClipboard(text) {
        // Try to format if JSON - 如果是 JSON 尝试格式化
        let copyText = text;
        try {
            const parsed = JSON.parse(text);
            if (typeof parsed === 'object' && parsed !== null) {
                copyText = JSON.stringify(parsed, null, 2);
            }
        } catch (e) { }

        navigator.clipboard.writeText(copyText).then(() => {
            showToast('已复制到剪贴板', 'success');
        }).catch(() => {
            // Fallback - 备用方案
            const textarea = document.createElement('textarea');
            textarea.value = copyText;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            showToast('已复制到剪贴板', 'success');
        });
    }

    // ============================================
    // Confirm Dialog - 确认对话框
    // ============================================
    function showConfirm(title, message, callback) {
        confirmTitle.textContent = title;
        confirmMessage.textContent = message;
        confirmCallback = callback;
        showModal(confirmOverlay);
    }

    confirmOk.addEventListener('click', () => {
        hideModal(confirmOverlay);
        if (confirmCallback) {
            confirmCallback();
            confirmCallback = null;
        }
    });
    confirmCancel.addEventListener('click', () => {
        hideModal(confirmOverlay);
        confirmCallback = null;
    });

    // ============================================
    // Modal Helpers - 模态框辅助函数
    // ============================================
    function showModal(overlay) {
        overlay.style.display = 'flex';
    }

    // Close on overlay click (bind once at init) - 点击遮罩层关闭 (在初始化时绑定一次)
    [modalOverlay, importModalOverlay, confirmOverlay].forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                hideModal(overlay);
                if (overlay === confirmOverlay) {
                    confirmCallback = null;
                }
            }
        });
    });

    function hideModal(overlay) {
        overlay.style.display = 'none';
    }

    // Close modals on Escape - 按 Escape 键关闭模态框
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (confirmOverlay.style.display !== 'none') {
                hideModal(confirmOverlay);
                confirmCallback = null;
            } else if (importModalOverlay.style.display !== 'none') {
                hideModal(importModalOverlay);
            } else if (modalOverlay.style.display !== 'none') {
                hideModal(modalOverlay);
            }
        }
    });

    // ============================================
    // Toast Notifications - 提示通知
    // ============================================
    function showToast(message, type = 'info') {
        const icons = {
            success: '<svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/><path d="M5 8l2 2 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
            error: '<svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/><path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
            warning: '<svg viewBox="0 0 16 16" fill="none"><path d="M8 1l7 13H1L8 1Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M8 6v3M8 11.5v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
            info: '<svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/><path d="M8 7v4M8 5v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>'
        };

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span>${escapeHtml(message)}</span>`;
        toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('toast-out');
            setTimeout(() => toast.remove(), 200);
        }, 2500);
    }

    // ============================================
    // Utility Functions - 工具函数
    // ============================================
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function getTimestamp() {
        const now = new Date();
        return now.getFullYear() +
            String(now.getMonth() + 1).padStart(2, '0') +
            String(now.getDate()).padStart(2, '0') + '_' +
            String(now.getHours()).padStart(2, '0') +
            String(now.getMinutes()).padStart(2, '0') +
            String(now.getSeconds()).padStart(2, '0');
    }

    function formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    // ============================================
    // Theme - 主题切换
    // ============================================
    function getSystemTheme() {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
            return 'light';
        }
        return 'dark';
    }

    function applyTheme(theme) {
        currentTheme = theme === 'light' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', currentTheme);
        updateThemeToggleButton();
    }

    function updateThemeToggleButton() {
        if (!btnThemeToggle) return;

        const textEl = btnThemeToggle.querySelector('.theme-text');
        if (currentTheme === 'dark') {
            if (textEl) textEl.textContent = '亮色';
            btnThemeToggle.title = '切换到亮色主题';
        } else {
            if (textEl) textEl.textContent = '暗色';
            btnThemeToggle.title = '切换到暗色主题';
        }
    }

    function toggleTheme() {
        const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
        applyTheme(nextTheme);
        try {
            localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
        } catch (e) { }
    }

    // ============================================
    // Global Keyboard Shortcuts (avoid browser conflicts) - 全局键盘快捷键 (避免浏览器冲突)
    // ============================================
    document.addEventListener('keydown', (e) => {
        // Only respond when not in a modal - 仅在不在模态框时响应
        const inModal = modalOverlay.style.display !== 'none' ||
            importModalOverlay.style.display !== 'none' ||
            confirmOverlay.style.display !== 'none';

        if (!inModal) {
            // Alt+N - Add new entry - Alt+N - 新增条目
            if (e.altKey && !e.ctrlKey && !e.shiftKey && e.key === 'n') {
                e.preventDefault();
                openAddModal();
            }
            // / - Focus search (when not typing in input/textarea) - / - 聚焦搜索 (不在输入框/文本框中输入时)
            if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
                e.preventDefault();
                searchInput.focus();
                searchInput.select();
            }
        }
    });

    // ============================================
    // Toolbar Button Bindings - 工具栏按钮绑定
    // ============================================
    $('#btnRefresh').addEventListener('click', () => {
        lastDataHash = '';
        loadLocalStorage(true);
        showToast('已刷新', 'info');
    });

    $('#btnAdd').addEventListener('click', openAddModal);
    $('#btnAddFirst').addEventListener('click', openAddModal);
    if (btnThemeToggle) {
        btnThemeToggle.addEventListener('click', toggleTheme);
    }

    // ============================================
    // Auto-refresh when panel becomes visible - 面板可见时自动刷新
    // ============================================
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            loadLocalStorage(true);
        }
    });

    // Listen for page navigation - 监听页面导航
    if (chrome.devtools && chrome.devtools.network) {
        chrome.devtools.network.onNavigated.addListener(() => {
            lastDataHash = ''; // Reset hash on navigation - 导航时重置哈希值
            setTimeout(() => loadLocalStorage(true), 300);
        });
    }

    // ============================================
    // Real-time monitoring (polling) - 实时监控 (轮询)
    // ============================================
    const btnLiveToggle = $('#btnLiveToggle');
    let pollInterval = null;

    // Load user preference - 加载用户偏好设置
    try {
        const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
        if (savedTheme === 'dark' || savedTheme === 'light') {
            currentTheme = savedTheme;
        } else {
            currentTheme = getSystemTheme();
        }
    } catch (e) {
        currentTheme = getSystemTheme();
    }

    try {
        const savedPref = localStorage.getItem(LIVE_ENABLED_STORAGE_KEY);
        if (savedPref !== null) {
            isLiveEnabled = savedPref === 'true';
        }
    } catch (e) { }

    function updateLiveToggleButton() {
        if (isLiveEnabled) {
            btnLiveToggle.classList.add('active');
            btnLiveToggle.querySelector('.live-text').textContent = '实时';
            btnLiveToggle.title = '实时监控已开启 - 点击关闭';
        } else {
            btnLiveToggle.classList.remove('active');
            btnLiveToggle.querySelector('.live-text').textContent = '已暂停';
            btnLiveToggle.title = '实时监控已关闭 - 点击开启';
        }
    }

    function startPolling() {
        if (pollInterval || !isLiveEnabled) return;
        pollInterval = setInterval(() => {
            loadLocalStorage(true);
        }, 500); // Check every 500ms - 每 500ms 检查一次
    }

    function stopPolling() {
        if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
        }
    }

    function toggleLive() {
        isLiveEnabled = !isLiveEnabled;
        try {
            localStorage.setItem(LIVE_ENABLED_STORAGE_KEY, isLiveEnabled.toString());
        } catch (e) { }
        updateLiveToggleButton();
        if (isLiveEnabled) {
            startPolling();
        } else {
            stopPolling();
        }
    }

    btnLiveToggle.addEventListener('click', toggleLive);

    // Stop polling when panel is hidden, resume when visible (if enabled) - 面板隐藏时停止轮询，面板可见时恢复 (如果已启用)
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stopPolling();
        } else if (isLiveEnabled) {
            startPolling();
        }
    });

    // ============================================
    // Initialize - 初始化
    // ============================================
    applyTheme(currentTheme);
    loadLocalStorage(true);
    updateLiveToggleButton();
    if (isLiveEnabled) {
        startPolling();
    }
})();
