/**
 * LocalStorage Inspector - DevTools Panel - LocalStorage Inspector DevTools 面板
 * A powerful localStorage viewer & editor for developers - 面向开发者的强大 localStorage 查看与编辑工具
 */

(function () {
    'use strict';
    const THEME_STORAGE_KEY = 'lsinspector_theme';
    const LIVE_ENABLED_STORAGE_KEY = 'lsinspector_live_enabled';
    const LANGUAGE_STORAGE_KEY = 'lsinspector_lang';

    // ============================================
    // DOM References - DOM 引用
    // ============================================
    const $ = (sel) => document.querySelector(sel);

    const searchInput = $('#searchInput');
    const clearSearch = $('#clearSearch');
    const entryCount = $('#entryCount');
    const tableBody = $('#tableBody');
    const emptyState = $('#emptyState');
    const noResultsState = $('#noResultsState');
    const searchBox = searchInput.parentElement;
    const btnLangToggle = $('#btnLangToggle');
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
    let activeLocale = 'en';
    let localeMessages = null;

    function isSupportedLocale(locale) {
        return locale === 'en' || locale === 'zh_CN';
    }

    function formatMessage(message, substitutions) {
        if (!message) {
            return '';
        }
        if (typeof substitutions === 'undefined') {
            return message;
        }
        const values = Array.isArray(substitutions) ? substitutions : [substitutions];
        return message.replace(/\$(\d+)/g, (full, indexText) => {
            const index = Number(indexText) - 1;
            return index >= 0 && index < values.length ? String(values[index]) : full;
        });
    }

    function getMessageFromLocaleMap(key, substitutions) {
        if (!localeMessages || !localeMessages[key] || typeof localeMessages[key].message !== 'string') {
            return '';
        }
        return formatMessage(localeMessages[key].message, substitutions);
    }

    async function loadLocaleMessages(locale) {
        const normalizedLocale = isSupportedLocale(locale) ? locale : 'en';
        try {
            const url = chrome.runtime.getURL(`_locales/${normalizedLocale}/messages.json`);
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            localeMessages = await response.json();
            activeLocale = normalizedLocale;
            return true;
        } catch (e) {
            console.warn('Failed to load locale messages:', normalizedLocale, e);
            localeMessages = null;
            return false;
        }
    }

    function setDocumentLanguageFromLocale(locale) {
        document.documentElement.lang = locale === 'zh_CN' ? 'zh-CN' : 'en';
    }

    function getSavedLocalePreference() {
        try {
            const savedLocale = localStorage.getItem(LANGUAGE_STORAGE_KEY);
            if (isSupportedLocale(savedLocale)) {
                return savedLocale;
            }
        } catch (e) { }
        return null;
    }

    function t(key, substitutions, fallback = '') {
        const mappedMessage = getMessageFromLocaleMap(key, substitutions);
        if (mappedMessage) {
            return mappedMessage;
        }

        const message = chrome.i18n && chrome.i18n.getMessage
            ? chrome.i18n.getMessage(key, substitutions)
            : '';
        if (message) {
            return message;
        }
        return fallback || key;
    }

    function applyI18n(root = document) {
        root.querySelectorAll('[data-i18n]').forEach((el) => {
            el.textContent = t(el.dataset.i18n, undefined, el.textContent || '');
        });
        root.querySelectorAll('[data-i18n-title]').forEach((el) => {
            el.title = t(el.dataset.i18nTitle, undefined, el.title || '');
        });
        root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
            el.placeholder = t(el.dataset.i18nPlaceholder, undefined, el.placeholder || '');
        });
        root.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
            el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel, undefined, el.getAttribute('aria-label') || ''));
        });
    }

    function updateModalTitleByState() {
        if (modalOverlay.style.display === 'none') {
            return;
        }
        modalTitle.textContent = editingKey === null ? t('modal_add_title') : t('modal_edit_title');
    }

    function updateLanguageToggleButton() {
        if (!btnLangToggle) {
            return;
        }

        const textEl = btnLangToggle.querySelector('.lang-text');
        if (activeLocale === 'zh_CN') {
            if (textEl) {
                textEl.textContent = t('lang_toggle_label_en');
            }
            btnLangToggle.title = t('lang_toggle_title_switch_to_en');
        } else {
            if (textEl) {
                textEl.textContent = t('lang_toggle_label_zh');
            }
            btnLangToggle.title = t('lang_toggle_title_switch_to_zh');
        }
    }

    function applyLocalizedUI() {
        applyI18n();
        updateModalTitleByState();
        renderImportDropZoneDefault();
        bindImportSelectFileButton();
        updateLanguageToggleButton();
        updateThemeToggleButton();
        updateLiveToggleButton();
        applyFilter();
    }

    async function setPanelLocale(locale, persist = true) {
        const normalizedLocale = isSupportedLocale(locale) ? locale : 'en';
        if (normalizedLocale !== activeLocale || !localeMessages) {
            await loadLocaleMessages(normalizedLocale);
        }

        setDocumentLanguageFromLocale(activeLocale);
        if (persist) {
            try {
                localStorage.setItem(LANGUAGE_STORAGE_KEY, activeLocale);
            } catch (e) { }
        }

        applyLocalizedUI();
    }

    async function toggleLanguage() {
        const nextLocale = activeLocale === 'zh_CN' ? 'en' : 'zh_CN';
        await setPanelLocale(nextLocale, true);
    }

    function bindImportSelectFileButton() {
        const selectFileButton = document.getElementById('btnSelectFile');
        if (!selectFileButton) {
            return;
        }
        selectFileButton.addEventListener('click', () => importFileInput.click());
    }

    function renderImportDropZoneDefault() {
        importDropZone.querySelector('p').innerHTML =
            `${escapeHtml(t('import_drop_zone_drag_here'))}<br>${escapeHtml(t('common_or'))} ` +
            `<button class="btn-link" id="btnSelectFile">${escapeHtml(t('import_select_file'))}</button>`;
    }

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
                showToast(t('toast_load_failed'), 'error');
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
            showToast(t('toast_save_failed', e.message), 'error');
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
            showToast(t('toast_remove_failed', e.message), 'error');
            return false;
        }
    }

    async function clearAllLocalStorage() {
        try {
            await evalInPage(`localStorage.clear()`);
            return true;
        } catch (e) {
            console.error('Failed to clear localStorage:', e);
            showToast(t('toast_clear_failed', e.message), 'error');
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
            t('action_copy_value'),
            () => copyToClipboard(entry.value)
        );

        // Edit button - 编辑按钮
        const btnEdit = createActionButton(
            '<svg viewBox="0 0 16 16" fill="none"><path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
            t('action_edit'),
            () => openEditModal(entry.key, entry.value)
        );

        // Delete button - 删除按钮
        const btnDelete = createActionButton(
            '<svg viewBox="0 0 16 16" fill="none"><path d="M2 4h12M5.33 4V2.67a1.33 1.33 0 0 1 1.34-1.34h2.66a1.33 1.33 0 0 1 1.34 1.34V4m2 0v9.33a1.33 1.33 0 0 1-1.34 1.34H4.67a1.33 1.33 0 0 1-1.34-1.34V4h9.34Z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
            t('action_delete'),
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
        const summaryText = count === 0
            ? ''
            : (isArray
                ? t('json_summary_items', String(count))
                : t('json_summary_properties', String(count)));
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
                showToast(t('toast_json_parse_edit_failed'), 'error');
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
            showToast(t('toast_key_required'), 'warning');
            restoreEditingStateRow(editingState);
            return;
        }

        if (nextKey === currentKey) {
            showToast(t('toast_key_unchanged'), 'info');
            restoreEditingStateRow(editingState);
            return;
        }

        const exists = allEntries.some((entry) => entry.key === nextKey && entry.key !== currentKey);
        if (exists) {
            showToast(t('toast_key_exists'), 'warning');
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

        showToast(t('toast_key_updated'), 'success');
        await refreshDirectEditState();
    }

    async function saveTopLevelValue(editingState, nextValue) {
        if (nextValue === editingState.originalEntryValue) {
            showToast(t('toast_value_unchanged'), 'info');
            restoreEditingStateRow(editingState);
            return;
        }

        const saved = await setLocalStorageItem(editingState.editTarget.storageKey, nextValue);
        if (!saved) {
            restoreEditingStateRow(editingState);
            return;
        }

        showToast(t('toast_value_updated'), 'success');
        await refreshDirectEditState();
    }

    async function saveNestedValue(editingState, rawInput) {
        let parsedRoot;

        try {
            parsedRoot = JSON.parse(editingState.originalEntryValue);
        } catch (e) {
            showToast(t('toast_json_parse_save_failed'), 'error');
            restoreEditingStateRow(editingState);
            return;
        }

        const nextValue = parseEditedValue(rawInput);
        if (areValuesEqual(nextValue, editingState.originalValue)) {
            showToast(t('toast_value_unchanged'), 'info');
            restoreEditingStateRow(editingState);
            return;
        }

        setValueAtPath(parsedRoot, editingState.editTarget.path, nextValue);

        const saved = await setLocalStorageItem(editingState.editTarget.storageKey, JSON.stringify(parsedRoot));
        if (!saved) {
            restoreEditingStateRow(editingState);
            return;
        }

        showToast(t('toast_value_updated'), 'success');
        await refreshDirectEditState();
    }

    async function saveNestedKey(editingState, nextKey) {
        const currentKey = editingState.editTarget.keyName;

        if (!nextKey) {
            showToast(t('toast_key_required'), 'warning');
            restoreEditingStateRow(editingState);
            return;
        }

        if (nextKey === currentKey) {
            showToast(t('toast_key_unchanged'), 'info');
            restoreEditingStateRow(editingState);
            return;
        }

        let parsedRoot;
        try {
            parsedRoot = JSON.parse(editingState.originalEntryValue);
        } catch (e) {
            showToast(t('toast_json_parse_save_failed'), 'error');
            restoreEditingStateRow(editingState);
            return;
        }

        const parentValue = getValueAtPath(parsedRoot, editingState.editTarget.parentPath || []);
        if (!parentValue || Array.isArray(parentValue) || typeof parentValue !== 'object') {
            showToast(t('toast_array_index_rename_unsupported'), 'warning');
            restoreEditingStateRow(editingState);
            return;
        }

        if (Object.prototype.hasOwnProperty.call(parentValue, nextKey)) {
            showToast(t('toast_key_exists'), 'warning');
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

        showToast(t('toast_key_updated'), 'success');
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
            entryCount.textContent = t(
                'panel_entry_count_filtered',
                [String(filteredEntries.length), String(allEntries.length)]
            );
        } else {
            entryCount.textContent = t('panel_entry_count_total', String(allEntries.length));
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
        modalTitle.textContent = t('modal_add_title');
        modalKey.value = '';
        modalValue.value = '';
        modalKey.disabled = false;
        updateValueTypeBadge('');
        showModal(modalOverlay);
        modalKey.focus();
    }

    function openEditModal(key, value) {
        editingKey = key;
        modalTitle.textContent = t('modal_edit_title');
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
            showToast(t('toast_key_required'), 'warning');
            modalKey.focus();
            return;
        }

        // Check if key already exists when adding new - 新增时检查键是否已存在
        if (editingKey === null) {
            const exists = allEntries.find(e => e.key === key);
            if (exists) {
                showConfirm(
                    t('confirm_overwrite_title'),
                    t('confirm_overwrite_message', key),
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
            showToast(editingKey === null ? t('toast_added') : t('toast_saved'), 'success');
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
            t('confirm_delete_title'),
            t('confirm_delete_message', key),
            async () => {
                const success = await removeLocalStorageItem(key);
                if (success) {
                    showToast(t('toast_deleted', key), 'success');
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
            showToast(t('toast_already_empty'), 'info');
            return;
        }
        showConfirm(
            t('confirm_clear_title'),
            t('confirm_clear_message', String(allEntries.length)),
            async () => {
                const success = await clearAllLocalStorage();
                if (success) {
                    showToast(t('toast_cleared_all'), 'success');
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
            showToast(t('toast_no_data_export'), 'warning');
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

        showToast(t('toast_exported', String(allEntries.length)), 'success');
    });

    $('#btnImport').addEventListener('click', () => {
        importTextarea.value = '';
        importFileInput.value = '';
        importDropZone.classList.remove('has-file');
        renderImportDropZoneDefault();
        showModal(importModalOverlay);

        // Re-bind the select file button since innerHTML was reset - 由于 innerHTML 被重置，重新绑定选择文件按钮
        bindImportSelectFileButton();
    });

    importCancel.addEventListener('click', () => hideModal(importModalOverlay));
    importModalClose.addEventListener('click', () => hideModal(importModalOverlay));

    // File selection - 文件选择
    bindImportSelectFileButton();

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
            importDropZone.querySelector('p').innerHTML = t(
                'import_selected_file_html',
                [`<strong>${escapeHtml(file.name)}</strong>`, formatSize(file.size)]
            );
        };
        reader.readAsText(file);
    }

    importConfirm.addEventListener('click', async () => {
        const text = importTextarea.value.trim();
        if (!text) {
            showToast(t('toast_select_file_or_paste_json'), 'warning');
            return;
        }

        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            showToast(t('toast_invalid_json', e.message), 'error');
            return;
        }

        if (typeof data !== 'object' || data === null || Array.isArray(data)) {
            showToast(t('toast_json_must_be_object'), 'error');
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
        showToast(t('toast_imported', String(count)), 'success');
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
            showToast(t('toast_copied'), 'success');
        }).catch(() => {
            // Fallback - 备用方案
            const textarea = document.createElement('textarea');
            textarea.value = copyText;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            showToast(t('toast_copied'), 'success');
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
            if (textEl) textEl.textContent = t('theme_label_light');
            btnThemeToggle.title = t('theme_switch_to_light');
        } else {
            if (textEl) textEl.textContent = t('theme_label_dark');
            btnThemeToggle.title = t('theme_switch_to_dark');
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
        showToast(t('toast_refreshed'), 'info');
    });

    $('#btnAdd').addEventListener('click', openAddModal);
    $('#btnAddFirst').addEventListener('click', openAddModal);
    if (btnLangToggle) {
        btnLangToggle.addEventListener('click', () => {
            toggleLanguage().catch((e) => {
                console.error('Failed to toggle language:', e);
            });
        });
    }
    if (btnThemeToggle) {
        btnThemeToggle.addEventListener('click', toggleTheme);
    }

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
            btnLiveToggle.querySelector('.live-text').textContent = t('live_status_live');
            btnLiveToggle.title = t('live_title_enabled_click_disable');
        } else {
            btnLiveToggle.classList.remove('active');
            btnLiveToggle.querySelector('.live-text').textContent = t('live_status_paused');
            btnLiveToggle.title = t('live_title_disabled_click_enable');
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

    // Refresh when the panel becomes visible and keep polling in sync with visibility.
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stopPolling();
            return;
        }

        loadLocalStorage(true);
        if (isLiveEnabled) {
            startPolling();
        }
    });

    // ============================================
    // Initialize - 初始化
    // ============================================
    async function initializePanel() {
        const savedLocale = getSavedLocalePreference();
        await setPanelLocale(savedLocale || 'en', false);
        applyTheme(currentTheme);
        await loadLocalStorage(true);
        if (isLiveEnabled) {
            startPolling();
        }
    }

    initializePanel().catch((e) => {
        console.error('Failed to initialize panel:', e);
    });
})();
