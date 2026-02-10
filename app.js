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
    state.run.currentNodeId = state.nodes[0]?.id ?? null;
    state.run.inventory = [];
    state.run.confusion = 0;
  }
}

function renderRun(){
  ensureRun();
  const n = state.nodes.find(n=>n.id===state.run.currentNodeId);
  if(!n) return;

  const t = $("#previewTitle");
  const b = $("#previewBody");
  if(t) t.textContent = n.title || "제목 없음";
  if(b) b.textContent = n.body || "";
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

