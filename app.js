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
// ITEMS (MASTER v3)
// ===============================
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
  state.selectedItemIndex = state.items.length-1;
  saveAll();
  renderItems();
  loadItemToForm(item);
}

function renderItems(){
  const wrap = $("#itemList");
  if(!wrap) return;
  wrap.innerHTML = "";
  state.items.forEach((it,i)=>{
    const d = document.createElement("div");
    d.className = "card";
    d.textContent = it.id || "(새 아이템)";
    d.onclick = ()=>{
      state.selectedItemIndex = i;
      loadItemToForm(it);
    };
    wrap.appendChild(d);
  });
}

function loadItemToForm(item){
  const map = [
    ["selectedItemId", item.id],
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

  it.id = idEl.value.trim();
  it.displayName = nameEl.value.trim();
  it.qty = clamp(qtyEl.value,0,10);
  it.dur = clamp(durEl.value,0,10);

  const baseName = $("#itemBaseName");
  const brokenName = $("#itemBrokenName");
  const specialName = $("#itemSpecialName");
  const specialNode = $("#itemSpecialNode");

  if(baseName) it.variants.base.name = baseName.value.trim();
  if(brokenName) it.variants.dur0.name = brokenName.value.trim();
  if(specialName) it.variants.special.name = specialName.value.trim();
  if(specialNode) it.variants.special.nodeId = specialNode.value.trim();

  const baseImg = $("#itemBaseImg");
  const brokenImg = $("#itemBrokenImg");
  const specialImg = $("#itemSpecialImg");

  if(baseImg?.files?.[0]) it.variants.base.img = baseImg.files[0];
  if(brokenImg?.files?.[0]) it.variants.dur0.img = brokenImg.files[0];
  if(specialImg?.files?.[0]) it.variants.special.img = specialImg.files[0];

  saveAll();
  renderItems();
  toast("아이템 저장");
}

function deleteItem(){
  if(state.selectedItemIndex<0) return;
  state.items.splice(state.selectedItemIndex,1);
  state.selectedItemIndex = state.items.length?0:-1;
  saveAll();
  renderItems();
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
  if(name==="items") renderItems();
}

function init(){
  loadAll();
  renderNodeList();
  if(state.selectedNodeId) selectNode(state.selectedNodeId);

  $("#btnAddNode")?.addEventListener("click", addNode);
  $("#btnSaveNode")?.addEventListener("click", saveNode);

  $("#btnAddItem")?.addEventListener("click", addItem);
  $("#btnSaveItem")?.addEventListener("click", saveItem);
  $("#btnDeleteItem")?.addEventListener("click", deleteItem);

  $$(".tab").forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));
}

document.addEventListener("DOMContentLoaded", init);
