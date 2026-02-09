// Mobile-first Node Builder (v2)
// - Numeric node id
// - Item master (type) with maxUses: number or INF
// - Inventory uses instances: { instanceId, itemId, usesLeft }
// - Use/consume happens when clicking a choice

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const STORAGE_KEY = "node_builder_v2";

const state = {
  nodes: [],
  items: [], // { itemId, name, maxUses: number|null (null => INF), consumable: boolean }
  selectedNodeId: null,
  selectedItemKey: null, // itemId
  nextNodeId: 1,
  nextInstanceId: 1,

  // preview/run state
  run: {
    currentNodeId: null,
    inventory: [], // instances
  },
};

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 1200);
}

function switchTab(tabName) {
  $$(".tab").forEach((b) => {
    const active = b.dataset.tab === tabName;
    b.classList.toggle("active", active);
    b.setAttribute("aria-selected", active ? "true" : "false");
  });

  ["nodes", "editor", "preview", "items"].forEach((name) => {
    const panel = document.querySelector(`[data-panel="${name}"]`);
    panel.classList.toggle("hidden", name !== tabName);
  });

  if (tabName === "preview") {
    ensureRunInitialized();
    renderRun();
  }
  if (tabName === "items") {
    renderItems();
  }
}

function nowStamp() {
  const now = new Date();
  return now.toLocaleString("ko-KR", { hour12: false });
}

// -------------------- persistence --------------------
function saveAll() {
  const payload = {
    nodes: state.nodes,
    items: state.items,
    nextNodeId: state.nextNodeId,
    nextInstanceId: state.nextInstanceId,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function loadAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);

    state.nodes = Array.isArray(data.nodes) ? data.nodes : [];
    state.items = Array.isArray(data.items) ? data.items : [];
    state.nextNodeId = Number.isFinite(data.nextNodeId) ? data.nextNodeId : 1;
    state.nextInstanceId = Number.isFinite(data.nextInstanceId) ? data.nextInstanceId : 1;

    // reset selection/run
    state.selectedNodeId = state.nodes[0]?.id ?? null;
    state.run.currentNodeId = null;
    state.run.inventory = [];
    return true;
  } catch {
    return false;
  }
}

// -------------------- nodes --------------------
function addNode() {
  const id = state.nextNodeId++;
  const node = {
    id,
    title: "",
    body: "",
    createdAt: nowStamp(),
    updatedAt: nowStamp(),
    choices: [
      // { id, text, toId, require: { itemId, minUses }, effects: { give: [{itemId, count}], consume: [{itemId, amount}] } }
    ],
  };
  state.nodes.unshift(node);
  state.selectedNodeId = id;
  saveAll();
  renderNodeList();
  selectNode(id);
  toast(`노드 ${id} 생성`);
}

function deleteNode() {
  const id = state.selectedNodeId;
  if (id == null) return toast("선택된 노드가 없음");

  const idx = state.nodes.findIndex((n) => n.id === id);
  if (idx < 0) return;

  // 연결된 선택지 toId 정합성은 다음 단계에서 자동 정리 가능
  state.nodes.splice(idx, 1);

  state.selectedNodeId = state.nodes[0]?.id ?? null;
  saveAll();
  renderNodeList();

  if (state.selectedNodeId != null) selectNode(state.selectedNodeId);
  else clearEditor();

  toast(`삭제: 노드 ${id}`);
}

function selectNode(id) {
  state.selectedNodeId = id;
  const node = state.nodes.find((n) => n.id === id);
  if (!node) return;

  $("#selectedNodeId").value = String(node.id);
  $("#selectedNodeTitle").value = node.title ?? "";
  $("#selectedNodeBody").value = node.body ?? "";

  renderChoiceEditor(node);
  renderNodeList();
}

function clearEditor() {
  $("#selectedNodeId").value = "";
  $("#selectedNodeTitle").value = "";
  $("#selectedNodeBody").value = "";
  $("#choiceList").innerHTML = "";
}

function saveNode() {
  const id = state.selectedNodeId;
  if (id == null) return toast("선택된 노드가 없음");
  const node = state.nodes.find((n) => n.id === id);
  if (!node) return;

  node.title = $("#selectedNodeTitle").value;
  node.body = $("#selectedNodeBody").value;
  node.updatedAt = nowStamp();

  // choices are edited live; just persist
  saveAll();
  renderNodeList();
  toast("저장됨");
}

function renderNodeList() {
  const ul = $("#nodeList");
  ul.innerHTML = "";

  if (state.nodes.length === 0) {
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.style.padding = "12px 2px";
    empty.textContent = "아직 노드가 없어요. 상단의 ‘+ 노드 추가’로 시작하세요.";
    ul.appendChild(empty);
    return;
  }

  state.nodes.forEach((n) => {
    const li = document.createElement("li");
    li.className = "node" + (n.id === state.selectedNodeId ? " selected" : "");
    li.dataset.id = String(n.id);

    const title = document.createElement("div");
    title.className = "title";
    title.textContent = n.title?.trim() ? n.title : `노드 ${n.id}`;

    const meta = document.createElement("div");
    meta.className = "meta";
    const left = document.createElement("span");
    left.textContent = `ID: ${n.id}`;
    const right = document.createElement("span");
    right.textContent = `수정: ${n.updatedAt}`;
    meta.append(left, right);

    li.append(title, meta);

    li.addEventListener("click", () => {
      selectNode(n.id);
      switchTab("editor");
    });

    ul.appendChild(li);
  });
}

// -------------------- items (master) --------------------
function addItem() {
  // temporary unique key
  const base = "item";
  let i = 1;
  let itemId = `${base}${i}`;
  while (state.items.some(it => it.itemId === itemId)) {
    i++;
    itemId = `${base}${i}`;
  }

  const item = {
    itemId,
    name: `아이템 ${i}`,
    maxUses: 1, // number, null => INF
    consumable: true,
  };
  state.items.unshift(item);
  state.selectedItemKey = itemId;

  saveAll();
  renderItems();
  loadItemToForm(itemId);
  toast("아이템 생성");
}

function loadItemToForm(itemId) {
  const item = state.items.find(it => it.itemId === itemId);
  if (!item) return;

  state.selectedItemKey = itemId;

  $("#selectedItemId").value = item.itemId;
  $("#selectedItemName").value = item.name ?? "";

  const isInf = item.maxUses == null;
  $("#selectedItemInfinite").checked = isInf;
  $("#selectedItemMaxUses").value = isInf ? "" : String(item.maxUses);
  $("#selectedItemMaxUses").disabled = isInf;

  $("#selectedItemConsumable").checked = !!item.consumable;
}

function saveItemFromForm() {
  const oldKey = state.selectedItemKey;
  if (!oldKey) return toast("선택 아이템이 없음");

  const item = state.items.find(it => it.itemId === oldKey);
  if (!item) return;

  const newId = $("#selectedItemId").value.trim();
  const name = $("#selectedItemName").value.trim();
  const inf = $("#selectedItemInfinite").checked;
  const consumable = $("#selectedItemConsumable").checked;

  if (!newId) return toast("itemId는 비울 수 없음");
  if (newId !== oldKey && state.items.some(it => it.itemId === newId)) {
    return toast("itemId가 중복됨");
  }

  item.itemId = newId;
  item.name = name || newId;
  item.maxUses = inf ? null : clampInt($("#selectedItemMaxUses").value, 1, 999) ?? 1;
  item.consumable = !!consumable;

  // if key changed, update references in nodes/choices and in run inventory
  if (newId !== oldKey) {
    state.nodes.forEach(n => {
      n.choices.forEach(c => {
        if (c.require?.itemId === oldKey) c.require.itemId = newId;

        c.effects?.give?.forEach(g => { if (g.itemId === oldKey) g.itemId = newId; });
        c.effects?.consume?.forEach(k => { if (k.itemId === oldKey) k.itemId = newId; });
      });
    });
    state.run.inventory.forEach(inst => {
      if (inst.itemId === oldKey) inst.itemId = newId;
    });

    state.selectedItemKey = newId;
  }

  saveAll();
  renderItems();
  toast("아이템 저장");
}

function deleteItem() {
  const key = state.selectedItemKey;
  if (!key) return toast("선택 아이템이 없음");

  const idx = state.items.findIndex(it => it.itemId === key);
  if (idx < 0) return;

  // remove references: require/effects referencing this item
  state.nodes.forEach(n => {
    n.choices.forEach(c => {
      if (c.require?.itemId === key) c.require = { itemId: "", minUses: 1 };
      c.effects.give = (c.effects.give ?? []).filter(g => g.itemId !== key);
      c.effects.consume = (c.effects.consume ?? []).filter(k => k.itemId !== key);
    });
  });

  // remove from run inventory
  state.run.inventory = state.run.inventory.filter(inst => inst.itemId !== key);

  state.items.splice(idx, 1);
  state.selectedItemKey = state.items[0]?.itemId ?? null;

  saveAll();
  renderItems();
  if (state.selectedItemKey) loadItemToForm(state.selectedItemKey);
  else {
    $("#selectedItemId").value = "";
    $("#selectedItemName").value = "";
    $("#selectedItemInfinite").checked = false;
    $("#selectedItemMaxUses").value = "";
    $("#selectedItemMaxUses").disabled = false;
    $("#selectedItemConsumable").checked = true;
  }

  toast("아이템 삭제");
}

function renderItems() {
  const wrap = $("#itemList");
  wrap.innerHTML = "";

  if (state.items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.textContent = "아이템이 없어요. ‘+ 아이템 추가’로 생성하세요.";
    wrap.appendChild(empty);
    return;
  }

  state.items.forEach(it => {
    const card = document.createElement("div");
    card.className = "card";
    card.dataset.itemId = it.itemId;

    const head = document.createElement("div");
    head.className = "card-title";

    const left = document.createElement("div");
    left.textContent = `${it.name || it.itemId}`;
    const pill = document.createElement("div");
    pill.className = "pill";
    pill.textContent = it.maxUses == null ? "무제한" : `uses ${it.maxUses}`;

    head.append(left, pill);

    const sub = document.createElement("div");
    sub.className = "hint tiny";
    sub.textContent = `itemId: ${it.itemId} · ${it.consumable ? "소모형" : "비소모형"}`;

    card.append(head, sub);

    card.addEventListener("click", () => {
      loadItemToForm(it.itemId);
    });

    wrap.appendChild(card);
  });
}

// -------------------- choices editor --------------------
function ensureChoiceShape(choice) {
  if (!choice.require) choice.require = { itemId: "", minUses: 1 };
  if (!choice.effects) choice.effects = { give: [], consume: [] };
  if (!choice.effects.give) choice.effects.give = [];
  if (!choice.effects.consume) choice.effects.consume = [];
}

function addChoice() {
  const node = getSelectedNode();
  if (!node) return toast("노드 선택 필요");

  const newChoice = {
    id: cryptoId(),
    text: "선택지",
    toId: node.id, // default self, user can change
    require: { itemId: "", minUses: 1 },
    effects: { give: [], consume: [] },
  };
  node.choices.push(newChoice);
  saveAll();
  renderChoiceEditor(node);
  toast("선택지 추가");
}

function renderChoiceEditor(node) {
  const wrap = $("#choiceList");
  wrap.innerHTML = "";

  if (!node.choices || node.choices.length === 0) {
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.textContent = "선택지가 없어요. ‘+ 선택지 추가’로 만들 수 있어.";
    wrap.appendChild(empty);
    return;
  }

  node.choices.forEach((c, idx) => {
    ensureChoiceShape(c);

    const card = document.createElement("div");
    card.className = "card";

    const head = document.createElement("div");
    head.className = "card-title";

    const left = document.createElement("div");
    left.textContent = `#${idx + 1}`;
    const pill = document.createElement("div");
    pill.className = "pill";
    pill.textContent = `to: ${c.toId}`;
    head.append(left, pill);

    const text = document.createElement("label");
    text.className = "field";
    text.innerHTML = `<span class="label">텍스트</span>`;
    const ti = document.createElement("input");
    ti.value = c.text ?? "";
    ti.addEventListener("input", () => {
      c.text = ti.value;
      saveAll();
    });
    text.appendChild(ti);

    // toId select
    const toField = document.createElement("label");
    toField.className = "field";
    toField.innerHTML = `<span class="label">대상 노드(toId)</span>`;
    const toSel = document.createElement("select");
    state.nodes
      .slice()
      .sort((a,b) => a.id - b.id)
      .forEach(n => {
        const opt = document.createElement("option");
        opt.value = String(n.id);
        opt.textContent = `${n.id} · ${n.title?.trim() ? n.title : "제목 없음"}`;
        if (n.id === c.toId) opt.selected = true;
        toSel.appendChild(opt);
      });
    toSel.addEventListener("change", () => {
      c.toId = Number(toSel.value);
      pill.textContent = `to: ${c.toId}`;
      saveAll();
    });
    toField.appendChild(toSel);

    // REQUIRE
    const reqWrap = document.createElement("div");
    reqWrap.className = "grid2";

    const reqItem = document.createElement("label");
    reqItem.className = "field";
    reqItem.innerHTML = `<span class="label">요구 아이템(없으면 비활성)</span>`;
    const reqSel = document.createElement("select");
    const optNone = document.createElement("option");
    optNone.value = "";
    optNone.textContent = "(없음)";
    reqSel.appendChild(optNone);
    state.items.forEach(it => {
      const opt = document.createElement("option");
      opt.value = it.itemId;
      opt.textContent = `${it.name || it.itemId} (${it.itemId})`;
      if (c.require.itemId === it.itemId) opt.selected = true;
      reqSel.appendChild(opt);
    });
    reqSel.addEventListener("change", () => {
      c.require.itemId = reqSel.value;
      saveAll();
    });
    reqItem.appendChild(reqSel);

    const reqUses = document.createElement("label");
    reqUses.className = "field";
    reqUses.innerHTML = `<span class="label">최소 uses(>=)</span>`;
    const reqUsesInput = document.createElement("input");
    reqUsesInput.type = "number";
    reqUsesInput.min = "1";
    reqUsesInput.step = "1";
    reqUsesInput.value = String(c.require.minUses ?? 1);
    reqUsesInput.addEventListener("input", () => {
      c.require.minUses = clampInt(reqUsesInput.value, 1, 999) ?? 1;
      saveAll();
    });
    reqUses.appendChild(reqUsesInput);

    reqWrap.append(reqItem, reqUses);

    // EFFECTS: GIVE
    const giveCard = document.createElement("div");
    giveCard.className = "card";
    giveCard.style.marginTop = "10px";
    giveCard.innerHTML = `<div class="card-title"><div>획득(Give)</div><div class="pill">선택지 클릭 시</div></div>`;

    const giveRow = document.createElement("div");
    giveRow.className = "grid2";

    const giveSel = document.createElement("select");
    const giveNone = document.createElement("option");
    giveNone.value = "";
    giveNone.textContent = "(아이템 선택)";
    giveSel.appendChild(giveNone);
    state.items.forEach(it => {
      const opt = document замен
      opt.value = it.itemId;
      opt.textContent = `${it.name || it.itemId}`;
      giveSel.appendChild(opt);
    });

    const giveCount = document.createElement("input");
    giveCount.type = "number";
    giveCount.min = "1";
    giveCount.step = "1";
    giveCount.placeholder = "수량(인스턴스 개수)";
    giveCount.value = "1";

    const btnGiveAdd = document.createElement("button");
    btnGiveAdd.className = "btn";
    btnGiveAdd.type = "button";
    btnGiveAdd.textContent = "추가";
    btnGiveAdd.addEventListener("click", () => {
      const itemId = giveSel.value;
      if (!itemId) return toast("획득 아이템 선택");
      const count = clampInt(giveCount.value, 1, 99) ?? 1;
      c.effects.give.push({ itemId, count });
      saveAll();
      renderChoiceEditor(node);
    });

    giveRow.append(giveSel, giveCount);
    giveCard.appendChild(giveRow);
    giveCard.appendChild(btnGiveAdd);

    const giveList = document.createElement("div");
    giveList.className = "hint tiny";
    giveList.style.marginTop = "8px";
    giveList.textContent = c.effects.give.length
      ? c.effects.give.map(g => `+ ${g.itemId} x${g.count}`).join(" · ")
      : "없음";
    giveCard.appendChild(giveList);

    // EFFECTS: CONSUME
    const conCard = document.createElement("div");
    conCard.className = "card";
    conCard.style.marginTop = "10px";
    conCard.innerHTML = `<div class="card-title"><div>사용/소모(Consume)</div><div class="pill">uses 감소</div></div>`;

    const conRow = document.createElement("div");
    conRow.className = "grid2";

    const conSel = document.createElement("select");
    const conNone = document.createElement("option");
    conNone.value = "";
    conNone.textContent = "(아이템 선택)";
    conSel.appendChild(conNone);
    state.items.forEach(it => {
      const opt = document.createElement("option");
      opt.value = it.itemId;
      opt.textContent = `${it.name || it.itemId}`;
      conSel.appendChild(opt);
    });

    const conAmt = document.createElement("input");
    conAmt.type = "number";
    conAmt.min = "1";
    conAmt.step = "1";
    conAmt.placeholder = "감소량";
    conAmt.value = "1";

    const btnConAdd = document.createElement("button");
    btnConAdd.className = "btn";
    btnConAdd.type = "button";
    btnConAdd.textContent = "추가";
    btnConAdd.addEventListener("click", () => {
      const itemId = conSel.value;
      if (!itemId) return toast("사용 아이템 선택");
      const amount = clampInt(conAmt.value, 1, 99) ?? 1;
      c.effects.consume.push({ itemId, amount });
      saveAll();
      renderChoiceEditor(node);
    });

    conRow.append(conSel, conAmt);
    conCard.appendChild(conRow);
    conCard.appendChild(btnConAdd);

    const conList = document.createElement("div");
    conList.className = "hint tiny";
    conList.style.marginTop = "8px";
    conList.textContent = c.effects.consume.length
      ? c.effects.consume.map(k => `- ${k.itemId} uses ${k.amount}`).join(" · ")
      : "없음";
    conCard.appendChild(conList);

    // delete choice
    const del = document.createElement("button");
    del.className = "btn danger";
    del.type = "button";
    del.textContent = "선택지 삭제";
    del.style.marginTop = "10px";
    del.addEventListener("click", () => {
      node.choices = node.choices.filter(x => x.id !== c.id);
      saveAll();
      renderChoiceEditor(node);
      toast("선택지 삭제");
    });

    card.append(head, text, toField);

    const reqTitle = document.createElement("div");
    reqTitle.className = "hint tiny";
    reqTitle.style.marginTop = "6px";
    reqTitle.textContent = "요구(require): 인벤토리에 해당 아이템 인스턴스가 있고, usesLeft가 최소값 이상이면 활성";

    card.append(reqTitle, reqWrap, giveCard, conCard, del);
    wrap.appendChild(card);
  });
}

function getSelectedNode() {
  const id = state.selectedNodeId;
  if (id == null) return null;
  return state.nodes.find(n => n.id === id) ?? null;
}

// -------------------- run (preview play) --------------------
function ensureRunInitialized() {
  if (state.nodes.length === 0) return;

  // if not initialized, start at node 1 if exists else smallest id
  if (state.run.currentNodeId == null) {
    const node1 = state.nodes.find(n => n.id === 1);
    const start = node1 ? 1 : Math.min(...state.nodes.map(n => n.id));
    state.run.currentNodeId = start;
    state.run.inventory = [];
  }
}

function resetRun() {
  state.run.currentNodeId = null;
  state.run.inventory = [];
  ensureRunInitialized();
  renderRun();
  toast("리셋");
}

function renderRun() {
  ensureRunInitialized();

  renderInventory();

  const node = state.nodes.find(n => n.id === state.run.currentNodeId);
  if (!node) {
    $("#previewTitle").textContent = "노드를 찾을 수 없음";
    $("#previewBody").textContent = "현재 노드 ID가 존재하지 않아. 노드를 삭제했을 수 있어.";
    $("#previewChoices").innerHTML = "";
    return;
  }

  $("#previewTitle").textContent = node.title?.trim() ? node.title : `노드 ${node.id}`;
  $("#previewBody").textContent = node.body?.trim() ? node.body : "(내용 없음)";

  const choicesWrap = $("#previewChoices");
  choicesWrap.innerHTML = "";

  if (!node.choices || node.choices.length === 0) {
    const info = document.createElement("div");
    info.className = "hint";
    info.textContent = "선택지가 없음";
    choicesWrap.appendChild(info);
    return;
  }

  node.choices.forEach(c => {
    ensureChoiceShape(c);
    const btn = document.createElement("button");
    btn.className = "choice-btn";
    btn.type = "button";
    btn.textContent = c.text?.trim() ? c.text : "선택지";

    const ok = checkRequire(c.require);
    btn.disabled = !ok;

    if (!ok && c.require?.itemId) {
      btn.textContent = `${btn.textContent} (조건 부족)`;
    }

    btn.addEventListener("click", () => {
      // apply effects then move
      applyEffects(c.effects);
      state.run.currentNodeId = c.toId;
      renderRun();
    });

    choicesWrap.appendChild(btn);
  });
}

function renderInventory() {
  const wrap = $("#invList");
  wrap.innerHTML = "";

  if (state.run.inventory.length === 0) {
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.textContent = "비어있음";
    wrap.appendChild(empty);
    return;
  }

  // show instances
  state.run.inventory.forEach(inst => {
    const item = state.items.find(it => it.itemId === inst.itemId);
    const name = item?.name || inst.itemId;

    const row = document.createElement("div");
    row.className = "inv-item";

    const left = document.createElement("div");
    left.textContent = name;

    const right = document.createElement("div");
    right.className = "muted";
    right.textContent = inst.usesLeft == null ? "uses: ∞" : `uses: ${inst.usesLeft}`;

    row.append(left, right);
    wrap.appendChild(row);
  });
}

function checkRequire(require) {
  if (!require) return true;
  const itemId = require.itemId?.trim();
  if (!itemId) return true;

  const minUses = Number.isFinite(require.minUses) ? require.minUses : 1;

  // condition: at least one instance with usesLeft >= minUses (or INF)
  return state.run.inventory.some(inst => {
    if (inst.itemId !== itemId) return false;
    if (inst.usesLeft == null) return true; // INF
    return inst.usesLeft >= minUses;
  });
}

function applyEffects(effects) {
  if (!effects) return;

  // GIVE: create instances
  (effects.give ?? []).forEach(g => {
    const item = state.items.find(it => it.itemId === g.itemId);
    if (!item) return;
    const count = Number.isFinite(g.count) ? g.count : 1;

    for (let i = 0; i < count; i++) {
      state.run.inventory.push({
        instanceId: state.nextInstanceId++,
        itemId: item.itemId,
        usesLeft: item.maxUses == null ? null : item.maxUses,
      });
    }
  });

  // CONSUME: decrease uses on an instance (strategy: pick the lowest usesLeft that still works; INF last)
  (effects.consume ?? []).forEach(k => {
    const itemId = k.itemId;
    const amount = Number.isFinite(k.amount) ? k.amount : 1;

    for (let t = 0; t < amount; t++) {
      const idx = pickConsumableInstanceIndex(itemId);
      if (idx < 0) break;

      const inst = state.run.inventory[idx];
      if (inst.usesLeft == null) {
        // INF: nothing to decrement
        continue;
      }
      inst.usesLeft -= 1;

      const item = state.items.find(it => it.itemId === itemId);
      const consumable = item?.consumable ?? true;

      if (consumable && inst.usesLeft <= 0) {
        state.run.inventory.splice(idx, 1);
      }
    }
  });
}

function pickConsumableInstanceIndex(itemId) {
  // prefer finite lowest usesLeft; if none, allow INF
  let bestIdx = -1;
  let bestUses = Infinity;

  for (let i = 0; i < state.run.inventory.length; i++) {
    const inst = state.run.inventory[i];
    if (inst.itemId !== itemId) continue;

    if (inst.usesLeft == null) {
      // INF candidate, keep only if no finite found
      if (bestIdx === -1) bestIdx = i;
      continue;
    }
    if (inst.usesLeft < bestUses) {
      bestUses = inst.usesLeft;
      bestIdx = i;
    }
  }
  return bestIdx;
}

// -------------------- utils --------------------
function clampInt(v, min, max) {
  const n = parseInt(String(v), 10);
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, n));
}

function cryptoId() {
  // stable enough for local builder
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

// -------------------- init --------------------
function init() {
  // tabs
  $$(".tab").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));

  // node actions
  $("#btnAddNode").addEventListener("click", addNode);
  $("#btnSaveNode").addEventListener("click", saveNode);
  $("#btnDeleteNode").addEventListener("click", deleteNode);
  $("#btnAddChoice").addEventListener("click", addChoice);

  // items actions
  $("#btnAddItem").addEventListener("click", addItem);
  $("#btnSaveItem").addEventListener("click", saveItemFromForm);
  $("#btnDeleteItem").addEventListener("click", deleteItem);
  $("#selectedItemInfinite").addEventListener("change", () => {
    const inf = $("#selectedItemInfinite").checked;
    $("#selectedItemMaxUses").disabled = inf;
    if (inf) $("#selectedItemMaxUses").value = "";
  });

  // run
  $("#btnResetRun").addEventListener("click", resetRun);

  // load or bootstrap
  const loaded = loadAll();

  if (!loaded) {
    // seed with one node + one item (optional but helps test)
    state.items = [
      { itemId: "key", name: "열쇠", maxUses: 1, consumable: true },
      { itemId: "ticket", name: "패스권", maxUses: null, consumable: false }, // INF
    ];
    addNode(); // creates node 1 and selects
    // put a sample choice to show the flow
    const n1 = state.nodes.find(n => n.id === 1);
    if (n1) {
      n1.title = "시작";
      n1.body = "선택지를 눌러 아이템을 얻거나 사용해보자.";
      n1.choices = [
        {
          id: cryptoId(),
          text: "열쇠 얻기(+key x1)",
          toId: 1,
          require: { itemId: "", minUses: 1 },
          effects: { give: [{ itemId: "key", count: 1 }], consume: [] },
        },
        {
          id: cryptoId(),
          text: "열쇠 사용(uses -1)",
          toId: 1,
          require: { itemId: "key", minUses: 1 },
          effects: { give: [], consume: [{ itemId: "key", amount: 1 }] },
        },
        {
          id: cryptoId(),
          text: "패스권 얻기(+ticket x1, 무제한)",
          toId: 1,
          require: { itemId: "", minUses: 1 },
          effects: { give: [{ itemId: "ticket", count: 1 }], consume: [] },
        },
        {
          id: cryptoId(),
          text: "패스권 사용(무제한이라 줄지 않음)",
          toId: 1,
          require: { itemId: "ticket", minUses: 1 },
          effects: { give: [], consume: [{ itemId: "ticket", amount: 1 }] },
        },
      ];
    }
    saveAll();
  }

  // initial renders
  renderNodeList();
  if (state.selectedNodeId != null) selectNode(state.selectedNodeId);
  else clearEditor();

  if (state.items.length > 0) {
    state.selectedItemKey = state.items[0].itemId;
    loadItemToForm(state.selectedItemKey);
  }
}

document.addEventListener("DOMContentLoaded", init);
