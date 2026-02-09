// Minimal mobile-first UI skeleton
// - Bottom tabs (nodes/editor/preview)
// - Add node button -> adds node to list
// - Select node -> opens editor + preview updates
// - Save/Delete basic actions

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const state = {
  nodes: [],
  selectedId: null,
  nextId: 1,
};

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 1200);
}

function switchTab(tabName) {
  // tab buttons
  $$(".tab").forEach((b) => {
    const active = b.dataset.tab === tabName;
    b.classList.toggle("active", active);
    b.setAttribute("aria-selected", active ? "true" : "false");
  });

  // panels
  ["nodes", "editor", "preview"].forEach((name) => {
    const panel = document.querySelector(`[data-panel="${name}"]`);
    panel.classList.toggle("hidden", name !== tabName);
  });
}

function renderNodeList() {
  const ul = $("#nodeList");
  ul.innerHTML = "";

  state.nodes.forEach((n) => {
    const li = document.createElement("li");
    li.className = "node" + (n.id === state.selectedId ? " selected" : "");
    li.dataset.id = String(n.id);

    const title = document.createElement("div");
    title.className = "title";
    title.textContent = n.title || `노드 ${n.id}`;

    const meta = document.createElement("div");
    meta.className = "meta";
    const left = document.createElement("span");
    left.textContent = `ID: ${n.id}`;
    const right = document.createElement("span");
    right.textContent = n.updatedAt ? `수정: ${n.updatedAt}` : "방금 생성";
    meta.append(left, right);

    li.append(title, meta);

    li.addEventListener("click", () => {
      selectNode(n.id);
      // 모바일 UX: 노드 탭에서 눌렀으면 편집으로 이동하는 게 빠름
      switchTab("editor");
    });

    ul.appendChild(li);
  });

  if (state.nodes.length === 0) {
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.style.padding = "12px 2px";
    empty.textContent = "아직 노드가 없어요. 상단의 ‘+ 노드 추가’로 시작하세요.";
    ul.appendChild(empty);
  }
}

function selectNode(id) {
  state.selectedId = id;
  const node = state.nodes.find((x) => x.id === id);
  if (!node) return;

  $("#selectedNodeTitle").value = node.title ?? "";
  $("#selectedNodeBody").value = node.body ?? "";

  $("#previewTitle").textContent = node.title?.trim() ? node.title : `노드 ${node.id}`;
  $("#previewBody").textContent = node.body?.trim()
    ? node.body
    : "내용이 비어있어요. 편집 탭에서 텍스트를 입력해보세요.";

  renderNodeList();
}

function addNode() {
  const now = new Date();
  const stamp = now.toLocaleString("ko-KR", { hour12: false });

  const node = {
    id: state.nextId++,
    title: "",
    body: "",
    updatedAt: stamp,
  };
  state.nodes.unshift(node);
  state.selectedId = node.id;

  renderNodeList();
  selectNode(node.id);

  toast(`노드 ${node.id} 생성`);
}

function saveNode() {
  const id = state.selectedId;
  if (id == null) return toast("선택된 노드가 없음");

  const node = state.nodes.find((x) => x.id === id);
  if (!node) return;

  node.title = $("#selectedNodeTitle").value;
  node.body = $("#selectedNodeBody").value;

  const now = new Date();
  node.updatedAt = now.toLocaleString("ko-KR", { hour12: false });

  // preview sync
  $("#previewTitle").textContent = node.title?.trim() ? node.title : `노드 ${node.id}`;
  $("#previewBody").textContent = node.body?.trim()
    ? node.body
    : "내용이 비어있어요. 편집 탭에서 텍스트를 입력해보세요.";

  renderNodeList();
  toast("저장됨");
}

function deleteNode() {
  const id = state.selectedId;
  if (id == null) return toast("선택된 노드가 없음");

  const idx = state.nodes.findIndex((x) => x.id === id);
  if (idx < 0) return;

  const removed = state.nodes.splice(idx, 1)[0];
  state.selectedId = state.nodes[0]?.id ?? null;

  renderNodeList();

  if (state.selectedId != null) {
    selectNode(state.selectedId);
  } else {
    $("#selectedNodeTitle").value = "";
    $("#selectedNodeBody").value = "";
    $("#previewTitle").textContent = "노드를 선택하세요";
    $("#previewBody").textContent = "왼쪽(노드 탭)에서 노드를 고르면 이곳에 표시됩니다.";
  }

  toast(`삭제: 노드 ${removed.id}`);
}

// Wire events
function init() {
  // tabs
  $$(".tab").forEach((b) => {
    b.addEventListener("click", () => switchTab(b.dataset.tab));
  });

  $("#btnAddNode").addEventListener("click", addNode);
  $("#btnSaveNode").addEventListener("click", saveNode);
  $("#btnDeleteNode").addEventListener("click", deleteNode);

  // starter content (optional): start with one node so UI가 바로 보이게
  addNode();
}

init();
