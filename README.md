# FileTreeExplorer — Visual N-ary Tree File System Explorer

[![Language: C99](https://img.shields.io/badge/Language-C99-00599C?logo=c&logoColor=white)](fstree.c)
[![Backend: Node.js / Express](https://img.shields.io/badge/Backend-Node.js%20%2F%20Express-339933?logo=node.js&logoColor=white)](server.js)
[![Frontend: Vanilla JS / SVG](https://img.shields.io/badge/Frontend-Vanilla%20JS%20%26%20SVG-F7DF1E?logo=javascript&logoColor=black)](public/)
[![Build: Make](https://img.shields.io/badge/Build-Makefile-427819?logo=gnu-make&logoColor=white)](Makefile)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

An interactive, full-stack hierarchical file system explorer designed to demonstrate **N-ary Tree Data Structures** using the **First-Child / Next-Sibling (Left-Child Right-Sibling)** representation in C, connected via an Express bridge to a responsive web dashboard with dynamic SVG vector tree animations.

---

## 📑 Table of Contents

- [Overview](#-overview)
- [System Architecture](#-system-architecture)
- [Data Structure Deep Dive](#-data-structure-deep-dive)
  - [Memory Representation (First-Child / Next-Sibling)](#memory-representation-first-child--next-sibling)
  - [Node Structure](#node-structure)
  - [Algorithmic Complexity](#algorithmic-complexity)
- [Key Features](#-key-features)
- [Tree Traversals & Algorithms](#-tree-traversals--algorithms)
- [Persistence Format (`data.txt`)](#-persistence-format-datatxt)
- [Project Layout](#-project-layout)
- [Quick Start](#-quick-start)
  - [Prerequisites](#prerequisites)
  - [Installation & Build](#installation--build)
  - [Running the Web Application](#running-the-web-application)
  - [Running the Interactive Terminal CLI](#running-the-interactive-terminal-cli)
- [CLI Reference](#-cli-reference)
- [REST API Reference](#-rest-api-reference)
- [Makefile Reference](#-makefile-reference)
- [License](#-license)

---

## 🌟 Overview

Operating systems represent file systems hierarchically as directories containing files and subdirectories. Because a single directory can contain an arbitrary number of entries, standard binary trees are insufficient without wasting pointer memory or introducing arbitrary child limits.

**TreeFS** implements an **N-ary Tree** in pure C99 using the **First-Child / Next-Sibling** design pattern. It operates in two modes:
1. **Interactive CLI / Standalone Tool**: A terminal interface with formatted ASCII/Unicode branch trees, interactive prompts, and single-shot JSON output.
2. **Web Visualization Dashboard**: A web application powered by Node.js/Express, featuring real-time interactive SVG tree visualization, animated tree traversals (Preorder, Postorder, Level-Order), DFS search highlights, and folder storage analytics.

---

## 🏗️ System Architecture

The project is structured into three clean layers:

```
┌─────────────────────────────────────────────────────────────┐
│                    Web Browser (Frontend)                   │
│   • Expandable Sidebar Tree      • Dynamic SVG Vector Tree  │
│   • Step-by-Step Traversal Pulse • Animated DFS Search      │
│   • Postorder Storage Chart      • Context Menus & Modals   │
└──────────────────────────────▲──────────────────────────────┘
                               │ HTTP / JSON
┌──────────────────────────────▼──────────────────────────────┐
│                  Node.js + Express Bridge                   │
│   • Static File Server (`/public`)                          │
│   • REST Endpoints (`/api/*`)                               │
│   • Serialized Command Queue (Prevents disk race conditions)│
│   • Child Process Spawner (`child_process.execFile`)        │
└──────────────────────────────▲──────────────────────────────┘
                               │ CLI Invocation + JSON Stdout
┌──────────────────────────────▼──────────────────────────────┐
│                    C Engine (`fstree`)                      │
│   • N-ary Tree Operations (Insert, Delete, Rename, Move)    │
│   • First-Child / Next-Sibling Pointer Links                │
│   • Subtree Cycle Prevention (`isAncestor`)                 │
│   • Traversals (Preorder, Postorder, BFS Level-Order)       │
│   • Disk Persistence Engine (`data.txt`)                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔬 Data Structure Deep Dive

### Memory Representation (First-Child / Next-Sibling)

In an N-ary tree, each node can have an arbitrary number of children ($0 \dots k$). Instead of storing an unpredictable dynamic array or fixed-size array of child pointers, every node maintains exactly **three pointers**:
- `firstChild`: Points to the leftmost immediate child (NULL if file or empty folder).
- `nextSibling`: Points to the sibling directly to the right at the same level (NULL if last sibling).
- `parent`: Points back to the parent directory (NULL for `root`).

This representation transforms any arbitrary N-ary tree into a binary-tree-like memory layout while preserving exact hierarchy.

```
Conceptual N-ary Tree:
           root
         /   |   \
   Projects Notes Photos
     /   \     \       \
    DS   Web  todo.txt trip.jpg

Internal First-Child / Next-Sibling Pointer Layout:
   [root]
     │ (firstChild)
     ▼
   [Projects] ──────── (nextSibling) ──────► [Notes] ─────── (nextSibling) ──────► [Photos]
     │ (firstChild)                            │ (firstChild)                        │ (firstChild)
     ▼                                         ▼                                     ▼
   [DS] ─── (nextSibling) ──► [Web]          [todo.txt]                            [trip.jpg]
     │ (firstChild)             │ (firstChild)
     ▼                          ▼
   [main.py]                  [report.pdf]
```

### Node Structure

Defined in `fstree.c`:

```c
typedef struct Node {
    char name[50];              /* Entry name (up to 49 chars + null terminator) */
    int isFolder;               /* 1 = Directory, 0 = File                       */
    int size;                   /* File size in KB (0 for directories)            */
    struct Node *firstChild;    /* Pointer to leftmost child node                 */
    struct Node *nextSibling;   /* Pointer to adjacent sibling node               */
    struct Node *parent;        /* Pointer back to parent node                    */
} Node;
```

### Algorithmic Complexity

| Operation | Function in C | Time Complexity | Space Complexity | Description |
|:---|:---|:---:|:---:|:---|
| **Node Allocation** | `createNode()` | $\mathcal{O}(1)$ | $\mathcal{O}(1)$ | Heap allocates a `Node` and initialises pointers to `NULL`. |
| **Insert Entry** | `insertNode()` | $\mathcal{O}(k)$ | $\mathcal{O}(1)$ | Walks sibling list of parent ($k$ children) to check for duplicate names and appends to tail. |
| **Delete Subtree** | `deleteNode()` | $\mathcal{O}(n)$ | $\mathcal{O}(h)$ | Unlinks node from parent/sibling list, then recursively frees entire subtree in **postorder** ($h = \text{height}$). |
| **Rename Entry** | `renameNode()` | $\mathcal{O}(k)$ | $\mathcal{O}(1)$ | Validates name uniqueness among sibling nodes before updating string. |
| **Move Subtree** | `moveNode()` | $\mathcal{O}(d + k)$ | $\mathcal{O}(1)$ | Verifies target is a folder, checks `isAncestor()` to prevent circular containment cycles, validates sibling names, and rewires pointers. |
| **Path Lookup** | `findByPath()` | $\mathcal{O}(d \cdot k)$ | $\mathcal{O}(1)$ | Tokenizes `/` separated path (e.g. `root/Projects/DS`) and traverses down matching children. |
| **Search by Name** | `searchByName()` | $\mathcal{O}(n)$ | $\mathcal{O}(h)$ | Preorder DFS traversal finding all entries matching substring and capturing traversal trace. |
| **Subtree Size** | `totalSize()` | $\mathcal{O}(n)$ | $\mathcal{O}(h)$ | Recursive postorder aggregation: sums file sizes from bottom-up. |
| **Tree Height** | `treeHeight()` | $\mathcal{O}(n)$ | $\mathcal{O}(h)$ | Finds the longest path from the given node to any leaf. |
| **Preorder Traversal**| `preorder()` | $\mathcal{O}(n)$ | $\mathcal{O}(h)$ | Visits parent before children (Left $\rightarrow$ Right). |
| **Postorder Traversal**| `postorder()` | $\mathcal{O}(n)$ | $\mathcal{O}(h)$ | Visits all descendants before their parent. |
| **Level-Order (BFS)** | `levelOrder()` | $\mathcal{O}(n)$ | $\mathcal{O}(w)$ | Breadth-first traversal using an explicit FIFO queue ($w = \text{max width}$). |

---

## ⚡ Key Features

- **Robust C Engine**:
  - Memory safe: cleans up subtrees recursively using postorder traversal before freeing parents.
  - Cycle protection: moving a folder into its own subtree is caught and rejected by `isAncestor()`.
  - Collision protection: duplicate names within the same directory level are disallowed.
  - Root protection: deleting or relocating `root` is strictly prevented.
- **Dual Operating Modes**:
  - **Single-shot headless mode**: emits structured JSON responses directly to stdout for headless automation and web integration.
  - **Interactive CLI mode**: formatted menu with ASCII branch visualization (`printTreeVisual`).
- **Interactive Web Dashboard**:
  - Dynamic SVG tree rendering with auto-layout and curved cubic Bézier connectors.
  - Visual animation step playback for **Preorder**, **Postorder**, **Level-Order**, and **DFS Search**.
  - Dual-panel UI: traditional expandable file manager on the left + interactive tree graph on the right.
  - Right-click context menu (New Folder, New File, Rename, Move, Delete).
  - Breadcrumb navigation path with instant node selection.
  - Storage consumption visualization (breakdown bar chart for top-level folders).
- **Concurrency & State Safety**:
  - Express backend implements a **Promise serial request queue** to serialize execution of the C binary, preventing race conditions on `data.txt`.

---

## 🔄 Tree Traversals & Algorithms

### 1. Preorder Traversal (Root $\rightarrow$ Children)
Visits the current node first, then recursively traverses each child from left to right. Used for hierarchical listings, JSON serialization, and copying trees.
```
Preorder Visit Sequence:
root -> Projects -> DS -> main.py -> Web -> report.pdf -> Notes -> todo.txt -> Photos -> trip.jpg
```

### 2. Postorder Traversal (Children $\rightarrow$ Root)
Recursively visits all children of a node before visiting the node itself. Essential for:
- **`freeTree()`**: Deallocating children before their parent to prevent dangling pointers.
- **`totalSize()`**: Computing directory sizes by summing child file sizes bottom-up.
```
Postorder Visit Sequence:
main.py -> DS -> report.pdf -> Web -> Projects -> todo.txt -> Notes -> trip.jpg -> Photos -> root
```

### 3. Level-Order Traversal (Breadth-First Search)
Visits all nodes at depth $d$ before moving to depth $d+1$. Implemented with an explicit FIFO queue array.
```
Level-Order Visit Sequence:
Level 0: root
Level 1: Projects, Notes, Photos
Level 2: DS, Web, todo.txt, trip.jpg
Level 3: main.py, report.pdf
```

---

## 💾 Persistence Format (`data.txt`)

The file system state persists across executions using a compact depth-tagged format in `data.txt`:

```text
0 root 1 0
1 Projects 1 0
2 DS 1 0
3 main.py 0 15
2 Web 1 0
3 report.pdf 0 120
1 Notes 1 0
2 todo.txt 0 3
1 Photos 1 0
2 trip.jpg 0 1024
```

### Schema
Each line represents a single node:
```
<depth> <name> <isFolder (1|0)> <sizeInKB>
```

### Stack-Based Deserialization Algorithm
When reading `data.txt`:
1. Maintain an array `stack[depth]` of parent node pointers.
2. If `depth == 0`, node is initialized as `root`.
3. If `depth > 0`, the parent is immediately retrieved from `stack[depth - 1]`.
4. The node is attached as the child of `parent` (preserving original sibling order).
5. The stack pointer is updated: `stack[depth] = n`.

---

## 📁 Project Layout

```
FileTreeExplorer/
├── fstree.c            # Core C engine (data structures, algorithms, CLI, JSON output)
├── fstree              # Compiled executable binary (generated via Makefile)
├── Makefile            # Build automation (compile, clean, reset)
├── server.js           # Node.js Express server & serial child-process bridge
├── package.json        # Node.js project manifest & dependencies
├── data.txt            # Persistent tree storage state file
├── public/             # Modern web dashboard
│   ├── index.html      # Dashboard markup, toolbars, modal dialogs, and SVG canvas
│   ├── style.css       # Sleek dark-mode styling, animations, and responsive layout
│   └── app.js          # Client logic, SVG layout calculations, traversal animations
└── README.md           # Project documentation
```

---

## 🚀 Quick Start

### Prerequisites

Ensure you have the following installed on your machine:
- **GCC / Clang** (supporting C99 or later)
- **GNU Make**
- **Node.js** (v14+ recommended) and **npm**

### Installation & Build

1. Clone or navigate to the repository directory:
   ```bash
   cd FileTreeExplorer
   ```

2. Compile the C binary:
   ```bash
   make
   ```
   *(Compiles `fstree.c` into `./fstree` using `gcc -Wall -Wextra -std=c99`)*

3. Install Node.js dependencies:
   ```bash
   npm install
   ```

### Running the Web Application

Start the Express development server:
```bash
npm start
```
Open your browser and navigate to:
```
http://localhost:3000
```

### Running the Interactive Terminal CLI

Run the compiled binary directly without any command-line arguments:
```bash
./fstree
```

You will be greeted with the interactive terminal menu:
```text
╔══════════════════════════════════════════╗
║       FILE SYSTEM EXPLORER (N-ary Tree) ║
╠══════════════════════════════════════════╣
║  1. Show tree                           ║
║  2. Insert file/folder                  ║
║  3. Delete node                         ║
║  4. Rename node                         ║
║  5. Move node                           ║
║  6. Search by name                      ║
║  7. Preorder traversal                  ║
║  8. Postorder traversal                 ║
║  9. Level-order traversal               ║
║ 10. Statistics                          ║
║ 11. Reset to sample tree                ║
║  0. Exit                                ║
╚══════════════════════════════════════════╝
Choice: 
```

---

## 💻 CLI Reference

You can query or modify the file system directly from the terminal. All single-shot commands output clean, structured JSON to `stdout`:

```bash
# Display full tree JSON and statistics
./fstree tree

# Show file system statistics (count, height, storage)
./fstree stats

# Insert a new folder under root/Projects
./fstree insert "root/Projects" "AI" 1

# Insert a new file with size (in KB) under root/Projects/AI
./fstree insert "root/Projects/AI" "model.onnx" 0 4500

# Rename an existing node
./fstree rename "root/Projects/AI/model.onnx" "model_v2.onnx"

# Move a node to a different folder
./fstree move "root/Projects/AI" "root/Notes"

# Delete a file or directory subtree
./fstree delete "root/Notes/AI"

# Substring search with traversal path logging
./fstree search "main"

# Execute tree traversals
./fstree traverse preorder
./fstree traverse postorder
./fstree traverse levelorder

# Reset tree to default sample state
./fstree reset
```

---

## 🔌 REST API Reference

The Node.js server exposes REST endpoints that mirror the C engine commands:

| Method | Endpoint | Payload / Query | Description |
|:---|:---|:---|:---|
| `GET` | `/api/tree` | _None_ | Retrieves the full tree hierarchy in nested JSON format. |
| `GET` | `/api/stats` | _None_ | Returns tree metrics: folder count, file count, tree height, total storage, and per-folder sizes. |
| `POST` | `/api/insert` | `{ "parent": "root", "name": "Docs", "isFolder": true, "size": 0 }` | Inserts a file or folder under the specified parent. |
| `POST` | `/api/delete` | `{ "path": "root/Notes/todo.txt" }` | Deletes the node and all of its descendants. |
| `POST` | `/api/rename` | `{ "path": "root/Photos/trip.jpg", "newName": "vacation.jpg" }` | Renames an existing file or directory. |
| `POST` | `/api/move` | `{ "path": "root/Notes", "newParent": "root/Projects" }` | Relocates a subtree under a new parent directory. |
| `GET` | `/api/search` | `?q=report` | Searches the tree for names matching the query; returns matches and DFS visitation order. |
| `GET` | `/api/traverse` | `?type=preorder` (`preorder` \| `postorder` \| `levelorder`) | Executes specified traversal and returns node sequence. |
| `POST` | `/api/reset` | _None_ | Rebuilds the default sample tree structure. |

### Sample JSON Response
```json
{
  "ok": true,
  "tree": {
    "name": "root",
    "type": "folder",
    "size": 0,
    "path": "root",
    "children": [
      {
        "name": "Projects",
        "type": "folder",
        "size": 0,
        "path": "root/Projects",
        "children": [
          {
            "name": "DS",
            "type": "folder",
            "size": 0,
            "path": "root/Projects/DS",
            "children": [
              {
                "name": "main.py",
                "type": "file",
                "size": 15,
                "path": "root/Projects/DS/main.py",
                "children": []
              }
            ]
          }
        ]
      }
    ]
  },
  "stats": {
    "folders": 6,
    "files": 4,
    "height": 3,
    "totalSize": 1162,
    "folderSizes": [
      { "name": "Projects", "size": 135 },
      { "name": "Notes", "size": 3 },
      { "name": "Photos", "size": 1024 }
    ]
  }
}
```

---

## 🛠️ Makefile Reference

The repository includes a [Makefile](Makefile) with standard targets:

- `make` or `make all`: Compiles [fstree.c](fstree.c) into the executable binary `./fstree` with `-Wall -Wextra -std=c99`.
- `make clean`: Removes the compiled `fstree` executable and `data.txt`.
- `make reset`: Deletes `data.txt` so that the default sample tree is generated on the next run.

---

## 📄 License

This project is open-source and available under the [MIT License](LICENSE). Educational use for Data Structures and Systems Programming coursework is encouraged!
