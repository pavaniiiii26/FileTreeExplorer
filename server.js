/*
 * server.js — Express server that bridges the browser UI to the C binary.
 *
 * Calls ./fstree <command> <args> via child_process.execFile with cwd set
 * to the project folder, serializes requests one at a time, logs stdout/stderr,
 * and passes the JSON response back to the frontend.
 */

const express = require('express');
const { execFile } = require('child_process');
const path = require('path');

const app  = express();
const PORT = 3000;
const BIN_NAME = process.platform === 'win32' ? 'fstree.exe' : 'fstree';
const BIN  = path.join(__dirname, BIN_NAME);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/* ── Serial Request Queue: process one C binary invocation at a time ── */
let requestQueue = Promise.resolve();

function callFstree(args) {
    return new Promise((resolve) => {
        execFile(BIN, args, { cwd: __dirname, timeout: 5000 }, (err, stdout, stderr) => {
            console.log(`[fstree ${args.join(' ')}] stdout:`, stdout ? stdout.trim() : '(empty)');
            if (stderr) {
                console.log(`[fstree ${args.join(' ')}] stderr:`, stderr.trim());
            }
            if (err) {
                console.log(`[fstree ${args.join(' ')}] err:`, err.message);
            }

            if (stdout) {
                try {
                    const parsed = JSON.parse(stdout);
                    return resolve(parsed);
                } catch (parseErr) {
                    console.log('[fstree] JSON parse error on stdout:', parseErr.message);
                }
            }

            const errorMsg = (stderr && stderr.trim()) || (err && err.message) || 'C process failed with no output';
            resolve({
                ok: false,
                error: errorMsg,
                stdout: stdout || '',
                stderr: stderr || ''
            });
        });
    });
}

function queueFstree(args) {
    const task = requestQueue.then(() => callFstree(args), () => callFstree(args));
    requestQueue = task;
    return task;
}

/* ── GET /api/tree ──────────────────────────────────────────────────── */
app.get('/api/tree', async (req, res) => {
    try {
        const data = await queueFstree(['tree']);
        res.json(data);
    } catch (e) {
        res.json({ ok: false, error: e.message || String(e) });
    }
});

/* ── GET /api/stats ─────────────────────────────────────────────────── */
app.get('/api/stats', async (req, res) => {
    try {
        const data = await queueFstree(['stats']);
        res.json(data);
    } catch (e) {
        res.json({ ok: false, error: e.message || String(e) });
    }
});

/* ── POST /api/insert ───────────────────────────────────────────────── */
app.post('/api/insert', async (req, res) => {
    const { parent, name, isFolder, size } = req.body;
    const args = ['insert', parent || 'root', name, String(isFolder ? 1 : 0)];
    if (!isFolder && size) args.push(String(size));
    try {
        const data = await queueFstree(args);
        res.json(data);
    } catch (e) {
        res.json({ ok: false, error: e.message || String(e) });
    }
});

/* ── POST /api/delete ───────────────────────────────────────────────── */
app.post('/api/delete', async (req, res) => {
    try {
        const data = await queueFstree(['delete', req.body.path]);
        res.json(data);
    } catch (e) {
        res.json({ ok: false, error: e.message || String(e) });
    }
});

/* ── POST /api/rename ───────────────────────────────────────────────── */
app.post('/api/rename', async (req, res) => {
    try {
        const data = await queueFstree(['rename', req.body.path, req.body.newName]);
        res.json(data);
    } catch (e) {
        res.json({ ok: false, error: e.message || String(e) });
    }
});

/* ── POST /api/move ─────────────────────────────────────────────────── */
app.post('/api/move', async (req, res) => {
    try {
        const data = await queueFstree(['move', req.body.path, req.body.newParent]);
        res.json(data);
    } catch (e) {
        res.json({ ok: false, error: e.message || String(e) });
    }
});

/* ── GET /api/search ────────────────────────────────────────────────── */
app.get('/api/search', async (req, res) => {
    const q = req.query.q || '';
    try {
        const data = await queueFstree(['search', q]);
        res.json(data);
    } catch (e) {
        res.json({ ok: false, error: e.message || String(e) });
    }
});

/* ── GET /api/traverse ──────────────────────────────────────────────── */
app.get('/api/traverse', async (req, res) => {
    const type = req.query.type || 'preorder';
    try {
        const data = await queueFstree(['traverse', type]);
        res.json(data);
    } catch (e) {
        res.json({ ok: false, error: e.message || String(e) });
    }
});

/* ── POST /api/reset ────────────────────────────────────────────────── */
app.post('/api/reset', async (req, res) => {
    try {
        const data = await queueFstree(['reset']);
        res.json(data);
    } catch (e) {
        res.json({ ok: false, error: e.message || String(e) });
    }
});

/* ── Start ──────────────────────────────────────────────────────────── */
app.listen(PORT, () => {
    console.log(`🌳 FileTree Explorer running at http://localhost:${PORT}`);
});

