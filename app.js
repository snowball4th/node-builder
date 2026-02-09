// ===============================
// Node Builder v3 (ITEM v3)
// - item: qty / dur / variants
// - no uses, no infinite
// ===============================

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const STORAGE_KEY = "node_builder_v3";

// ---------- utils ----------
const clamp = (n, min, max) => Math.max(min, Math.min(max, n|0));
const now = () => new Date().toLocaleString("ko-KR", { hour12:false });

// ---------- state ----------
const state = {
  nodes: [],
  items: [],          // item master
  selectedNodeId: null,
  selectedItemIndex: -1,
  nextNodeId: 1,

  run: {
    currentNodeId: null,
    inventory: [],    // { itemId, qty, dur }
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

  $("#selectedNodeId").value = String(id).padStart(4,"0");
  $("#selectedNodeTitle").value = n.title;
  $("#selectedNodeBody").value = n.body;
  renderNodeList();
}

function saveNode(){
  const n = state.nodes.find(n=>n.id===state.selectedNodeId);
  if(!n) return;
  n.title = $("#selectedNodeTitle").value;
  n.body = $("#selectedNodeBody").value;
  n.updatedAt = now();
  saveAll();
  renderNodeList();
}

function renderNodeList(){
  const ul = $("#nodeList");
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
  $("#selectedItemId").value = item.id;
  $("#selectedItemName").value = item.displayName;
  $("#selectedItemQty").value = item.qty;
  $("#selectedItemDur").value = item.dur;

  $("#itemBaseName").value = item.variants.base.name;
  $("#itemBrokenName").value = item.variants.dur0.name;
  $("#itemSpecialName").value = item.variants.special.name;
  $("#itemSpecialNode").value = item.variants.special.nodeId || "";
}

function saveItem(){
  if(state.selectedItemIndex<0) return;
  const it = state.items[state.selectedItemIndex];

  it.id = $("#selectedItemId").value.trim();
  it.displayName = $("#selectedItemName").value.trim();
  it.qty = clamp($("#selectedItemQty").value,0,10);
  it.dur = clamp($("#selectedItemDur").value,0,10);

  it.variants.base.name = $("#itemBaseName").value.trim();
  it.variants.dur0.name = $("#itemBrokenName").value.trim();
  it.variants.special.name = $("#itemSpecialName").value.trim();
  it.variants.special.nodeId = $("#itemSpecialNode").value.trim();

  if($("#itemBaseImg").files[0]) it.variants.base.img = $("#itemBaseImg").files[0];
  if($("#itemBrokenImg").files[0]) it.variants.dur0.img = $("#itemBrokenImg").files[0];
  if($("#itemSpecialImg").files[0]) it.variants.special.img = $("#itemSpecialImg").files[0];

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

  $("#previewTitle").textContent = n.title || "제목 없음";
  $("#previewBody").textContent = n.body || "";
}

// ===============================
// TAB / INIT
// ===============================
function switchTab(name){
  $$(".tab").forEach(b=>b.classList.toggle("active", b.dataset.tab===name));
  ["nodes","editor","preview","items"].forEach(p=>{
    document.querySelector(`[data-panel="${p}"]`)
      .classList.toggle("hidden", p!==name);
  });
  if(name==="preview") renderRun();
  if(name==="items") renderItems();
}

function init(){
  loadAll();
  renderNodeList();
  if(state.selectedNodeId) selectNode(state.selectedNodeId);

  $("#btnAddNode").onclick = addNode;
  $("#btnSaveNode").onclick = saveNode;

  $("#btnAddItem").onclick = addItem;
  $("#btnSaveItem").onclick = saveItem;
  $("#btnDeleteItem").onclick = deleteItem;

  $$(".tab").forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));
}

document.addEventListener("DOMContentLoaded", init);
