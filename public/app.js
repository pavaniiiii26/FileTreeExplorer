/* ═══════════════════════════════════════════════════════════════════════════
   TreeFS — Frontend Application (app.js)
   Pure vanilla JS — interacts with Express server which runs the C binary.
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    /* ── DOM Elements ─────────────────────────────────────────────────── */
    const $  = (s, c) => (c || document).querySelector(s);
    const $$ = (s, c) => [...(c || document).querySelectorAll(s)];

    const fileTreeEl         = $('#fileTree');
    const breadcrumbEl       = $('#breadcrumb');
    const selectedDisplayEl  = $('#selectedNodeDisplay');
    const treeSvg            = $('#treeSvg');
    const searchInput        = $('#searchInput');
    const matchBadge         = $('#matchBadge');
    const contextMenu        = $('#contextMenu');
    const resetBtn           = $('#resetBtn');
    const btnDfsSearch       = $('#btnDfsSearch');

    /* Error Banner */
    const errorBanner        = $('#errorBanner');
    const errorBannerMsg     = $('#errorBannerMsg');
    const errorBannerClose   = $('#errorBannerClose');

    /* Top Action Buttons */
    const btnTopNewFolder    = $('#btnTopNewFolder');
    const btnTopNewFile      = $('#btnTopNewFile');
    const btnTopRename       = $('#btnTopRename');
    const btnTopMove         = $('#btnTopMove');
    const btnTopDelete       = $('#btnTopDelete');

    /* Dialog Elements */
    const dialogOverlay      = $('#dialogOverlay');
    const dialogTitle        = $('#dialogTitle');
    const dialogSub          = $('#dialogSub');
    const dialogFolderRow    = $('#dialogFolderRow');
    const dialogFolderLabel  = $('#dialogFolderLabel');
    const dialogFolderSelect = $('#dialogFolderSelect');
    const dialogInputRow     = $('#dialogInputRow');
    const dialogInputLabel   = $('#dialogInputLabel');
    const dialogInput        = $('#dialogInput');
    const dialogSizeRow      = $('#dialogSizeRow');
    const dialogSize         = $('#dialogSize');
    const dialogOk           = $('#dialogOk');
    const dialogCancel       = $('#dialogCancel');
    const toastContainer     = $('#toastContainer');

    /* Stats Elements */
    const statFoldersVal     = $('#statFoldersVal');
    const statFilesVal       = $('#statFilesVal');
    const statHeightVal      = $('#statHeightVal');
    const folderBarsEl       = $('#folderBars');

    /* ── State ────────────────────────────────────────────────────────── */
    let treeData       = null;    /* JSON tree returned by C program */
    let selectedPath   = 'root';  /* Default selection is always root */
    let searchMatches  = [];      /* Array of matching paths */
    let animating      = false;   /* Traversal animation flag */
    let dialogCallback = null;

    /* ═══════════════════ ERROR BANNER & TOASTS ═════════════════════════ */

    function showErrorBanner(message) {
        if (!message) return;
        errorBannerMsg.textContent = message;
        errorBanner.hidden = false;
        errorBanner.classList.add('open');
    }

    function hideErrorBanner() {
        errorBanner.hidden = true;
        errorBanner.classList.remove('open');
        errorBannerMsg.textContent = '';
    }

    errorBannerClose.addEventListener('click', hideErrorBanner);

    function showToast(msg, type) {
        type = type || 'info';
        const el = document.createElement('div');
        el.className = 'toast ' + type;
        el.textContent = msg;
        toastContainer.appendChild(el);
        setTimeout(() => {
            el.classList.add('fade-out');
            setTimeout(() => el.remove(), 250);
        }, 2800);
    }

    /* ═══════════════════ API CLIENT ════════════════════════════════════ */

    async function api(method, url, body) {
        try {
            const opts = { method, headers: { 'Content-Type': 'application/json' } };
            if (body) opts.body = JSON.stringify(body);
            const res = await fetch(url, opts);
            const data = await res.json();

            if (!data.ok) {
                const errMsg = data.error || 'Operation failed';
                console.error('[C Binary Error]', errMsg, { stdout: data.stdout, stderr: data.stderr });
                showErrorBanner(errMsg);
                showToast(errMsg, 'error');
                return null;
            }

            hideErrorBanner();
            return data;
        } catch (err) {
            console.error('[API Fetch Error]', err);
            const msg = err.message || 'Failed to communicate with server';
            showErrorBanner(msg);
            showToast(msg, 'error');
            return null;
        }
    }

    /* ═══════════════════ TREE HELPERS ═════════════════════════════════ */

    function findNode(rootNode, path) {
        if (!rootNode || !path) return null;
        if (rootNode.path === path) return rootNode;
        if (rootNode.children) {
            for (let i = 0; i < rootNode.children.length; i++) {
                const found = findNode(rootNode.children[i], path);
                if (found) return found;
            }
        }
        return null;
    }

    function getParentPath(path) {
        const parts = path.split('/');
        if (parts.length <= 1) return 'root';
        parts.pop();
        return parts.join('/');
    }

    function isDescendant(parentPath, childPath) {
        return childPath === parentPath || childPath.startsWith(parentPath + '/');
    }

    /* ═══════════════ FOLDER DROPDOWN POPULATION ════════════════════════ */

    /**
     * Recursively walks the tree and adds an <option> for every node with type "folder".
     * value = node.path, label = path indented by depth.
     * Pre-selects selectedPath, or "root" if not matched.
     */
    function populateFolderDropdown(selectEl, tree, targetSelectedPath, excludeSubtreePath) {
        if (!selectEl) return;
        selectEl.innerHTML = '';

        function walk(node, depth) {
            if (!node) return;
            const isFolder = node.type === 'folder' || node.isFolder === 1;
            if (isFolder) {
                if (excludeSubtreePath && isDescendant(excludeSubtreePath, node.path)) {
                    return; /* Skip node and all its descendants for Move target */
                }

                const opt = document.createElement('option');
                opt.value = node.path;
                const indent = '— '.repeat(depth);
                opt.textContent = `${indent}${node.name} (${node.path})`;
                if (node.path === targetSelectedPath) {
                    opt.selected = true;
                }
                selectEl.appendChild(opt);

                if (node.children && node.children.length > 0) {
                    for (let i = 0; i < node.children.length; i++) {
                        walk(node.children[i], depth + 1);
                    }
                }
            }
        }

        if (tree) {
            walk(tree, 0);
        }

        /* If targetSelectedPath was not selected, default to root or first option */
        if (!selectEl.value || selectEl.selectedIndex === -1) {
            selectEl.value = 'root';
        }
    }

    /* ═══════════════════ LOAD & RENDER DASHBOARD ═══════════════════════ */

    async function loadTree() {
        const data = await api('GET', '/api/tree');
        if (!data || !data.tree) return;
        applyTreeResponse(data);
    }

    function applyTreeResponse(data) {
        treeData = data.tree;
        updateStats(data.stats);

        /* Verify selected path exists; fallback to root */
        if (!findNode(treeData, selectedPath)) {
            selectedPath = 'root';
        }

        renderExplorer();
        renderSvgTree();
        selectNode(selectedPath);
    }

    /* ═══════════════════ EXPLORER PANEL ════════════════════════════════ */

    function renderExplorer() {
        fileTreeEl.innerHTML = '';
        if (!treeData) return;
        fileTreeEl.appendChild(buildExplorerNode(treeData, 0));
    }

    function buildExplorerNode(node, depth) {
        const wrapper = document.createElement('div');

        const row = document.createElement('div');
        row.className = 'tree-item';
        row.dataset.path = node.path;
        row.style.paddingLeft = (8 + depth * 14) + 'px';

        if (node.path === selectedPath) row.classList.add('selected');
        if (searchMatches.includes(node.path)) row.classList.add('search-match');

        /* Toggle Arrow */
        const arrow = document.createElement('span');
        arrow.className = 'toggle-arrow';
        if (node.type === 'folder' && node.children && node.children.length > 0) {
            arrow.textContent = '▶';
            arrow.classList.add('open');
        } else {
            arrow.classList.add('hidden');
        }
        row.appendChild(arrow);

        /* Icon */
        const icon = document.createElement('span');
        icon.className = 'node-icon';
        icon.textContent = node.type === 'folder' ? '📁' : '📄';
        row.appendChild(icon);

        /* Name */
        const name = document.createElement('span');
        name.className = 'node-name';
        name.textContent = node.name;
        row.appendChild(name);

        /* File Size Badge */
        if (node.type === 'file') {
            const sizeBadge = document.createElement('span');
            sizeBadge.className = 'node-size-badge';
            sizeBadge.textContent = node.size + ' KB';
            row.appendChild(sizeBadge);
        }

        /* Left click selects node and toggles folder */
        row.addEventListener('click', (e) => {
            e.stopPropagation();
            if (node.type === 'folder' && childContainer) {
                const collapsed = childContainer.classList.toggle('collapsed');
                arrow.classList.toggle('open', !collapsed);
            }
            selectNode(node.path);
        });

        /* Right click opens context menu */
        row.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            selectNode(node.path);
            showContextMenu(e.clientX, e.clientY, node);
        });

        wrapper.appendChild(row);

        /* Children container */
        let childContainer = null;
        if (node.type === 'folder' && node.children && node.children.length > 0) {
            childContainer = document.createElement('div');
            childContainer.className = 'tree-children';
            for (let i = 0; i < node.children.length; i++) {
                childContainer.appendChild(buildExplorerNode(node.children[i], depth + 1));
            }
            wrapper.appendChild(childContainer);
        }

        return wrapper;
    }

    function selectNode(path) {
        selectedPath = path || 'root';
        const node = findNode(treeData, selectedPath) || treeData;
        if (!node) return;

        /* Update explorer list highlight */
        $$('.tree-item.selected', fileTreeEl).forEach((el) => el.classList.remove('selected'));
        const el = $(`[data-path="${CSS.escape(selectedPath)}"]`, fileTreeEl);
        if (el) el.classList.add('selected');

        /* Update selected info indicator */
        const typeLabel = node.type === 'folder' ? 'Folder' : `File, ${node.size || 0} KB`;
        selectedDisplayEl.textContent = `${node.name} (${typeLabel})`;

        updateBreadcrumb();
        highlightSvgNode(selectedPath);
    }

    /* ═══════════════════ BREADCRUMB ════════════════════════════════════ */

    function updateBreadcrumb() {
        breadcrumbEl.innerHTML = '';
        const parts = selectedPath.split('/');
        let cumulative = '';

        for (let i = 0; i < parts.length; i++) {
            if (i > 0) {
                cumulative += '/';
                const sep = document.createElement('span');
                sep.className = 'crumb-sep';
                sep.textContent = '/';
                breadcrumbEl.appendChild(sep);
            }
            cumulative += parts[i];
            const crumb = document.createElement('span');
            crumb.className = 'crumb';
            crumb.textContent = parts[i];
            crumb.dataset.path = cumulative;

            const target = cumulative;
            crumb.addEventListener('click', () => selectNode(target));
            breadcrumbEl.appendChild(crumb);
        }
    }

    /* ═══════════════════ SVG TREE DIAGRAM ═════════════════════════════ */

    const NODE_W   = 115;
    const NODE_H   = 36;
    const H_GAP    = 22;
    const V_GAP    = 58;
    const PAD_TOP  = 24;
    const PAD_LEFT = 24;

    let nodePositions = {};

    function countLeaves(node) {
        if (!node.children || node.children.length === 0) return 1;
        let total = 0;
        for (let i = 0; i < node.children.length; i++) {
            total += countLeaves(node.children[i]);
        }
        return total;
    }

    function layoutTree(node, depth, xOffset) {
        if (!node.children || node.children.length === 0) {
            const x = xOffset * (NODE_W + H_GAP) + PAD_LEFT;
            const y = depth * (NODE_H + V_GAP) + PAD_TOP;
            nodePositions[node.path] = { x, y, node };
            return xOffset + 1;
        }

        let nextOffset = xOffset;
        for (let i = 0; i < node.children.length; i++) {
            nextOffset = layoutTree(node.children[i], depth + 1, nextOffset);
        }

        const firstChild = nodePositions[node.children[0].path];
        const lastChild  = nodePositions[node.children[node.children.length - 1].path];
        const cx = (firstChild.x + lastChild.x) / 2;
        const y  = depth * (NODE_H + V_GAP) + PAD_TOP;
        nodePositions[node.path] = { x: cx, y, node };

        return nextOffset;
    }

    function renderSvgTree(visitedList, matchPaths) {
        if (!treeData) return;
        treeSvg.innerHTML = '';
        nodePositions = {};
        layoutTree(treeData, 0, 0);

        let maxX = 0, maxY = 0;
        const paths = Object.keys(nodePositions);
        for (let i = 0; i < paths.length; i++) {
            const p = nodePositions[paths[i]];
            if (p.x + NODE_W > maxX) maxX = p.x + NODE_W;
            if (p.y + NODE_H > maxY) maxY = p.y + NODE_H;
        }

        const svgWidth = Math.max(maxX + PAD_LEFT, 600);
        const svgHeight = maxY + PAD_TOP + 30;

        treeSvg.setAttribute('width', svgWidth);
        treeSvg.setAttribute('height', svgHeight);
        treeSvg.setAttribute('viewBox', `0 0 ${svgWidth} ${svgHeight}`);

        /* Match paths set */
        const matchPathSet = {};
        if (matchPaths) {
            for (let m = 0; m < matchPaths.length; m++) {
                const seg = matchPaths[m].split('/');
                let cum = '';
                for (let s = 0; s < seg.length; s++) {
                    cum += (s > 0 ? '/' : '') + seg[s];
                    matchPathSet[cum] = true;
                }
            }
        }

        drawEdges(treeData, matchPathSet);
        drawNodes(treeData, visitedList || [], matchPathSet);
        highlightSvgNode(selectedPath);
    }

    function drawEdges(node, matchPathSet) {
        if (!node.children) return;
        const parentPos = nodePositions[node.path];
        if (!parentPos) return;

        for (let i = 0; i < node.children.length; i++) {
            const child = node.children[i];
            const childPos = nodePositions[child.path];
            if (!childPos) continue;

            const px = parentPos.x + NODE_W / 2;
            const py = parentPos.y + NODE_H;
            const cx = childPos.x + NODE_W / 2;
            const cy = childPos.y;
            const midY = (py + cy) / 2;

            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', `M${px},${py} C${px},${midY} ${cx},${midY} ${cx},${cy}`);
            path.setAttribute('class', 'tree-edge');
            path.dataset.from = node.path;
            path.dataset.to = child.path;

            if (matchPathSet[node.path] && matchPathSet[child.path]) {
                path.classList.add('highlight-amber');
            }

            treeSvg.appendChild(path);
            drawEdges(child, matchPathSet);
        }
    }

    function drawNodes(node, visitedList, matchPathSet) {
        const pos = nodePositions[node.path];
        if (!pos) return;

        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', 'tree-node-group');
        g.dataset.path = node.path;

        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', pos.x);
        rect.setAttribute('y', pos.y);
        rect.setAttribute('width', NODE_W);
        rect.setAttribute('height', NODE_H);
        rect.setAttribute('class', 'tree-node-rect' + (node.type === 'folder' ? ' folder' : ''));
        rect.dataset.path = node.path;

        if (matchPathSet && matchPathSet[node.path]) {
            rect.classList.add('highlight-amber');
        }

        g.appendChild(rect);

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', pos.x + NODE_W / 2);
        text.setAttribute('y', pos.y + NODE_H / 2);
        text.setAttribute('class', 'tree-node-text');

        const prefix = node.type === 'folder' ? '📁 ' : '📄 ';
        let rawName = prefix + node.name;
        if (rawName.length > 14) rawName = rawName.substring(0, 13) + '…';
        text.textContent = rawName;
        g.appendChild(text);

        g.addEventListener('click', () => selectNode(node.path));

        g.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            selectNode(node.path);
            showContextMenu(e.clientX, e.clientY, node);
        });

        treeSvg.appendChild(g);

        if (node.children) {
            for (let i = 0; i < node.children.length; i++) {
                drawNodes(node.children[i], visitedList, matchPathSet);
            }
        }
    }

    function highlightSvgNode(path) {
        $$('.tree-node-rect.selected-node', treeSvg).forEach((r) => {
            r.classList.remove('selected-node');
        });
        const rect = $(`rect[data-path="${CSS.escape(path)}"]`, treeSvg);
        if (rect) {
            rect.classList.add('selected-node');
        }
    }

    /* ═══════════════════ ACTIONS & DIALOGS ═════════════════════════════ */

    function getActiveTargetFolder() {
        const node = findNode(treeData, selectedPath);
        if (!node) return 'root';
        if (node.type === 'folder') return node.path;
        return getParentPath(node.path);
    }

    function closeModal() {
        dialogOverlay.hidden = true;
        dialogOverlay.classList.remove('open');
        dialogCallback = null;
    }

    function openModal({ title, subtitle, showFolder, folderLabel, showInput, inputLabel, defaultVal, showSize, excludeSubtreePath, onOk }) {
        dialogTitle.textContent = title;
        dialogSub.textContent = subtitle || '';

        /* Folder Select */
        dialogFolderRow.hidden = !showFolder;
        if (showFolder) {
            dialogFolderLabel.textContent = folderLabel || 'Target Folder:';
            const defaultFolder = getActiveTargetFolder();
            populateFolderDropdown(dialogFolderSelect, treeData, defaultFolder, excludeSubtreePath);
        }

        /* Name Input */
        dialogInputRow.hidden = !showInput;
        if (showInput) {
            dialogInputLabel.textContent = inputLabel || 'Name:';
            dialogInput.value = defaultVal || '';
        }

        /* Size Field — explicitly hidden for folders */
        dialogSizeRow.hidden = !showSize;
        if (showSize) {
            dialogSize.value = '10';
        }

        dialogOverlay.hidden = false;
        dialogOverlay.classList.add('open');

        if (showInput) {
            setTimeout(() => {
                dialogInput.focus();
                dialogInput.select();
            }, 50);
        }

        dialogCallback = () => {
            if (showInput) {
                const val = dialogInput.value.trim();
                if (!val) return;
                if (val.includes('/') || val.includes(' ')) {
                    showToast('Name cannot contain spaces or slashes', 'error');
                    return;
                }
            }
            closeModal();
            if (onOk) onOk();
        };
    }

    dialogOk.addEventListener('click', () => { if (dialogCallback) dialogCallback(); });
    dialogCancel.addEventListener('click', closeModal);
    dialogInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && dialogCallback) dialogCallback();
        if (e.key === 'Escape') closeModal();
    });
    dialogOverlay.addEventListener('click', (e) => {
        if (e.target === dialogOverlay) closeModal();
    });

    /* ── Action: New Folder ─────────────────────────────────────────── */
    function promptNewFolder() {
        openModal({
            title: 'New Folder',
            subtitle: 'Create a new directory',
            showFolder: true,
            folderLabel: 'Create inside folder:',
            showInput: true,
            inputLabel: 'Folder Name:',
            defaultVal: '',
            showSize: false, /* Explicitly hide size for folders */
            onOk: async () => {
                const parent = dialogFolderSelect.value || 'root';
                const name = dialogInput.value.trim();
                const data = await api('POST', '/api/insert', {
                    parent: parent,
                    name: name,
                    isFolder: 1
                });
                if (data) {
                    applyTreeResponse(data);
                    selectNode(`${parent === 'root' ? 'root' : parent}/${name}`);
                    showToast(`Folder "${name}" created`, 'success');
                }
            }
        });
    }

    /* ── Action: New File ───────────────────────────────────────────── */
    function promptNewFile() {
        openModal({
            title: 'New File',
            subtitle: 'Create a new file with size',
            showFolder: true,
            folderLabel: 'Create inside folder:',
            showInput: true,
            showSize: true, /* Show size for files */
            inputLabel: 'File Name:',
            defaultVal: '',
            onOk: async () => {
                const parent = dialogFolderSelect.value || 'root';
                const name = dialogInput.value.trim();
                const size = parseInt(dialogSize.value, 10) || 10;
                const data = await api('POST', '/api/insert', {
                    parent: parent,
                    name: name,
                    isFolder: 0,
                    size: size
                });
                if (data) {
                    applyTreeResponse(data);
                    selectNode(`${parent === 'root' ? 'root' : parent}/${name}`);
                    showToast(`File "${name}" (${size} KB) created`, 'success');
                }
            }
        });
    }

    /* ── Action: Rename ─────────────────────────────────────────────── */
    function promptRename() {
        if (selectedPath === 'root') {
            showErrorBanner('Cannot rename the root directory.');
            showToast('Cannot rename root directory', 'error');
            return;
        }
        const node = findNode(treeData, selectedPath);
        if (!node) return;

        openModal({
            title: `Rename ${node.type === 'folder' ? 'Folder' : 'File'}`,
            subtitle: `Current Path: ${node.path}`,
            showFolder: false,
            showInput: true,
            inputLabel: 'New Name:',
            defaultVal: node.name,
            showSize: false,
            onOk: async () => {
                const newName = dialogInput.value.trim();
                if (newName === node.name) return;
                const data = await api('POST', '/api/rename', {
                    path: node.path,
                    newName: newName
                });
                if (data) {
                    const parent = getParentPath(node.path);
                    const newPath = `${parent === 'root' ? 'root' : parent}/${newName}`;
                    selectedPath = newPath;
                    applyTreeResponse(data);
                    showToast(`Renamed to "${newName}"`, 'success');
                }
            }
        });
    }

    /* ── Action: Move ───────────────────────────────────────────────── */
    function promptMove() {
        if (selectedPath === 'root') {
            showErrorBanner('Cannot move the root directory.');
            showToast('Cannot move root directory', 'error');
            return;
        }
        const node = findNode(treeData, selectedPath);
        if (!node) return;

        openModal({
            title: `Move ${node.type === 'folder' ? 'Folder' : 'File'}`,
            subtitle: `Select destination for "${node.name}"`,
            showFolder: true,
            folderLabel: 'Destination Folder:',
            showInput: false,
            showSize: false,
            excludeSubtreePath: node.type === 'folder' ? node.path : null,
            onOk: async () => {
                const newParent = dialogFolderSelect.value;
                if (!newParent) return;
                const data = await api('POST', '/api/move', {
                    path: node.path,
                    newParent: newParent
                });
                if (data) {
                    selectedPath = `${newParent === 'root' ? 'root' : newParent}/${node.name}`;
                    applyTreeResponse(data);
                    showToast(`Moved "${node.name}" to ${newParent}`, 'success');
                }
            }
        });
    }

    /* ── Action: Delete ─────────────────────────────────────────────── */
    async function promptDelete() {
        if (selectedPath === 'root') {
            showErrorBanner('Cannot delete the root directory.');
            showToast('Cannot delete root directory', 'error');
            return;
        }
        const node = findNode(treeData, selectedPath);
        if (!node) return;

        const confirmMsg = node.type === 'folder'
            ? `Delete folder "${node.name}" and all its contents?`
            : `Delete file "${node.name}"?`;

        if (!confirm(confirmMsg)) return;

        const data = await api('POST', '/api/delete', { path: node.path });
        if (data) {
            selectedPath = 'root';
            applyTreeResponse(data);
            showToast(`Deleted "${node.name}"`, 'success');
        }
    }

    /* Top bar buttons click bindings */
    btnTopNewFolder.addEventListener('click', promptNewFolder);
    btnTopNewFile.addEventListener('click', promptNewFile);
    btnTopRename.addEventListener('click', promptRename);
    btnTopMove.addEventListener('click', promptMove);
    btnTopDelete.addEventListener('click', promptDelete);

    /* ═══════════════════ CONTEXT MENU ════════════════════════════════ */

    let ctxTarget = null;

    function showContextMenu(x, y, node) {
        ctxTarget = node;
        contextMenu.hidden = false;
        contextMenu.style.left = Math.min(x, window.innerWidth - 200) + 'px';
        contextMenu.style.top  = Math.min(y, window.innerHeight - 220) + 'px';

        const newFolderBtn = $('[data-action="newFolder"]', contextMenu);
        const newFileBtn   = $('[data-action="newFile"]', contextMenu);
        if (node.type === 'file') {
            newFolderBtn.style.display = 'none';
            newFileBtn.style.display   = 'none';
        } else {
            newFolderBtn.style.display = '';
            newFileBtn.style.display   = '';
        }
    }

    document.addEventListener('click', () => { contextMenu.hidden = true; });

    $$('.ctx-item', contextMenu).forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            contextMenu.hidden = true;
            const action = btn.dataset.action;
            if (!ctxTarget) return;

            if (action === 'newFolder') promptNewFolder();
            else if (action === 'newFile') promptNewFile();
            else if (action === 'rename') promptRename();
            else if (action === 'move') promptMove();
            else if (action === 'delete') promptDelete();
        });
    });

    /* ═══════════════════ SEARCH ══════════════════════════════════════ */

    let searchTimeout = null;
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        const q = searchInput.value.trim();
        if (!q) {
            searchMatches = [];
            matchBadge.hidden = true;
            renderExplorer();
            renderSvgTree();
            return;
        }
        searchTimeout = setTimeout(() => doSearch(q), 250);
    });

    async function doSearch(query) {
        const data = await api('GET', '/api/search?q=' + encodeURIComponent(query));
        if (!data) return;
        searchMatches = data.matches || [];
        matchBadge.hidden = searchMatches.length === 0;
        matchBadge.textContent = `${searchMatches.length} match${searchMatches.length === 1 ? '' : 'es'}`;
        treeData = data.tree;
        renderExplorer();
        renderSvgTree(data.visited, data.matches);
    }

    btnDfsSearch.addEventListener('click', () => {
        const q = searchInput.value.trim();
        if (!q) {
            showToast('Type a search query first', 'info');
            searchInput.focus();
            return;
        }
        doSearchAnimated(q);
    });

    async function doSearchAnimated(query) {
        const data = await api('GET', '/api/search?q=' + encodeURIComponent(query));
        if (!data) return;
        searchMatches = data.matches || [];
        matchBadge.hidden = searchMatches.length === 0;
        matchBadge.textContent = `${searchMatches.length} match${searchMatches.length === 1 ? '' : 'es'}`;
        treeData = data.tree;
        renderExplorer();
        renderSvgTree();
        animateTraversal(data.visited, data.matches);
    }

    /* ═══════════════════ TRAVERSALS ═══════════════════════════════════ */

    $$('.btn-trav[data-type]').forEach((btn) => {
        btn.addEventListener('click', () => {
            if (animating) return;
            const type = btn.dataset.type;
            doTraversal(type);
        });
    });

    async function doTraversal(type) {
        const data = await api('GET', '/api/traverse?type=' + type);
        if (!data) return;
        treeData = data.tree;
        renderSvgTree();
        animateTraversal(data.visited, []);
    }

    function animateTraversal(visited, matchPaths) {
        if (!visited || visited.length === 0) return;
        animating = true;

        const nameToPath = {};
        function mapNames(node) {
            if (!nameToPath[node.name]) nameToPath[node.name] = [];
            nameToPath[node.name].push(node.path);
            if (node.children) {
                for (let i = 0; i < node.children.length; i++) {
                    mapNames(node.children[i]);
                }
            }
        }
        if (treeData) mapNames(treeData);

        const nameCounters = {};
        let delay = 0;
        const STEP = 320;

        for (let i = 0; i < visited.length; i++) {
            ((idx) => {
                setTimeout(() => {
                    const vName = visited[idx];
                    if (!nameCounters[vName]) nameCounters[vName] = 0;
                    const candidates = nameToPath[vName] || [];
                    const path = candidates[nameCounters[vName]] || candidates[0];
                    nameCounters[vName]++;

                    if (path) {
                        const rect = $(`rect[data-path="${CSS.escape(path)}"]`, treeSvg);
                        if (rect) {
                            $$('.tree-node-rect.visiting', treeSvg).forEach((r) => {
                                r.classList.remove('visiting');
                                r.classList.add('visited');
                            });
                            rect.classList.add('visiting');
                        }
                    }

                    if (idx === visited.length - 1) {
                        setTimeout(() => {
                            $$('.tree-node-rect.visiting', treeSvg).forEach((r) => {
                                r.classList.remove('visiting');
                                r.classList.add('visited');
                            });

                            if (matchPaths && matchPaths.length > 0) {
                                for (let m = 0; m < matchPaths.length; m++) {
                                    const mRect = $(`rect[data-path="${CSS.escape(matchPaths[m])}"]`, treeSvg);
                                    if (mRect) {
                                        mRect.classList.remove('visited');
                                        mRect.classList.add('highlight-amber');
                                    }
                                }
                            }

                            animating = false;
                        }, STEP);
                    }
                }, delay);
                delay += STEP;
            })(i);
        }
    }

    /* ═══════════════════ STATS & CHARTS ═══════════════════════════════ */

    function updateStats(stats) {
        if (!stats) return;
        animateNumber(statFoldersVal, stats.folders);
        animateNumber(statFilesVal, stats.files);
        animateNumber(statHeightVal, stats.height);

        folderBarsEl.innerHTML = '';
        const sizes = stats.folderSizes || [];
        let maxSize = 0;
        for (let s of sizes) {
            if (s.size > maxSize) maxSize = s.size;
        }

        const barColors = ['bar-indigo', 'bar-amber', 'bar-teal', 'bar-rose'];
        for (let j = 0; j < sizes.length; j++) {
            const pct = maxSize > 0 ? (sizes[j].size / maxSize * 100) : 0;
            const sizeStr = sizes[j].size >= 1024
                ? (sizes[j].size / 1024).toFixed(1) + ' MB'
                : sizes[j].size + ' KB';

            const row = document.createElement('div');
            row.className = 'folder-bar-row';
            row.innerHTML =
                `<div class="folder-bar-label"><span>${sizes[j].name}</span><span>${sizeStr}</span></div>` +
                `<div class="folder-bar-track"><div class="folder-bar-fill ${barColors[j % barColors.length]}" style="width:0%"></div></div>`;
            folderBarsEl.appendChild(row);

            setTimeout(() => {
                const fill = $('.folder-bar-fill', row);
                if (fill) fill.style.width = pct + '%';
            }, 50);
        }
    }

    function animateNumber(el, target) {
        const current = parseInt(el.textContent, 10) || 0;
        if (current === target) { el.textContent = target; return; }
        const diff = target - current;
        const steps = Math.min(Math.abs(diff), 20);
        const stepSize = diff / steps;
        let i = 0;
        const interval = setInterval(() => {
            i++;
            if (i >= steps) {
                el.textContent = target;
                clearInterval(interval);
            } else {
                el.textContent = Math.round(current + stepSize * i);
            }
        }, 25);
    }

    /* ═══════════════════ RESET ════════════════════════════════════════ */

    resetBtn.addEventListener('click', async () => {
        if (!confirm('Reset tree to default sample state?')) return;
        const data = await api('POST', '/api/reset');
        if (data) {
            selectedPath = 'root';
            searchMatches = [];
            searchInput.value = '';
            matchBadge.hidden = true;
            hideErrorBanner();
            applyTreeResponse(data);
            showToast('Tree reset to sample data', 'success');
        }
    });

    /* ═══════════════════ INITIALIZATION ═══════════════════════════════ */

    loadTree();

})();
