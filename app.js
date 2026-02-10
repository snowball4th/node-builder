// ===============================
// Node Builder v3 (ITEM v3)
// - item: qty / dur / variants
// - no uses, no infinite
// ===============================

// ---------- selector helpers ----------
// id만 넘겨도 되고, ".class" / "[data-...]" 도 그대로 지원
const $ = (s) => {
  if (!s) return null;
  const sel = (typeof s === "string" && /^[#.[]/.test(s)) ? s : ("#" + s);
  return document.querySelector(sel);
};
const $$ = (s) => {
  if (!s) return [];
  const sel = (typeof s === "string" && /^[#.[]/.test(s)) ? s : ("#" + s);
  return [...document.querySelectorAll(sel)];
};

const STORAGE_KEY = "node_builder_v3";

// ---------- utils ----------
const clamp = (n, min, max) => Math.max(min, Math.min(max, n|0));
const now = () => new Date().toLocaleString("ko-KR", { hour12:false });

// ---------- state ----------
const state = {
  nodes: [],
  items: [],
  selectedNodeId: null,
  selectedItemIndex: -1,
  nextNodeId: 1,

  run: {
    currentNodeId: null,
    inventory: [],
    confusion: 0
  }
};

// ---------- toast ----------
function toast(msg){
  const el = $("#toast");
  if(!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast.t);
  toast.t = setTimeout(()=>el.classList.remove("show"),1200);
}

// ---------- persistence ----------
function saveAll(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    nodes: state.nodes,
    items: state.items,
    nextNodeId: state.nextNodeId
  }));
}

function loadAll(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return;
    const d = JSON.parse(raw);
    state.nodes = d.nodes || [];
    state.items = d.items || [];
    state.nextNodeId = d.nextNodeId || 1;
    state.selectedNodeId = state.nodes[0]?.id ?? null;
    state.selectedItemIndex = state.items.length ? 0 : -1;
  }catch(e){}
}


// ---------- autosave (debounced) ----------
const SAVE_DEBOUNCE_MS = 350;
function saveAllDebounced(){
  clearTimeout(saveAllDebounced.t);
  saveAllDebounced.t = setTimeout(()=>{ 
    try{ saveAll(); }catch(e){}
  }, SAVE_DEBOUNCE_MS);

function renderNodeListDebounced(){
  clearTimeout(renderNodeListDebounced.t);
  renderNodeListDebounced.t = setTimeout(()=>{
    try{ renderNodeList(); }catch(e){}
  }, 150);
}
}

// ===============================
// NODES
// ===============================
function addNode(){
  const node = {
    id: state.nextNodeId++,
    title: "",
    body: "",
    choices: [],
    createdAt: now(),
    updatedAt: now()
  };
  state.nodes.unshift(node);
  state.selectedNodeId = node.id;
  saveAll();
  renderNodeList();
  selectNode(node.id);
}

function selectNode(id){
  state.selectedNodeId = id;
  const n = state.nodes.find(n=>n.id===id);
  if(!n) return;

  const idEl = $("#selectedNodeId");
  const titleEl = $("#selectedNodeTitle");
  const bodyEl = $("#selectedNodeBody");
  if(!idEl || !titleEl || !bodyEl) return;

  idEl.value = String(id).padStart(4,"0");
  titleEl.value = n.title;
  bodyEl.value = n.body;
  renderNodeList();
  renderChoices();
}

function saveNode(){
  const n = state.nodes.find(n=>n.id===state.selectedNodeId);
  if(!n) return;

  const titleEl = $("#selectedNodeTitle");
  const bodyEl = $("#selectedNodeBody");
  if(!titleEl || !bodyEl) return;

  n.title = titleEl.value;
  n.body = bodyEl.value;
  n.updatedAt = now();
  saveAll();
  renderNodeList();
}

function renderNodeList(){
  const ul = $("#nodeList");
  if(!ul) return;
  ul.innerHTML = "";
  state.nodes.forEach(n=>{
    const li = document.createElement("li");
    li.className = "node" + (n.id===state.selectedNodeId?" selected":"");
    li.textContent = n.title || `노드 ${String(n.id).padStart(4,"0")}`;
    li.onclick = ()=>{ selectNode(n.id); switchTab("editor"); };
    ul.appendChild(li);
  });
}



// ===============================
// CHOICES (MINIMAL v3)
// ===============================
function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#39;");
}

function addChoice(){
  const n = state.nodes.find(n=>n.id===state.selectedNodeId);
  if(!n) return;

  n.choices = n.choices || [];
  n.choices.push({
    text: "",
    toNodeId: "",
    confusionDelta: 0
  });

  n.updatedAt = now();
  saveAll();
  renderChoices();
}

function renderChoices(){
  const wrap = $("#choiceList");
  if(!wrap) return;

  const n = state.nodes.find(n=>n.id===state.selectedNodeId);
  wrap.innerHTML = "";
  if(!n) return;

  const choices = n.choices || [];
  choices.forEach((c, idx)=>{
    const row = document.createElement("div");
    row.className = "choice-row";

    row.innerHTML = `
      <label class="field">
        <span class="label">선택지 텍스트</span>
        <input data-k="text" data-i="${idx}" type="text" placeholder="예: 칼을 뽑는다" value="${escapeHtml(c.text || "")}">
      </label>

      <div class="grid2">
        <label class="field">
          <span class="label">다음 노드 ID</span>
          <input data-k="toNodeId" data-i="${idx}" type="text" placeholder="예: 7 또는 0007" value="${escapeHtml(c.toNodeId || "")}">
        </label>
        <label class="field">
          <span class="label">혼란 변화</span>
          <input data-k="confusionDelta" data-i="${idx}" type="number" step="1" value="${Number(c.confusionDelta||0)}">
        </label>
      </div>

      <div class="row">
        <button class="btn danger" type="button" data-del="${idx}">선택지 삭제</button>
      </div>
    `;

    wrap.appendChild(row);
  });

  // input → state 반영
  wrap.querySelectorAll("input[data-k]").forEach(inp=>{
    inp.addEventListener("input", (e)=>{
      const i = parseInt(e.target.dataset.i, 10);
      const k = e.target.dataset.k;

      const n2 = state.nodes.find(n=>n.id===state.selectedNodeId);
      if(!n2) return;
      const ch = (n2.choices || [])[i];
      if(!ch) return;

      if(k==="confusionDelta") ch[k] = parseInt(e.target.value || "0", 10) || 0;
      else ch[k] = e.target.value;

      n2.updatedAt = now();
      saveAll();
    });
  });

  // delete
  wrap.querySelectorAll("button[data-del]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const i = parseInt(btn.dataset.del, 10);
      const n2 = state.nodes.find(n=>n.id===state.selectedNodeId);
      if(!n2) return;
      n2.choices.splice(i, 1);
      n2.updatedAt = now();
      saveAll();
      renderChoices();
    });
  });
}

// ===============================
// ITEMS (MASTER v3)
// ===============================
// --- Items UX helpers ---
function openItemEditor(){
  $("#itemEditor")?.classList.remove("hidden");
}
function closeItemEditor(){
  $("#itemEditor")?.classList.add("hidden");
}
function setSelectedItemIndex(i){
  state.selectedItemIndex = i;
  renderItems(); // selection highlight
}

// --- itemId normalization / validation ---
function normalizeItemId(raw){
  return String(raw ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");
}
function isValidItemId(s){
  return /^[a-z0-9_-]+$/.test(s);
}

function addItem(){
  const item = {
    id: "",
    displayName: "",
    qty: 0,
    dur: 10,
    variants: {
      base:{ name:"", img:null },
      dur0:{ name:"", img:null },
      special:{ name:"", img:null, nodeId:"" }
    }
  };
  state.items.push(item);

  setSelectedItemIndex(state.items.length - 1);
  saveAll();
  renderItems();
  openItemEditor();
  loadItemToForm(item);
}

function renderItems(){
  const wrap = $("#itemList");
  if(!wrap) return;
  wrap.innerHTML = "";

  state.items.forEach((it,i)=>{
    const d = document.createElement("div");
    d.className = "card" + (i===state.selectedItemIndex ? " selected" : "");
    d.textContent = it.id || "(새 아이템)";
    d.onclick = ()=>{
      setSelectedItemIndex(i);
      openItemEditor();
      loadItemToForm(it);
    };
    wrap.appendChild(d);
  });
}

function loadItemToForm(item){
  const map = [
    ["selectedItemId", normalizeItemId(item.id)],
    ["selectedItemName", item.displayName],
    ["selectedItemQty", item.qty],
    ["selectedItemDur", item.dur],
    ["itemBaseName", item.variants.base.name],
    ["itemBrokenName", item.variants.dur0.name],
    ["itemSpecialName", item.variants.special.name],
    ["itemSpecialNode", item.variants.special.nodeId || ""]
  ];

  map.forEach(([id,val])=>{
    const el = $(id);
    if(el) el.value = val ?? "";
  });
}

function saveItem(){
  if(state.selectedItemIndex<0) return;
  const it = state.items[state.selectedItemIndex];

  const idEl = $("#selectedItemId");
  const nameEl = $("#selectedItemName");
  const qtyEl = $("#selectedItemQty");
  const durEl = $("#selectedItemDur");
  if(!idEl || !nameEl || !qtyEl || !durEl) return;

  const id = normalizeItemId(idEl.value.trim());
  idEl.value = id;

  if(!id){
    toast("itemId를 입력해줘");
    idEl.focus();
    return;
  }
  if(!isValidItemId(id)){
    toast("itemId는 a-z 0-9 _ - 만 가능");
    idEl.focus();
    return;
  }
  const dup = state.items.some((x, idx)=> idx!==state.selectedItemIndex && x.id === id);
  if(dup){
    toast("itemId가 중복됨");
    idEl.focus();
    return;
  }

  it.id = id;
  it.displayName = nameEl.value.trim();
  it.qty = clamp(qtyEl.value,0,10);
  it.dur = clamp(durEl.value,0,10);

  it.variants.base.name = $("#itemBaseName")?.value.trim() ?? "";
  it.variants.dur0.name = $("#itemBrokenName")?.value.trim() ?? "";
  it.variants.special.name = $("#itemSpecialName")?.value.trim() ?? "";
  it.variants.special.nodeId = $("#itemSpecialNode")?.value.trim() ?? "";

  if($("#itemBaseImg")?.files?.[0]) it.variants.base.img = $("#itemBaseImg").files[0];
  if($("#itemBrokenImg")?.files?.[0]) it.variants.dur0.img = $("#itemBrokenImg").files[0];
  if($("#itemSpecialImg")?.files?.[0]) it.variants.special.img = $("#itemSpecialImg").files[0];

  saveAll();
  renderItems();
  toast("아이템 저장");
  closeItemEditor();
}

function deleteItem(){
  if(state.selectedItemIndex<0) return;
  state.items.splice(state.selectedItemIndex,1);
  state.selectedItemIndex = state.items.length ? 0 : -1;
  saveAll();
  renderItems();
  closeItemEditor();
}

// ===============================
// RUN (PREVIEW)
// ===============================

function ensureRun(){
  if(state.run.currentNodeId==null){
    // 선택된 노드가 있으면 그걸 우선 시작점으로 사용
    state.run.currentNodeId = state.selectedNodeId ?? state.nodes[0]?.id ?? null;
    state.run.inventory = [];
    state.run.confusion = 0;
  }
}

function confusionLabel(v){
  if(v <= 2) return "calm";
  if(v <= 5) return "subtle";
  if(v <= 8) return "uneasy";
  return "danger";
}

function parseNodeId(raw){
  const s = String(raw ?? "").trim();
  if(!s) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function renderInventory(){
  const list = $("#invList");
  if(!list) return;
  list.innerHTML = "";

  const inv = state.run.inventory || [];
  if(!inv.length){
    list.innerHTML = `<div class="hint tiny">비어 있음</div>`;
    return;
  }

  inv.forEach((it)=>{
    const row = document.createElement("div");
    row.className = "inv-row";
    row.textContent = it.name || it.id || "아이템";
    list.appendChild(row);
  });
}

function renderRun(){
  ensureRun();

  const t = $("#previewTitle");
  const b = $("#previewBody");
  const cWrap = $("#previewChoices");
  const area = $("#previewArea");

  // 혼란 분위기 반영 (수치는 UI에 노출하지 않음)
  if(area) area.dataset.confusion = confusionLabel(state.run.confusion);

  const n = state.nodes.find(n=>n.id===state.run.currentNodeId);
  if(!n){
    if(t) t.textContent = "시작";
    if(b) b.textContent = state.nodes.length
      ? "현재 노드를 찾지 못했어. 선택지의 다음 노드 ID(toNodeId)를 확인해줘."
      : "노드가 없어. 먼저 노드를 추가해줘.";
    if(cWrap) cWrap.innerHTML = "";
    renderInventory();
    return;
  }

  if(t) t.textContent = n.title || `노드 ${String(n.id).padStart(4,"0")}`;
  if(b) b.textContent = n.body || "";

  // 선택지 렌더
  if(cWrap){
    cWrap.innerHTML = "";

    (n.choices || []).forEach((ch)=>{
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn choice";
      btn.textContent = ch.text || "(빈 선택지)";

      const toId = parseNodeId(ch.toNodeId);
      const exists = toId != null && state.nodes.some(x=>x.id===toId);
      btn.disabled = !exists;

      btn.addEventListener("click", ()=>{
        // 혼란 누적 (0~10)
        const delta = parseInt(ch.confusionDelta || 0, 10) || 0;
        state.run.confusion = clamp(state.run.confusion + delta, 0, 10);

        if(toId != null) state.run.currentNodeId = toId;
        renderRun();
      });

      cWrap.appendChild(btn);
    });

    if(!(n.choices||[]).length){
      const empty = document.createElement("div");
      empty.className = "hint tiny";
      empty.textContent = "선택지가 없어. 편집 탭에서 선택지를 추가해줘.";
      cWrap.appendChild(empty);
    }
  }

  renderInventory();
}


// ---------- Export / Import / Play ----------
function buildExportPayload(){
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    nodes: state.nodes,
    items: state.items,
    nextNodeId: state.nextNodeId
  };
}

function downloadJson(filename, obj){
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type:"application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function handleImportText(text){
  let data;
  try{ data = JSON.parse(text); }
  catch(e){ toast("불러오기 실패: JSON 형식이 아니야"); return; }

  if(!data || typeof data !== "object"){
    toast("불러오기 실패: 데이터가 올바르지 않아");
    return;
  }

  // 최소 검증
  if(!Array.isArray(data.nodes) || !Array.isArray(data.items)){
    toast("불러오기 실패: nodes/items 구조가 없어");
    return;
  }

  state.nodes = data.nodes;
  state.items = data.items;
  state.nextNodeId = data.nextNodeId || (Math.max(0, ...state.nodes.map(n=>n.id||0)) + 1);
  state.selectedNodeId = state.nodes[0]?.id ?? null;

  saveAll();
  renderNodeList();
  if(state.selectedNodeId) selectNode(state.selectedNodeId);
  toast("불러오기 완료");
}

function openPlayTab(){
  // 현재 상태를 스냅샷으로 고정해서 새 탭에서 실행
  const snapshot = JSON.stringify({ nodes: state.nodes, items: state.items });

  const w = window.open("", "_blank");
  if(!w){ alert("팝업이 차단됐어. 브라우저에서 팝업 허용 후 다시 눌러줘."); return; }

  w.document.open();
  w.document.write(`<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>SG Play</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Apple SD Gothic Neo,sans-serif;margin:0;padding:20px;background:#0b0d12;color:#e9eefc;}
  .card{max-width:720px;margin:0 auto;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:16px;}
  h1{font-size:18px;margin:0 0 8px}
  pre{white-space:pre-wrap;line-height:1.55;margin:0 0 14px;opacity:.95}
  .choices{display:flex;flex-direction:column;gap:10px;margin-top:10px}
  button{padding:12px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.08);color:#e9eefc;font-size:15px;text-align:left}
  button:disabled{opacity:.35}
  .top{display:flex;gap:10px;align-items:center;justify-content:space-between;margin-bottom:10px}
  .small{opacity:.6;font-size:12px}
</style>
</head>
<body>
  <div class="card">
    <div class="top">
      <div>
        <div class="small">SG Play</div>
        <h1 id="t"></h1>
      </div>
      <button id="reset">처음으로</button>
    </div>
    <pre id="b"></pre>
    <div class="choices" id="c"></div>
  </div>

<script>
  const DATA = ${snapshot};

  function parseId(raw){
    const s = String(raw ?? "").trim();
    if(!s) return null;
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : null;
  }

  const nodes = DATA.nodes || [];
  let current = nodes[0]?.id ?? null;

  function getNode(id){ return nodes.find(n=>n.id===id) || null; }

  function render(){
    const n = getNode(current);
    const t = document.querySelector("#t");
    const b = document.querySelector("#b");
    const c = document.querySelector("#c");

    if(!n){
      t.textContent = nodes.length ? "노드 없음/연결 오류" : "노드가 없어";
      b.textContent = nodes.length ? "현재 노드를 찾지 못했어. 연결(toNodeId)을 확인해줘." : "먼저 노드를 추가해줘.";
      c.innerHTML = "";
      return;
    }

    t.textContent = n.title || ("노드 " + String(n.id).padStart(4,"0"));
    b.textContent = n.body || "";

    c.innerHTML = "";
    (n.choices || []).forEach(ch=>{
      const btn = document.createElement("button");
      btn.textContent = ch.text || "(빈 선택지)";
      const to = parseId(ch.toNodeId);
      const ok = to != null && !!getNode(to);
      btn.disabled = !ok;
      btn.onclick = ()=>{ if(ok){ current = to; render(); } };
      c.appendChild(btn);
    });
  }

  document.querySelector("#reset").onclick = ()=>{
    current = nodes[0]?.id ?? null;
    render();
  };
  render();
<\/script>
</body>
</html>`);
  w.document.close();
}

// ===============================
// TAB / INIT
// ===============================
function switchTab(name){
  $$(".tab").forEach(b=>b.classList.toggle("active", b.dataset.tab===name));

  ["nodes","editor","preview","items"].forEach(p=>{
    const panel = document.querySelector(`[data-panel="${p}"]`);
    if(panel) panel.classList.toggle("hidden", p!==name);
  });

  if(name==="preview") renderRun();
  if(name==="items"){
    renderItems();
    closeItemEditor(); // 기본은 목록만
  }
}

function init(){
  loadAll();
  renderNodeList();
  if(state.selectedNodeId) selectNode(state.selectedNodeId);

  // items: 기본은 목록만
  closeItemEditor();

  // RUN controls
  $("#btnResetRun")?.addEventListener("click", ()=>{
    state.run.currentNodeId = null;
    state.run.inventory = [];
    state.run.confusion = 0;
    renderRun();
  });

  const PLAY_SNAPSHOT_KEY = "SG_PLAY_SNAPSHOT";

// Play: "지금 빌더에 있는 게임"을 스냅샷으로 저장하고 런타임 실행
$("#btnPlay")?.addEventListener("click", () => {
  const snapshot = {
    nodes: state.nodes,
    items: state.items,
    selectedNodeId: state.selectedNodeId ?? null,
    savedAt: Date.now(),
  };

  // 새 탭에서도 읽히게 localStorage 사용
  localStorage.setItem(PLAY_SNAPSHOT_KEY, JSON.stringify(snapshot));

  // 프로젝트 페이지/유저 페이지 모두 안전한 상대경로
  window.open("./play.html", "_blank");
});


  // Save/Share (download)
  $("#btnShare")?.addEventListener("click", ()=>{
    downloadJson(`SG_backup_${Date.now()}.json`, buildExportPayload());
  });

  // Import (upload json)
  $("#btnImport")?.addEventListener("click", ()=> $("#fileImport")?.click());
  $("#fileImport")?.addEventListener("change", async (e)=>{
    const f = e.target.files?.[0];
    if(!f) return;
    const text = await f.text();
    handleImportText(text);
    e.target.value = "";
  });

  // Node editor live autosave
  $("#selectedNodeTitle")?.addEventListener("input", (e)=>{
    const n = state.nodes.find(n=>n.id===state.selectedNodeId);
    if(!n) return;
    n.title = e.target.value;
    n.updatedAt = now();
    saveAllDebounced();
    renderNodeListDebounced();
  });
  $("#selectedNodeBody")?.addEventListener("input", (e)=>{
    const n = state.nodes.find(n=>n.id===state.selectedNodeId);
    if(!n) return;
    n.body = e.target.value;
    n.updatedAt = now();
    saveAllDebounced();
  });

  $("#btnAddNode")?.addEventListener("click", addNode);
  $("#btnSaveNode")?.addEventListener("click", saveNode);
  //$("#btnAddChoice")?.addEventListener("click", addChoice);

  $("#btnAddItem")?.addEventListener("click", addItem);
  $("#btnSaveItem")?.addEventListener("click", saveItem);
  $("#btnDeleteItem")?.addEventListener("click", deleteItem);

  // itemId: 실시간 소문자/허용문자만
  $("#selectedItemId")?.addEventListener("input", (e)=>{
    const el = e.target;
    const next = normalizeItemId(el.value);
    if(el.value !== next) el.value = next;
  });

  $$(".tab").forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));
}

document.addEventListener("DOMContentLoaded", init);

document.addEventListener("click", (e) => {
  if (!e.target.closest("#btnAddChoice")) return;
  addChoice();
});

