/*
 * ============================================================================
 * FILE SYSTEM EXPLORER — N-ary Tree (First-Child / Next-Sibling)
 * ============================================================================
 * Course  : Data Structures
 * Purpose : Demonstrate an N-ary tree by modelling a simple file system.
 *
 * REPRESENTATION
 *   Every node has THREE pointers:
 *     firstChild   → its leftmost child
 *     nextSibling  → the next node at the same level
 *     parent       → back-pointer to its parent
 *
 *   This turns an arbitrary N-ary tree into a binary-tree-like structure
 *   that is easy to traverse with standard algorithms.
 *
 * PERSISTENCE
 *   The tree is saved to / loaded from  data.txt  in a simple
 *   parenthesized text format so that state survives between runs.
 *
 * BUILD
 *   gcc -o fstree fstree.c -Wall
 *
 * USAGE
 *   ./fstree                          (interactive menu)
 *   ./fstree <command> [args...]      (single-shot, prints JSON to stdout)
 * ============================================================================
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* ─────────────────────────── DATA STRUCTURE ────────────────────────────── */

/*
 * Node — one entry (file or folder) in the tree.
 *
 * Fields:
 *   name        – up to 49 characters
 *   isFolder    – 1 = folder, 0 = file
 *   size        – size in KB (meaningful only for files; 0 for folders)
 *   firstChild  – pointer to leftmost child  (NULL if none / if file)
 *   nextSibling – pointer to next sibling     (NULL if last)
 *   parent      – pointer back to parent      (NULL for root)
 */
typedef struct Node {
  char name[50];
  int isFolder;
  int size;
  struct Node *firstChild;
  struct Node *nextSibling;
  struct Node *parent;
} Node;

/* ──────────────────────── GLOBAL VARIABLES ─────────────────────────────── */

#define MAX_VISITED 500      /* max nodes we record for traversal animations */
#define MAX_MATCHES 100      /* max search matches */
#define DATA_FILE "data.txt" /* persistence file */

Node *root = NULL; /* root of the whole tree */

/* Buffers used by search / traversal to collect results */
char visited[MAX_VISITED][50];
int visitedCount = 0;
char matches[MAX_MATCHES][200]; /* "path" strings */
int matchCount = 0;

/* ────────────────────── 1. createNode ──────────────────────────────────── */
/*
 * PURPOSE   : Allocate and initialise a new Node.
 * APPROACH  : malloc + set every field; all pointers start as NULL.
 * COMPLEXITY: O(1)
 */
Node *createNode(const char *name, int isFolder, int size) {
  Node *n = (Node *)malloc(sizeof(Node));
  if (!n) {
    return NULL;
  }

  strncpy(n->name, name, 49);
  n->name[49] = '\0'; /* safety-terminate */
  n->isFolder = isFolder;
  n->size = isFolder ? 0 : size; /* folders always 0 */
  n->firstChild = NULL;
  n->nextSibling = NULL;
  n->parent = NULL;
  return n;
}

/* ────────────────────── 2. insertNode ──────────────────────────────────── */
/*
 * PURPOSE   : Add a new child (file or folder) under the given parent.
 * APPROACH  : Walk the sibling list of parent->firstChild to:
 *             (a) check for duplicate names  → reject
 *             (b) find the end of the list   → append
 *             If parent is a file, reject (files cannot have children).
 * COMPLEXITY: O(k) where k = number of existing children of parent
 */
int insertNode(Node *parent, const char *name, int isFolder, int size) {
  if (!parent)
    return -1;
  if (!parent->isFolder)
    return -2; /* can't insert under a file */

  /* Check for duplicate name among siblings */
  Node *cur = parent->firstChild;
  while (cur) {
    if (strcmp(cur->name, name) == 0)
      return -3; /* duplicate */
    cur = cur->nextSibling;
  }

  /* Create and attach */
  Node *newNode = createNode(name, isFolder, size);
  if (!newNode)
    return -4;
  newNode->parent = parent;

  /* Append at the END of the sibling list (preserves insertion order) */
  if (!parent->firstChild) {
    parent->firstChild = newNode;
  } else {
    cur = parent->firstChild;
    while (cur->nextSibling) {
      cur = cur->nextSibling;
    }
    cur->nextSibling = newNode;
  }
  return 0;
}

/* ────────────────────── 3. deleteNode ──────────────────────────────────── */
/*
 * PURPOSE   : Remove a node (and its entire subtree) from the tree.
 * APPROACH  : 1) Detach the node from its parent's child list.
 *             2) Recursively free every node in the subtree using
 *                POSTORDER (children before parent) — this is necessary
 *                so we don't lose pointers before freeing children.
 * COMPLEXITY: O(n) where n = number of nodes in the subtree
 *
 * NOTE: You may NOT delete the root node.
 */

/* Helper: recursively free a subtree (postorder) */
void freeTree(Node *node) {
  if (!node)
    return;
  freeTree(node->firstChild);
  freeTree(node->nextSibling);
  free(node);
}

int deleteNode(Node *node) {
  if (!node)
    return -1;
  if (!node->parent)
    return -2; /* can't delete root */

  /* Detach from parent's child list */
  Node *parent = node->parent;
  if (parent->firstChild == node) {
    /* node is the first child → parent skips to next sibling */
    parent->firstChild = node->nextSibling;
  } else {
    /* walk siblings until we find the one pointing to node */
    Node *prev = parent->firstChild;
    while (prev && prev->nextSibling != node) {
      prev = prev->nextSibling;
    }
    if (prev) {
      prev->nextSibling = node->nextSibling;
    }
  }

  /* Isolate and free the subtree */
  node->nextSibling = NULL; /* so freeTree doesn't free siblings */
  freeTree(node);
  return 0;
}

/* ────────────────────── 4. renameNode ──────────────────────────────────── */
/*
 * PURPOSE   : Change the name of an existing node.
 * APPROACH  : First check that no sibling already has the new name
 *             (to avoid duplicates), then copy.
 * COMPLEXITY: O(k) where k = number of siblings
 */
int renameNode(Node *node, const char *newName) {
  if (!node)
    return -1;
  if (!node->parent) {
    /* Renaming root is allowed (no sibling check needed) */
    strncpy(node->name, newName, 49);
    node->name[49] = '\0';
    return 0;
  }

  /* Check siblings for duplicate */
  Node *sib = node->parent->firstChild;
  while (sib) {
    if (sib != node && strcmp(sib->name, newName) == 0) {
      return -2; /* name conflict */
    }
    sib = sib->nextSibling;
  }

  strncpy(node->name, newName, 49);
  node->name[49] = '\0';
  return 0;
}

/* ────────────────────── 5. moveNode ───────────────────────────────────── */
/*
 * PURPOSE   : Move a node (with its subtree) to a new parent folder.
 * APPROACH  : 1) Verify newParent is a folder.
 *             2) Verify newParent is NOT inside node's own subtree
 *                (walk up from newParent; if we hit node, it's invalid).
 *             3) Check for name conflict among newParent's children.
 *             4) Detach node from old parent, attach under newParent.
 * COMPLEXITY: O(d + k) where d = depth and k = children of new parent
 */

/* Helper: is 'ancestor' an ancestor of 'node' (or the same node)? */
int isAncestor(Node *ancestor, Node *node) {
  Node *cur = node;
  while (cur) {
    if (cur == ancestor)
      return 1;
    cur = cur->parent;
  }
  return 0;
}

int moveNode(Node *node, Node *newParent) {
  if (!node || !newParent)
    return -1;
  if (!node->parent)
    return -2; /* can't move root */
  if (!newParent->isFolder)
    return -3; /* target must be folder */
  if (isAncestor(node, newParent))
    return -4; /* can't move into self */
  if (node->parent == newParent)
    return 0; /* already there */

  /* Check for duplicate name in newParent's children */
  Node *sib = newParent->firstChild;
  while (sib) {
    if (strcmp(sib->name, node->name) == 0)
      return -5;
    sib = sib->nextSibling;
  }

  /* Detach from old parent */
  Node *oldParent = node->parent;
  if (oldParent->firstChild == node) {
    oldParent->firstChild = node->nextSibling;
  } else {
    Node *prev = oldParent->firstChild;
    while (prev && prev->nextSibling != node) {
      prev = prev->nextSibling;
    }
    if (prev)
      prev->nextSibling = node->nextSibling;
  }

  /* Attach to newParent (append at end) */
  node->nextSibling = NULL;
  node->parent = newParent;
  if (!newParent->firstChild) {
    newParent->firstChild = node;
  } else {
    Node *last = newParent->firstChild;
    while (last->nextSibling) {
      last = last->nextSibling;
    }
    last->nextSibling = node;
  }
  return 0;
}

/* ────────────────────── 6. findByPath ─────────────────────────────────── */
/*
 * PURPOSE   : Given a slash-separated path like "root/Projects/DS",
 *             return the matching Node pointer (or NULL).
 * APPROACH  : Tokenise the path by '/', walk down from root matching
 *             each component against the children's names.
 * COMPLEXITY: O(d * k) where d = depth and k = avg children per level
 */
Node *findByPath(Node *rootNode, const char *path) {
  if (!rootNode || !path)
    return NULL;

  /* Make a mutable copy of the path */
  char buf[512];
  strncpy(buf, path, 511);
  buf[511] = '\0';

  /* First token should match root's name */
  char *tok = strtok(buf, "/");
  if (!tok || strcmp(tok, rootNode->name) != 0)
    return NULL;

  Node *cur = rootNode;
  while ((tok = strtok(NULL, "/")) != NULL) {
    /* Search among cur's children */
    Node *child = cur->firstChild;
    int found = 0;
    while (child) {
      if (strcmp(child->name, tok) == 0) {
        cur = child;
        found = 1;
        break;
      }
      child = child->nextSibling;
    }
    if (!found)
      return NULL;
  }
  return cur;
}

/* ────────────────────── 7. searchByName ────────────────────────────────── */
/*
 * PURPOSE   : Find all nodes whose name contains the query (substring).
 * APPROACH  : DFS (preorder) through the entire tree.  Record every
 *             visited node (for animation) and every match.
 * COMPLEXITY: O(n) where n = total nodes in the tree
 */

/* Helper: build the full path from root to a node */
void getPath(Node *node, char *out, int maxLen) {
  if (!node) {
    out[0] = '\0';
    return;
  }

  /* Collect ancestors in a temporary array */
  char parts[20][50];
  int depth = 0;
  Node *cur = node;
  while (cur && depth < 20) {
    strncpy(parts[depth], cur->name, 49);
    parts[depth][49] = '\0';
    depth++;
    cur = cur->parent;
  }

  /* Build path in forward order */
  out[0] = '\0';
  int i;
  for (i = depth - 1; i >= 0; i--) {
    if (i < depth - 1)
      strncat(out, "/", maxLen - strlen(out) - 1);
    strncat(out, parts[i], maxLen - strlen(out) - 1);
  }
}

void searchByNameHelper(Node *node, const char *query) {
  if (!node)
    return;

  /* Record this node as visited */
  if (visitedCount < MAX_VISITED) {
    strncpy(visited[visitedCount], node->name, 49);
    visited[visitedCount][49] = '\0';
    visitedCount++;
  }

  /* Check if name contains the query (case-insensitive substring) */
  if (strstr(node->name, query) != NULL) {
    if (matchCount < MAX_MATCHES) {
      getPath(node, matches[matchCount], 199);
      matchCount++;
    }
  }

  /* Recurse: first child, then siblings */
  searchByNameHelper(node->firstChild, query);
  searchByNameHelper(node->nextSibling, query);
}

void searchByName(Node *rootNode, const char *query) {
  visitedCount = 0;
  matchCount = 0;
  searchByNameHelper(rootNode, query);
}

/* ────────────────────── 8. totalSize ───────────────────────────────────── */
/*
 * PURPOSE   : Compute the total size of a folder (sum of all file sizes
 *             in its entire subtree).
 * APPROACH  : POSTORDER traversal — compute children's sizes first, then
 *             add the current node's own size.
 * COMPLEXITY: O(n) where n = nodes in subtree
 */
int totalSize(Node *node) {
  if (!node)
    return 0;

  int sum = node->size; /* own size (0 for folders) */
  Node *child = node->firstChild;
  while (child) {
    sum += totalSize(child); /* add each child's total */
    child = child->nextSibling;
  }
  return sum;
}

/* ────────────────────── 9. countFolders / countFiles ───────────────────── */
/*
 * PURPOSE   : Count folders (or files) in the subtree rooted at node.
 * APPROACH  : Simple preorder DFS counting.
 * COMPLEXITY: O(n)
 */
int countFolders(Node *node) {
  if (!node)
    return 0;
  int c = node->isFolder ? 1 : 0;
  Node *child = node->firstChild;
  while (child) {
    c += countFolders(child);
    child = child->nextSibling;
  }
  return c;
}

int countFiles(Node *node) {
  if (!node)
    return 0;
  int c = node->isFolder ? 0 : 1;
  Node *child = node->firstChild;
  while (child) {
    c += countFiles(child);
    child = child->nextSibling;
  }
  return c;
}

/* ────────────────────── 10. treeHeight ─────────────────────────────────── */
/*
 * PURPOSE   : Compute the height of the tree (longest root-to-leaf path).
 * APPROACH  : For each child, compute its height; take the max and add 1.
 *             A leaf has height 0, an empty tree has height -1.
 * COMPLEXITY: O(n)
 */
int treeHeight(Node *node) {
  if (!node)
    return -1;

  int maxH = -1;
  Node *child = node->firstChild;
  while (child) {
    int h = treeHeight(child);
    if (h > maxH)
      maxH = h;
    child = child->nextSibling;
  }
  return maxH + 1;
}

/* ────────────────────── 11. preorder ──────────────────────────────────── */
/*
 * PURPOSE   : Visit every node in PREORDER (parent → children left-to-right).
 * APPROACH  : Visit current, then recursively visit each child.
 * COMPLEXITY: O(n)
 */
void preorder(Node *node) {
  if (!node)
    return;

  if (visitedCount < MAX_VISITED) {
    strncpy(visited[visitedCount], node->name, 49);
    visited[visitedCount][49] = '\0';
    visitedCount++;
  }

  Node *child = node->firstChild;
  while (child) {
    preorder(child);
    child = child->nextSibling;
  }
}

/* ────────────────────── 12. postorder ─────────────────────────────────── */
/*
 * PURPOSE   : Visit every node in POSTORDER (children → parent).
 * APPROACH  : Recursively visit each child first, then visit current.
 * COMPLEXITY: O(n)
 */
void postorder(Node *node) {
  if (!node)
    return;

  Node *child = node->firstChild;
  while (child) {
    postorder(child);
    child = child->nextSibling;
  }

  if (visitedCount < MAX_VISITED) {
    strncpy(visited[visitedCount], node->name, 49);
    visited[visitedCount][49] = '\0';
    visitedCount++;
  }
}

/* ────────────────────── 13. levelOrder ─────────────────────────────────── */
/*
 * PURPOSE   : Visit every node level by level (breadth-first).
 * APPROACH  : Use a simple array as a QUEUE.
 *               front = dequeue index,  rear = enqueue index
 *             Enqueue root, then repeatedly: dequeue → visit → enqueue
 * children. COMPLEXITY: O(n)
 */
void levelOrder(Node *rootNode) {
  if (!rootNode)
    return;

  /* Simple array queue (enough for our demo tree) */
  Node *queue[500];
  int front = 0, rear = 0;

  queue[rear++] = rootNode;

  while (front < rear) {
    Node *cur = queue[front++];

    if (visitedCount < MAX_VISITED) {
      strncpy(visited[visitedCount], cur->name, 49);
      visited[visitedCount][49] = '\0';
      visitedCount++;
    }

    /* Enqueue all children */
    Node *child = cur->firstChild;
    while (child && rear < 500) {
      queue[rear++] = child;
      child = child->nextSibling;
    }
  }
}

/* ═══════════════════════ PERSISTENCE (save / load) ═════════════════════ */

/*
 * FORMAT (data.txt):
 *   Each node on one line:   DEPTH NAME IS_FOLDER SIZE
 *   Depth determines parent-child relationships when re-loading.
 *
 *   Example:
 *     0 root 1 0
 *     1 Projects 1 0
 *     2 DS 1 0
 *     3 main.py 0 15
 */

void saveNodeRec(FILE *fp, Node *node, int depth) {
  if (!node)
    return;
  fprintf(fp, "%d %s %d %d\n", depth, node->name, node->isFolder, node->size);
  saveNodeRec(fp, node->firstChild, depth + 1);
  saveNodeRec(fp, node->nextSibling, depth);
}

void saveTree(void) {
  FILE *fp = fopen(DATA_FILE, "w");
  if (!fp)
    return;
  saveNodeRec(fp, root, 0);
  fclose(fp);
}

void loadTree(void) {
  FILE *fp = fopen(DATA_FILE, "r");
  if (!fp)
    return;

  /* We use a stack (array) of parent pointers indexed by depth */
  Node *stack[100];
  int i;
  for (i = 0; i < 100; i++)
    stack[i] = NULL;

  char line[256];
  while (fgets(line, sizeof(line), fp)) {
    int depth, isFolder, size;
    char name[50];

    if (sscanf(line, "%d %49s %d %d", &depth, name, &isFolder, &size) != 4)
      continue;

    Node *n = createNode(name, isFolder, size);
    if (!n)
      continue;

    if (depth == 0) {
      /* This is the root */
      root = n;
      stack[0] = n;
    } else {
      /* Parent is whatever is stored at depth-1 */
      Node *parent = stack[depth - 1];
      if (!parent) {
        free(n);
        continue;
      }

      n->parent = parent;

      /* Append as last child of parent */
      if (!parent->firstChild) {
        parent->firstChild = n;
      } else {
        Node *last = parent->firstChild;
        while (last->nextSibling)
          last = last->nextSibling;
        last->nextSibling = n;
      }
    }
    stack[depth] = n;
  }
  fclose(fp);
}

/* ═══════════════════════ SAMPLE TREE BUILDER ═══════════════════════════ */

/*
 * Creates the default sample tree:
 *   root
 *   ├── Projects
 *   │   ├── DS
 *   │   │   ├── main.py     (15 KB)
 *   │   │   └── report.pdf  (120 KB)
 *   │   └── Web
 *   ├── Notes
 *   │   └── todo.txt        (3 KB)
 *   └── Photos
 *       └── trip.jpg        (1024 KB)
 */
void buildSampleTree(void) {
  root = createNode("root", 1, 0);

  insertNode(root, "Projects", 1, 0);
  insertNode(root, "Notes", 1, 0);
  insertNode(root, "Photos", 1, 0);

  Node *projects = findByPath(root, "root/Projects");
  insertNode(projects, "DS", 1, 0);
  insertNode(projects, "Web", 1, 0);

  Node *ds = findByPath(root, "root/Projects/DS");
  insertNode(ds, "main.py", 0, 15);
  insertNode(ds, "report.pdf", 0, 120);

  Node *notes = findByPath(root, "root/Notes");
  insertNode(notes, "todo.txt", 0, 3);

  Node *photos = findByPath(root, "root/Photos");
  insertNode(photos, "trip.jpg", 0, 1024);

  saveTree();
}

/* ═══════════════════════ JSON OUTPUT HELPERS ═══════════════════════════ */

/* Escape a string for JSON (handle special characters) */
void printJsonString(const char *s) {
  printf("\"");
  while (*s) {
    if (*s == '"')
      printf("\\\"");
    else if (*s == '\\')
      printf("\\\\");
    else if (*s == '\n')
      printf("\\n");
    else if (*s == '\t')
      printf("\\t");
    else
      putchar(*s);
    s++;
  }
  printf("\"");
}

/* Print a single node and its children as nested JSON */
void printTreeJson(Node *node) {
  if (!node)
    return;

  printf("{");
  printf("\"name\":");
  printJsonString(node->name);
  printf(",\"type\":\"%s\"", node->isFolder ? "folder" : "file");
  printf(",\"size\":%d", node->size);

  /* Build path */
  char pathBuf[512];
  getPath(node, pathBuf, 511);
  printf(",\"path\":");
  printJsonString(pathBuf);

  printf(",\"children\":[");
  Node *child = node->firstChild;
  int first = 1;
  while (child) {
    if (!first)
      printf(",");
    printTreeJson(child);
    first = 0;
    child = child->nextSibling;
  }
  printf("]}");
}

/* Print full JSON response */
void printResponse(int ok, const char *error) {
  printf("{\"ok\":%s", ok ? "true" : "false");

  if (!ok && error) {
    printf(",\"error\":");
    printJsonString(error);
  }

  /* Always include tree */
  if (root) {
    printf(",\"tree\":");
    printTreeJson(root);
  }

  /* visited array (for traversal / search animations) */
  printf(",\"visited\":[");
  int i;
  for (i = 0; i < visitedCount; i++) {
    if (i > 0)
      printf(",");
    printJsonString(visited[i]);
  }
  printf("]");

  /* matches array (for search results) */
  printf(",\"matches\":[");
  for (i = 0; i < matchCount; i++) {
    if (i > 0)
      printf(",");
    printJsonString(matches[i]);
  }
  printf("]");

  /* stats */
  printf(",\"stats\":{");
  printf("\"folders\":%d", countFolders(root));
  printf(",\"files\":%d", countFiles(root));
  printf(",\"height\":%d", treeHeight(root));
  printf(",\"totalSize\":%d", totalSize(root));

  /* Per-folder sizes (for bar chart) */
  printf(",\"folderSizes\":[");
  /* We collect top-level folders' total sizes */
  if (root) {
    Node *child = root->firstChild;
    int firstF = 1;
    while (child) {
      if (child->isFolder) {
        if (!firstF)
          printf(",");
        printf("{\"name\":");
        printJsonString(child->name);
        printf(",\"size\":%d}", totalSize(child));
        firstF = 0;
      }
      child = child->nextSibling;
    }
  }
  printf("]");

  printf("}"); /* end stats */
  printf("}\n");
}

/* ═══════════════════════ COMMAND-LINE INTERFACE ═══════════════════════ */

/*
 * Commands:
 *   insert  <parentPath> <name> <isFolder> [size]
 *   delete  <path>
 *   rename  <path> <newName>
 *   move    <path> <newParentPath>
 *   search  <query>
 *   traverse <preorder|postorder|levelorder>
 *   stats
 *   tree
 *   reset
 */
void handleCommand(int argc, char *argv[]) {
  /* Load existing tree */
  loadTree();
  if (!root) {
    buildSampleTree();
  }

  const char *cmd = argv[1];

  /* ── tree ─────────────────────────────────────────────────── */
  if (strcmp(cmd, "tree") == 0) {
    printResponse(1, NULL);
    return;
  }

  /* ── reset ────────────────────────────────────────────────── */
  if (strcmp(cmd, "reset") == 0) {
    if (root) {
      freeTree(root);
      root = NULL;
    }
    buildSampleTree();
    printResponse(1, NULL);
    return;
  }

  /* ── stats ────────────────────────────────────────────────── */
  if (strcmp(cmd, "stats") == 0) {
    printResponse(1, NULL);
    return;
  }

  /* ── insert <parentPath> <name> <isFolder> [size] ─────── */
  if (strcmp(cmd, "insert") == 0) {
    if (argc < 5) {
      printResponse(0, "Usage: insert <parentPath> <name> <isFolder> [size]");
      return;
    }
    Node *parent = findByPath(root, argv[2]);
    if (!parent) {
      printResponse(0, "Parent path not found");
      return;
    }

    int isFolder = atoi(argv[4]);
    int size = (argc > 5) ? atoi(argv[5]) : 0;

    int rc = insertNode(parent, argv[3], isFolder, size);
    if (rc == -2) {
      printResponse(0, "Cannot insert under a file");
      return;
    }
    if (rc == -3) {
      printResponse(0, "Duplicate name in this folder");
      return;
    }
    if (rc != 0) {
      printResponse(0, "Insert failed");
      return;
    }

    saveTree();
    printResponse(1, NULL);
    return;
  }

  /* ── delete <path> ─────────────────────────────────────── */
  if (strcmp(cmd, "delete") == 0) {
    if (argc < 3) {
      printResponse(0, "Usage: delete <path>");
      return;
    }
    Node *target = findByPath(root, argv[2]);
    if (!target) {
      printResponse(0, "Path not found");
      return;
    }
    if (target == root) {
      printResponse(0, "Cannot delete root node");
      return;
    }

    int rc = deleteNode(target);
    if (rc != 0) {
      printResponse(0, "Delete failed");
      return;
    }

    saveTree();
    printResponse(1, NULL);
    return;
  }

  /* ── rename <path> <newName> ───────────────────────────── */
  if (strcmp(cmd, "rename") == 0) {
    if (argc < 4) {
      printResponse(0, "Usage: rename <path> <newName>");
      return;
    }
    Node *target = findByPath(root, argv[2]);
    if (!target) {
      printResponse(0, "Path not found");
      return;
    }

    int rc = renameNode(target, argv[3]);
    if (rc == -2) {
      printResponse(0, "Name already exists among siblings");
      return;
    }
    if (rc != 0) {
      printResponse(0, "Rename failed");
      return;
    }

    saveTree();
    printResponse(1, NULL);
    return;
  }

  /* ── move <path> <newParentPath> ───────────────────────── */
  if (strcmp(cmd, "move") == 0) {
    if (argc < 4) {
      printResponse(0, "Usage: move <path> <newParentPath>");
      return;
    }
    Node *target = findByPath(root, argv[2]);
    Node *newParent = findByPath(root, argv[3]);
    if (!target) {
      printResponse(0, "Source path not found");
      return;
    }
    if (!newParent) {
      printResponse(0, "Destination path not found");
      return;
    }

    int rc = moveNode(target, newParent);
    if (rc == -2) {
      printResponse(0, "Cannot move root");
      return;
    }
    if (rc == -3) {
      printResponse(0, "Destination is not a folder");
      return;
    }
    if (rc == -4) {
      printResponse(0, "Cannot move a folder into itself");
      return;
    }
    if (rc == -5) {
      printResponse(0, "Name conflict in destination folder");
      return;
    }
    if (rc != 0) {
      printResponse(0, "Move failed");
      return;
    }

    saveTree();
    printResponse(1, NULL);
    return;
  }

  /* ── search <query> ────────────────────────────────────── */
  if (strcmp(cmd, "search") == 0) {
    if (argc < 3) {
      printResponse(0, "Usage: search <query>");
      return;
    }
    searchByName(root, argv[2]);
    printResponse(1, NULL);
    return;
  }

  /* ── traverse <type> ───────────────────────────────────── */
  if (strcmp(cmd, "traverse") == 0) {
    if (argc < 3) {
      printResponse(0, "Usage: traverse <preorder|postorder|levelorder>");
      return;
    }
    visitedCount = 0;
    if (strcmp(argv[2], "preorder") == 0)
      preorder(root);
    else if (strcmp(argv[2], "postorder") == 0)
      postorder(root);
    else if (strcmp(argv[2], "levelorder") == 0)
      levelOrder(root);
    else {
      printResponse(0, "Unknown traversal type");
      return;
    }

    printResponse(1, NULL);
    return;
  }

  printResponse(0, "Unknown command");
}

/* ═══════════════════════ INTERACTIVE MENU MODE ════════════════════════ */

void printTreeVisual(Node *node, int depth, int isLast) {
  if (!node)
    return;

  /* Indentation */
  int i;
  for (i = 0; i < depth; i++)
    printf("    ");

  if (depth > 0) {
    printf("%s── ", isLast ? "└" : "├");
  }

  /* Icon + name */
  if (node->isFolder) {
    printf("[📁] %s\n", node->name);
  } else {
    printf("[📄] %s (%d KB)\n", node->name, node->size);
  }

  /* Print children */
  Node *child = node->firstChild;
  while (child) {
    printTreeVisual(child, depth + 1, child->nextSibling == NULL);
    child = child->nextSibling;
  }
}

void interactiveMenu(void) {
  loadTree();
  if (!root) {
    buildSampleTree();
  }

  int choice;
  char buf1[100], buf2[100];
  int val1, val2;

  while (1) {
    printf("\n");
    printf("╔══════════════════════════════════════════╗\n");
    printf("║       FILE SYSTEM EXPLORER (N-ary Tree) ║\n");
    printf("╠══════════════════════════════════════════╣\n");
    printf("║  1. Show tree                           ║\n");
    printf("║  2. Insert file/folder                  ║\n");
    printf("║  3. Delete node                         ║\n");
    printf("║  4. Rename node                         ║\n");
    printf("║  5. Move node                           ║\n");
    printf("║  6. Search by name                      ║\n");
    printf("║  7. Preorder traversal                  ║\n");
    printf("║  8. Postorder traversal                 ║\n");
    printf("║  9. Level-order traversal               ║\n");
    printf("║ 10. Statistics                          ║\n");
    printf("║ 11. Reset to sample tree                ║\n");
    printf("║  0. Exit                                ║\n");
    printf("╚══════════════════════════════════════════╝\n");
    printf("Choice: ");

    if (scanf("%d", &choice) != 1)
      break;

    switch (choice) {
    case 0:
      saveTree();
      printf("Bye!\n");
      if (root)
        freeTree(root);
      return;

    case 1:
      printf("\n");
      printTreeVisual(root, 0, 1);
      break;

    case 2: {
      printf("Parent path (e.g. root/Projects): ");
      scanf("%99s", buf1);
      printf("Name: ");
      scanf("%99s", buf2);
      printf("Is folder? (1=yes, 0=no): ");
      scanf("%d", &val1);
      val2 = 0;
      if (!val1) {
        printf("Size in KB: ");
        scanf("%d", &val2);
      }
      Node *p = findByPath(root, buf1);
      if (!p) {
        printf("ERROR: Parent not found.\n");
        break;
      }
      int rc = insertNode(p, buf2, val1, val2);
      if (rc == -2)
        printf("ERROR: Cannot insert under a file.\n");
      else if (rc == -3)
        printf("ERROR: Duplicate name.\n");
      else if (rc == 0) {
        printf("OK: Inserted.\n");
        saveTree();
      } else
        printf("ERROR: Insert failed.\n");
      break;
    }

    case 3:
      printf("Path to delete: ");
      scanf("%99s", buf1);
      {
        Node *t = findByPath(root, buf1);
        if (!t) {
          printf("ERROR: Not found.\n");
          break;
        }
        int rc = deleteNode(t);
        if (rc == -2)
          printf("ERROR: Cannot delete root.\n");
        else if (rc == 0) {
          printf("OK: Deleted.\n");
          saveTree();
        } else
          printf("ERROR: Delete failed.\n");
      }
      break;

    case 4:
      printf("Path: ");
      scanf("%99s", buf1);
      printf("New name: ");
      scanf("%99s", buf2);
      {
        Node *t = findByPath(root, buf1);
        if (!t) {
          printf("ERROR: Not found.\n");
          break;
        }
        int rc = renameNode(t, buf2);
        if (rc == -2)
          printf("ERROR: Name conflict.\n");
        else if (rc == 0) {
          printf("OK: Renamed.\n");
          saveTree();
        }
      }
      break;

    case 5:
      printf("Path to move: ");
      scanf("%99s", buf1);
      printf("New parent path: ");
      scanf("%99s", buf2);
      {
        Node *t = findByPath(root, buf1);
        Node *np = findByPath(root, buf2);
        if (!t) {
          printf("ERROR: Source not found.\n");
          break;
        }
        if (!np) {
          printf("ERROR: Destination not found.\n");
          break;
        }
        int rc = moveNode(t, np);
        if (rc == -3)
          printf("ERROR: Destination is not a folder.\n");
        else if (rc == -4)
          printf("ERROR: Cannot move into own subtree.\n");
        else if (rc == -5)
          printf("ERROR: Name conflict.\n");
        else if (rc == 0) {
          printf("OK: Moved.\n");
          saveTree();
        }
      }
      break;

    case 6:
      printf("Search query: ");
      scanf("%99s", buf1);
      searchByName(root, buf1);
      printf("Visited (%d): ", visitedCount);
      {
        int i;
        for (i = 0; i < visitedCount; i++)
          printf("%s ", visited[i]);
      }
      printf("\nMatches (%d):\n", matchCount);
      {
        int i;
        for (i = 0; i < matchCount; i++)
          printf("  %s\n", matches[i]);
      }
      break;

    case 7:
      visitedCount = 0;
      preorder(root);
      printf("Preorder (%d): ", visitedCount);
      {
        int i;
        for (i = 0; i < visitedCount; i++)
          printf("%s ", visited[i]);
      }
      printf("\n");
      break;

    case 8:
      visitedCount = 0;
      postorder(root);
      printf("Postorder (%d): ", visitedCount);
      {
        int i;
        for (i = 0; i < visitedCount; i++)
          printf("%s ", visited[i]);
      }
      printf("\n");
      break;

    case 9:
      visitedCount = 0;
      levelOrder(root);
      printf("Level-order (%d): ", visitedCount);
      {
        int i;
        for (i = 0; i < visitedCount; i++)
          printf("%s ", visited[i]);
      }
      printf("\n");
      break;

    case 10:
      printf("\n── Statistics ──\n");
      printf("Folders    : %d\n", countFolders(root));
      printf("Files      : %d\n", countFiles(root));
      printf("Height     : %d\n", treeHeight(root));
      printf("Total size : %d KB\n", totalSize(root));
      break;

    case 11:
      if (root) {
        freeTree(root);
        root = NULL;
      }
      buildSampleTree();
      printf("OK: Reset to sample tree.\n");
      break;

    default:
      printf("Invalid choice.\n");
    }
  }
}

/* ═══════════════════════ MAIN ═════════════════════════════════════════ */

int main(int argc, char *argv[]) {
  if (argc < 2) {
    /* No arguments → interactive menu */
    interactiveMenu();
  } else {
    /* Single-shot command → JSON output */
    handleCommand(argc, argv);
    /* Free memory (good practice, not strictly needed for one-shot) */
    if (root) {
      freeTree(root);
      root = NULL;
    }
  }
  return 0;
}
