// Node Builder v2 (stable)
// - Numeric node id (UI shows 4-digit)
// - Item master with maxUses: number or INF(null)
// - Inventory uses instances
// - Choice effects: Give/Consume can be toggled per choice (builder UX)
// - Confusion(혼란): internal 0..10 integer, NOT shown to player. Only subtle UI changes in preview.

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const STORAGE_KEY = "node_builder_v2";

// ✅ 표시용 ID 포맷 (내부는 number 유지)
const ID_WIDTH = 4;
function formatId(n){ return String(n).padStart(ID_WIDTH, "0"); }

// ✅ 혼란(0~10, 정수) 보정
function clampConfusion(v){
  const n = parseInt(String(v), 10);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(10, n));
}

// ✅ 혼란 단계(4단계) — 플레이어에 수치 노출 없이 미세 분위기 변화만
function confusionStage(v){
  if (v <= 2) return "calm";
  if (v <= 4) return "subtle";
  if (v <= 7) return "uneasy";
  return "danger";
}

const state = {
  nodes: [],
  items: [],
  selectedNodeId: null,
  selectedItemKey: null,
  nextNodeId: 1,
  nextInstanceId: 1,
  run: {
    currentNodeId: null,
    inventory: [], // { instanceId, itemId, usesLeft|null }
    confusion: 0,  // ✅ internal only
  },
};

function toast(msg) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 1200);
}

function nowStamp() {
  return new Date().toLocaleString("ko-KR", { hour12: false });
}

function switchTab(tabName) {
  $$(".tab").forEach((b) => {
    const active = b.dataset.tab === tabName;
    b.classList.toggle("active", active);
    b.setAttribute("aria-selected", active ? "true" : "false");
  });

  ["nodes", "editor", "preview", "items"].forEach((name) => {
    const panel = document.querySelector(`[data-panel="${name}"]`);
    if (panel) panel.classList.toggle("hidden", name !== tabName);
  });

  if (tabName === "preview") {
    ensureRunInitialized();
    renderRun();
  }
  if (tabName === "items") {
    renderItems();
    if (state.selectedItemKey) loadItemToForm(state.selectedItemKey);
  }
}

// ---------------- persistence ----------------
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

    state.selectedNodeId = state.nodes[0]?.id ?? null;
    state.selectedItemKey = state.items[0]?.itemId ?? null;

    state.run.currentNodeId = null;
    state.run.inventory = [];
    state.run.confusion = 0;
    return true;
  } catch {
    return false;
  }
}

// ---------------- nodes ----------------
function addNode() {
  const id = state.nextNodeId++;
  const node = {
    id,
    title: "",
    body: "",
    createdAt: nowStamp(),
    updatedAt: nowStamp(),
    choices: [],
  };
  state.nodes.unshift(node);
  state.selectedNodeId = id;
  saveAll();
  renderNodeList();
  selectNode(id);
  toast(`노드 ${formatId(id)} 생성`);
}

function getSelectedNode() {
  if (state.selectedNodeId == null) return null;
  return state.nodes.find((n) => n.id === state.selectedNodeId) ?? null;
}

function selectNode(id) {
  state.selectedNodeId = id;
  const node = getSelectedNode();
  if (!node) return;

  const idEl = $("#selectedNodeId");
  const titleEl = $("#selectedNodeTitle");
  const bodyEl = $("#selectedNodeBody");

  if (idEl) idEl.value = formatId(node.id);
  if (titleEl) titleEl.value = node.title ?? "";
  if (bodyEl) bodyEl.value = node.body ?? "";

  renderChoiceEditor(node);
  renderNodeList();
}

function saveNode() {
  const node = getSelectedNode();
  if (!node) return toast("선택된 노드가 없음");

  node.title = $("#selectedNodeTitle")?.value ?? node.title;
  node.body = $("#selectedNodeBody")?.value ?? node.body;
  node.updatedAt = nowStamp();

  saveAll();
  renderNodeList();
  toast("저장됨");
}

function deleteNode() {
  const id = state.selectedNodeId;
  if (id == null) return toast("선택된 노드가 없음");

  const idx = state.nodes.findIndex((n) => n.id === id);
  if (idx < 0) return;

  state.nodes.splice(idx, 1);
  state.selectedNodeId = state.nodes[0]?.id ?? null;

  saveAll();
  renderNodeList();

  if (state.selectedNodeId != null) selectNode(state.selectedNodeId);
  else clearEditor();

  toast(`삭제: 노드 ${formatId(id)}`);
}

function clearEditor() {
  const idEl = $("#selectedNodeId");
  const titleEl = $("#selectedNodeTitle");
  const bodyEl = $("#selectedNodeBody");
  const choiceList = $("#choiceList");

  if (idEl) idEl.value = "";
  if (titleEl) titleEl.value = "";
  if (bodyEl) bodyEl.value = "";
  if (choiceList) choiceList.innerHTML = "";
}

function renderNodeList() {
  const ul = $("#nodeList");
  if (!ul) return;
  ul.innerHTML = "";

  if (state.nodes.length === 0) {
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.style.padding = "12px 2px";
    empty.textContent = "아직 노드가 없어요. 상단 ‘+ 노드 추가’로 시작하세요.";
    ul.appendChild(empty);
    return;
  }

  state.nodes.forEach((n) => {
    const li = document.createElement("li");
    li.className = "node" + (n.id === state.selectedNodeId ? " selected" : "");
    li.dataset.id = String(n.id);

    const title = document.createElement("div");
    title.className = "title";
    title.textContent = n.title?.trim() ? n.title : `노드 ${formatId(n.id)}`;

    const meta = document.createElement("div");
    meta.className = "meta";
    const left = document.createElement("span");
    left.textContent = `ID: ${formatId(n.id)}`;
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

// ---------------- items (master) ----------------
function addItem() {
  let i = 1;
  let itemId = `item${i}`;
  while (state.items.some((it) => it.itemId === itemId)) {
    i++;
    itemId = `item${i}`;
  }

  const item = {
    itemId,
    name: `아이템 ${i}`,
    maxUses: 1, // number or null(INF)
    consumable: true,
  };

  state.items.unshift(item);
  state.selectedItemKey = itemId;
  saveAll();
  renderItems();
  loadItemToForm(itemId);
  toast("아이템 생성");
}

function renderItems() {
  const wrap = $("#itemList");
  if (!wrap) return;
  wrap.innerHTML = "";

  if (state.items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.textContent = "아이템이 없어요. ‘+ 아이템 추가’로 생성하세요.";
    wrap.appendChild(empty);
    return;
  }

  state.items.forEach((it) => {
    const card = document.createElement("div");
    card.className = "card";

    const head = document.createElement("div");
    head.className = "card-title";

    const left = document.createElement("div");
    left.textContent = it.name || it.itemId;

    const pill = document.createElement("div");
    pill.className = "pill";
    pill.textContent = it.maxUses == null ? "무제한" : `uses ${it.maxUses}`;

    head.append(left);

    const sub = document.createElement("div");
    sub.className = "hint tiny";
    sub.textContent = `itemId: ${it.itemId} · ${it.consumable ? "소모형" : "비소모형"}`;

    card.append(head, sub);
    card.addEventListener("click", () => loadItemToForm(it.itemId));
    wrap.appendChild(card);
  });
}

function loadItemToForm(itemId) {
  const item = state.items.find((it) => it.itemId === itemId);
  if (!item) return;

  state.selectedItemKey = itemId;

  const idEl = $("#selectedItemId");
  const nameEl = $("#selectedItemName");
  const maxEl = $("#selectedItemMaxUses");
  const infEl = $("#selectedItemInfinite");
  const conEl = $("#selectedItemConsumable");

  if (idEl) idEl.value = item.itemId;
  if (nameEl) nameEl.value = item.name ?? "";

  const inf = item.maxUses == null;
  if (infEl) infEl.checked = inf;
  if (maxEl) {
    maxEl.disabled = inf;
    maxEl.value = inf ? "" : String(item.maxUses);
  }
  if (conEl) conEl.checked = !!item.consumable;
}

function saveItemFromForm() {
  const oldKey = state.selectedItemKey;
  if (!oldKey) return toast("선택 아이템이 없음");

  const item = state.items.find((it) => it.itemId === oldKey);
  if (!item) return;

  const newId = ($("#selectedItemId")?.value ?? "").trim();
  const name = ($("#selectedItemName")?.value ?? "").trim();
  const inf = !!$("#selectedItemInfinite")?.checked;
  const consumable = !!$("#selectedItemConsumable")?.checked;

  if (!newId) return toast("itemId는 비울 수 없음");
  if (newId !== oldKey && state.items.some((it) => it.itemId === newId)) {
    return toast("itemId가 중복됨");
  }

  item.itemId = newId;
  item.name = name || newId;
  item.maxUses = inf ? null : (clampInt($("#selectedItemMaxUses")?.value, 1, 999) ?? 1);
  item.consumable = consumable;

  if (newId !== oldKey) {
    state.nodes.forEach((n) => {
      n.choices.forEach((c) => {
        if (c.require?.itemId === oldKey) c.require.itemId = newId;
        (c.effects?.give ?? []).forEach((g) => { if (g.itemId === oldKey) g.itemId = newId; });
        (c.effects?.consume ?? []).forEach((k) => { if (k.itemId === oldKey) k.itemId = newId; });
      });
    });
    state.run.inventory.forEach((inst) => { if (inst.itemId === oldKey) inst.itemId = newId; });
    state.selectedItemKey = newId;
  }

  saveAll();
  renderItems();
  toast("아이템 저장");
}

function deleteItem() {
  const key = state.selectedItemKey;
  if (!key) return toast("선택 아이템이 없음");

  const idx = state.items.findIndex((it) => it.itemId === key);
  if (idx < 0) return;

  state.nodes.forEach((n) => {
    n.choices.forEach((c) => {
      if (c.require?.itemId === key) c.require = { itemId: "", minUses: 1 };
      c.effects.give = (c.effects.give ?? []).filter((g) => g.itemId !== key);
      c.effects.consume = (c.effects.consume ?? []).filter((k) => k.itemId !== key);
      if (c.effectsEnabled) {
        c.effectsEnabled.give = (c.effects.give.length > 0);
        c.effectsEnabled.consume = (c.effects.consume.length > 0);
      }
    });
  });
  state.run.inventory = state.run.inventory.filter((inst) => inst.itemId !== key);

  state.items.splice(idx, 1);
  state.selectedItemKey = state.items[0]?.itemId ?? null;

  saveAll();
  renderItems();
  if (state.selectedItemKey) loadItemToForm(state.selectedItemKey);
  toast("아이템 삭제");
}

// ---------------- choices editor ----------------
function ensureChoiceShape(c) {
  if (!c.require) c.require = { itemId: "", minUses: 1 };
  if (!c.effects) c.effects = { give: [], consume: [] };
  if (!c.effects.give) c.effects.give = [];
  if (!c.effects.consume) c.effects.consume = [];

  // ✅ Give/Consume 토글 상태(기본: 현재 리스트 기반)
  if (!c.effectsEnabled) {
    c.effectsEnabled = {
      give: (c.effects.give.length > 0),
      consume: (c.effects.consume.length > 0),
    };
  }

  // ✅ 혼란 변화값(선택지 클릭 시 적용) — 내부값만
  if (typeof c.confusionDelta !== "number") c.confusionDelta = 0;
}

function addChoice() {
  const node = getSelectedNode();
  if (!node) return toast("노드 선택 필요");

  const choice = {
    id: cryptoId(),
    text: "선택지",
    toId: node.id,
    require: { itemId: "", minUses: 1 },
    effects: { give: [], consume: [] },
    effectsEnabled: { give: false, consume: false },
    confusionDelta: 0,
  };
  node.choices.push(choice);
  saveAll();
  renderChoiceEditor(node);
  toast("선택지 추가");
}

function renderChoiceEditor(node) {
  const wrap = $("#choiceList");
  if (!wrap) return;
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
    card.className = "choice-card";

    const hasRequire = !!(c.require?.itemId && String(c.require.itemId).trim());
    const hasGive = c.effectsEnabled.give && (c.effects?.give?.length ?? 0) > 0;
    const hasConsume = c.effectsEnabled.consume && (c.effects?.consume?.length ?? 0) > 0;
    const hasItem = hasGive || hasConsume;

    const topMeta = document.createElement("div");
    topMeta.className = "choice-topmeta";


    // --- TOP META (one-row pills) ---

    const pillChoice = document.createElement("span");
    pillChoice.className = "pill-mini choice";
    pillChoice.textContent = `CHOICE ${idx + 1}`;
    topMeta.appendChild(pillChoice);

    const pillReq = document.createElement("span");
    pillReq.className = hasRequire ? "pill-mini require" : "pill-mini muted";
    pillReq.textContent = hasRequire ? "REQUIRE" : "NO REQUIRE";
    topMeta.appendChild(pillReq);

    const pillTo = document.createElement("span");
    pillTo.className = "pill-mini to";
    pillTo.textContent = `→ ${formatId(c.toId)}`;
    topMeta.appendChild(pillTo);

    card.appendChild(topMeta);

    const head = document.createElement("div");
    head.className = "card-title";
    const left = document.createElement("div");
    left.textContent = `#${idx + 1}`;

    // TEXT
    const fText = document.createElement("label");
    fText.className = "field choice-main";
    fText.innerHTML = `<span class="label">텍스트</span>`;
    const iText = document.createElement("input");
    iText.value = c.text ?? "";
    iText.addEventListener("input", () => { c.text = iText.value; saveAll(); });
    fText.appendChild(iText);

    // TO
    const fTo = document.createElement("label");
    fTo.className = "field";
    fTo.innerHTML = `<span class="label">대상 노드(toId)</span>`;
    const sTo = document.createElement("select");
    state.nodes.slice().sort((a,b)=>a.id-b.id).forEach((n) => {
      const opt = document.createElement("option");
      opt.value = String(n.id);
      opt.textContent = `${formatId(n.id)} · ${n.title?.trim() ? n.title : "제목 없음"}`;
      if (n.id === c.toId) opt.selected = true;
      sTo.appendChild(opt);
    });
    fTo.appendChild(sTo);

    sTo.addEventListener("change", () => {
    c.toId = Number(sTo.value);
    pill.textContent = `to: ${formatId(c.toId)}`;     // (아래 3번에서 pill 제거하면 이 줄도 지워)
    pillTo.textContent = `→ ${formatId(c.toId)}`;     // ✅ 추가
    saveAll();
    });

    // 혼란 변화값 (편집자만 보는 값)
    const fConf = document.createElement("label");
    fConf.className = "field";
    fConf.innerHTML = `<span class="label">혼란 변화값 (선택지 클릭 시, 내부값만 / 0~10으로 클램프됨)</span>`;
    const iConf = document.createElement("input");
    iConf.type = "number";
    iConf.step = "1";
    iConf.value = String(c.confusionDelta ?? 0);
    iConf.addEventListener("input", () => {
      const n = parseInt(iConf.value || "0", 10);
      c.confusionDelta = Number.isFinite(n) ? n : 0; // delta는 입력 그대로(± 가능), 적용 시 clamp
      saveAll();
    });
    fConf.appendChild(iConf);

    const div1 = document.createElement("div");
    div1.className = "choice-divider";

    // Require
    const reqWrap = document.createElement("div");
    reqWrap.className = "grid2";

    const fReqItem = document.createElement("label");
    fReqItem.className = "field";
    fReqItem.innerHTML = `<span class="label">요구 아이템(없으면 비활성)</span>`;
    const sReq = document.createElement("select");
    const none = document.createElement("option");
    none.value = "";
    none.textContent = "(없음)";
    sReq.appendChild(none);
    state.items.forEach((it) => {
      const opt = document.createElement("option");
      opt.value = it.itemId;
      opt.textContent = `${it.name || it.itemId} (${it.itemId})`;
      if (c.require.itemId === it.itemId) opt.selected = true;
      sReq.appendChild(opt);
    });
    sReq.addEventListener("change", () => { c.require.itemId = sReq.value; saveAll(); renderChoiceEditor(node); });
    fReqItem.appendChild(sReq);

    const fReqUses = document.createElement("label");
    fReqUses.className = "field";
    fReqUses.innerHTML = `<span class="label">최소 uses(>=)</span>`;
    const iReqUses = document.createElement("input");
    iReqUses.type = "number";
    iReqUses.min = "1";
    iReqUses.step = "1";
    iReqUses.value = String(c.require.minUses ?? 1);
    iReqUses.addEventListener("input", () => { c.require.minUses = clampInt(iReqUses.value, 1, 999) ?? 1; saveAll(); });
    fReqUses.appendChild(iReqUses);

    reqWrap.append(fReqItem, fReqUses);

    const reqBox = document.createElement("div");
    reqBox.className = "choice-sub require";
    reqBox.innerHTML = `<div class="subhead"><span>Require</span><span>조건</span></div>`;
    reqBox.appendChild(reqWrap);

    // Effects box (toggles + conditional UI)
    const effBox = document.createElement("div");
    effBox.className = "choice-sub effects";
    effBox.innerHTML = `<div class="subhead"><span>Effects</span><span>아이템</span></div>`;

    const toggles = document.createElement("div");
    toggles.className = "grid2";

    const tGive = document.createElement("label");
    tGive.className = "field checkbox";
    tGive.innerHTML = `<input type="checkbox" /> <span>아이템 획득(Give) 사용</span>`;
    const tGiveInput = tGive.querySelector("input");
    tGiveInput.checked = !!c.effectsEnabled.give;
    tGiveInput.addEventListener("change", () => {
      c.effectsEnabled.give = tGiveInput.checked;
      saveAll();
      renderChoiceEditor(node);
    });

    const tConsume = document.createElement("label");
    tConsume.className = "field checkbox";
    tConsume.innerHTML = `<input type="checkbox" /> <span>아이템 사용/소모(Consume) 사용</span>`;
    const tConsumeInput = tConsume.querySelector("input");
    tConsumeInput.checked = !!c.effectsEnabled.consume;
    tConsumeInput.addEventListener("change", () => {
      c.effectsEnabled.consume = tConsumeInput.checked;
      saveAll();
      renderChoiceEditor(node);
    });

    toggles.append(tGive, tConsume);
    effBox.appendChild(toggles);

    // Give UI
    const giveBox = document.createElement("div");
    giveBox.className = "card";
    giveBox.innerHTML = `<div class="card-title"><div>획득(Give)</div><div class="pill">선택지 클릭 시</div></div>`;
    const giveRow = document.createElement("div");
    giveRow.className = "grid2";
    const sGive = document.createElement("select");
    const gNone = document.createElement("option");
    gNone.value = "";
    gNone.textContent = "(아이템 선택)";
    sGive.appendChild(gNone);
    state.items.forEach((it) => {
      const opt = document.createElement("option");
      opt.value = it.itemId;
      opt.textContent = it.name || it.itemId;
      sGive.appendChild(opt);
    });
    const iGiveCount = document.createElement("input");
    iGiveCount.type = "number";
    iGiveCount.min = "1";
    iGiveCount.step = "1";
    iGiveCount.value = "1";
    const btnGive = document.createElement("button");
    btnGive.className = "btn";
    btnGive.type = "button";
    btnGive.textContent = "추가";
    btnGive.addEventListener("click", () => {
      if (!sGive.value) return toast("획득 아이템 선택");
      const count = clampInt(iGiveCount.value, 1, 99) ?? 1;
      c.effects.give.push({ itemId: sGive.value, count });
      saveAll();
      renderChoiceEditor(node);
    });
    giveRow.append(sGive, iGiveCount);
    giveBox.append(giveRow, btnGive);

    const giveSummary = document.createElement("div");
    giveSummary.className = "hint tiny";
    giveSummary.style.marginTop = "8px";
    giveSummary.textContent = c.effects.give.length
      ? c.effects.give.map((g) => `+ ${g.itemId} x${g.count}`).join(" · ")
      : "없음";
    giveBox.appendChild(giveSummary);

    // Consume UI
    const conBox = document.createElement("div");
    conBox.className = "card";
    conBox.style.marginTop = "10px";
    conBox.innerHTML = `<div class="card-title"><div>사용/소모(Consume)</div><div class="pill">uses 감소</div></div>`;
    const conRow = document.createElement("div");
    conRow.className = "grid2";
    const sCon = document.createElement("select");
    const cNone = document.createElement("option");
    cNone.value = "";
    cNone.textContent = "(아이템 선택)";
    sCon.appendChild(cNone);
    state.items.forEach((it) => {
      const opt = document.createElement("option");
      opt.value = it.itemId;
      opt.textContent = it.name || it.itemId;
      sCon.appendChild(opt);
    });
    const iAmt = document.createElement("input");
    iAmt.type = "number";
    iAmt.min = "1";
    iAmt.step = "1";
    iAmt.value = "1";
    const btnCon = document.createElement("button");
    btnCon.className = "btn";
    btnCon.type = "button";
    btnCon.textContent = "추가";
    btnCon.addEventListener("click", () => {
      if (!sCon.value) return toast("사용 아이템 선택");
      const amount = clampInt(iAmt.value, 1, 99) ?? 1;
      c.effects.consume.push({ itemId: sCon.value, amount });
      saveAll();
      renderChoiceEditor(node);
    });
    conRow.append(sCon, iAmt);
    conBox.append(conRow, btnCon);

    const conSummary = document.createElement("div");
    conSummary.className = "hint tiny";
    conSummary.style.marginTop = "8px";
    conSummary.textContent = c.effects.consume.length
      ? c.effects.consume.map((k) => `- ${k.itemId} uses ${k.amount}`).join(" · ")
      : "없음";
    conBox.appendChild(conSummary);

    if (c.effectsEnabled.give) effBox.appendChild(giveBox);
    if (c.effectsEnabled.consume) effBox.appendChild(conBox);

    // Choice delete
    const btnDel = document.createElement("button");
    btnDel.className = "btn danger";
    btnDel.type = "button";
    btnDel.textContent = "선택지 삭제";
    btnDel.style.marginTop = "10px";
    btnDel.addEventListener("click", () => {
      node.choices = node.choices.filter((x) => x.id !== c.id);
      saveAll();
      renderChoiceEditor(node);
      toast("선택지 삭제");
    });

    card.append(head, fText, fTo, fConf, div1, reqBox, effBox, btnDel);
    wrap.appendChild(card);
  });
}

// ---------------- run (preview play) ----------------
function ensureRunInitialized() {
  if (state.nodes.length === 0) return;
  if (state.run.currentNodeId == null) {
    const node1 = state.nodes.find((n) => n.id === 1);
    state.run.currentNodeId = node1 ? 1 : Math.min(...state.nodes.map((n) => n.id));
    state.run.inventory = [];
    state.run.confusion = 0;
  }
  state.run.confusion = clampConfusion(state.run.confusion);
}

function resetRun() {
  state.run.currentNodeId = null;
  state.run.inventory = [];
  state.run.confusion = 0;
  ensureRunInitialized();
  renderRun();
  toast("리셋");
}

function renderInventory() {
  const wrap = $("#invList");
  if (!wrap) return;
  wrap.innerHTML = "";

  if (state.run.inventory.length === 0) {
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.textContent = "비어있음";
    wrap.appendChild(empty);
    return;
  }

  state.run.inventory.forEach((inst) => {
    const item = state.items.find((it) => it.itemId === inst.itemId);
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
  const itemId = (require.itemId || "").trim();
  if (!itemId) return true;
  const minUses = Number.isFinite(require.minUses) ? require.minUses : 1;

  return state.run.inventory.some((inst) => {
    if (inst.itemId !== itemId) return false;
    if (inst.usesLeft == null) return true;
    return inst.usesLeft >= minUses;
  });
}

function pickConsumableInstanceIndex(itemId) {
  let bestIdx = -1;
  let bestUses = Infinity;

  for (let i = 0; i < state.run.inventory.length; i++) {
    const inst = state.run.inventory[i];
    if (inst.itemId !== itemId) continue;

    if (inst.usesLeft == null) {
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

function applyEffects(effects, enabled) {
  if (!effects) return;

  const enGive = enabled?.give ?? true;
  const enConsume = enabled?.consume ?? true;

  if (enGive) {
    (effects.give ?? []).forEach((g) => {
      const item = state.items.find((it) => it.itemId === g.itemId);
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
  }

  if (enConsume) {
    (effects.consume ?? []).forEach((k) => {
      const amount = Number.isFinite(k.amount) ? k.amount : 1;
      for (let t = 0; t < amount; t++) {
        const idx = pickConsumableInstanceIndex(k.itemId);
        if (idx < 0) break;

        const inst = state.run.inventory[idx];
        if (inst.usesLeft == null) continue;

        inst.usesLeft -= 1;
        const item = state.items.find((it) => it.itemId === k.itemId);
        const consumable = item?.consumable ?? true;
        if (consumable && inst.usesLeft <= 0) {
          state.run.inventory.splice(idx, 1);
        }
      }
    });
  }
}

function renderRun() {
  ensureRunInitialized();
  renderInventory();

  const node = state.nodes.find((n) => n.id === state.run.currentNodeId);
  const titleEl = $("#previewTitle");
  const bodyEl = $("#previewBody");
  const wrap = $("#previewChoices");
  const preview = $("#previewArea");

  if (!titleEl || !bodyEl || !wrap) return;

  if (!node) {
    titleEl.textContent = "노드를 찾을 수 없음";
    bodyEl.textContent = "현재 노드 ID가 존재하지 않아(삭제되었을 수 있음).";
    wrap.innerHTML = "";
    return;
  }

  titleEl.textContent = node.title?.trim() ? node.title : `노드 ${formatId(node.id)}`;
  bodyEl.textContent = node.body?.trim() ? node.body : "(내용 없음)";

  wrap.innerHTML = "";

  if (!node.choices || node.choices.length === 0) {
    const info = document.createElement("div");
    info.className = "hint";
    info.textContent = "선택지가 없음";
    wrap.appendChild(info);
    return;
  }

  node.choices.forEach((c) => {
    ensureChoiceShape(c);

    const btn = document.createElement("button");
    btn.className = "choice-btn";
    btn.type = "button";

    const ok = checkRequire(c.require);
    btn.disabled = !ok;

    const label = c.text?.trim() ? c.text : "선택지";
    btn.textContent = label; // ✅ 불친절/힌트 제거: 조건 부족 안내 문구 없음

    btn.addEventListener("click", () => {
      // ✅ 혼란 적용(내부값만) + 0~10 클램프
      state.run.confusion = clampConfusion(state.run.confusion + (c.confusionDelta ?? 0));

      // ✅ 아이템 효과 적용(토글된 것만)
      applyEffects(c.effects, c.effectsEnabled);

      state.run.currentNodeId = c.toId;
      renderRun();
    });

    wrap.appendChild(btn);
  });

  // ✅ 혼란 단계 기반 미세 UI (수치/게이지 없음)
  if (preview) preview.dataset.confusion = confusionStage(state.run.confusion);
}

// ---------------- utils ----------------
function clampInt(v, min, max) {
  const n = parseInt(String(v), 10);
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, n));
}

function cryptoId() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function seedIfEmpty() {
  if (state.items.length === 0) {
    state.items = [
      { itemId: "key", name: "열쇠", maxUses: 1, consumable: true },
      { itemId: "ticket", name: "패스권", maxUses: null, consumable: false },
    ];
    state.selectedItemKey = "key";
  }

  if (state.nodes.length === 0) {
    addNode(); // node 1
    const n1 = state.nodes.find((n) => n.id === 1);
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
          effectsEnabled: { give: true, consume: false },
          confusionDelta: 0,
        },
        {
          id: cryptoId(),
          text: "열쇠 사용(uses -1)",
          toId: 1,
          require: { itemId: "key", minUses: 1 },
          effects: { give: [], consume: [{ itemId: "key", amount: 1 }] },
          effectsEnabled: { give: false, consume: true },
          confusionDelta: 0,
        },
        {
          id: cryptoId(),
          text: "패스권 얻기(+ticket x1)",
          toId: 1,
          require: { itemId: "", minUses: 1 },
          effects: { give: [{ itemId: "ticket", count: 1 }], consume: [] },
          effectsEnabled: { give: true, consume: false },
          confusionDelta: 0,
        },
        {
          id: cryptoId(),
          text: "패스권 사용(무제한)",
          toId: 1,
          require: { itemId: "ticket", minUses: 1 },
          effects: { give: [], consume: [{ itemId: "ticket", amount: 1 }] },
          effectsEnabled: { give: false, consume: true },
          confusionDelta: 0,
        },
        {
          id: cryptoId(),
          text: "혼란 +3 (테스트)",
          toId: 1,
          require: { itemId: "", minUses: 1 },
          effects: { give: [], consume: [] },
          effectsEnabled: { give: false, consume: false },
          confusionDelta: 3,
        },
      ];
    }
    saveAll();
  }
}

function init() {
  $$(".tab").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));

  $("#btnAddNode")?.addEventListener("click", addNode);
  $("#btnSaveNode")?.addEventListener("click", saveNode);
  $("#btnDeleteNode")?.addEventListener("click", deleteNode);
  $("#btnAddChoice")?.addEventListener("click", addChoice);

  $("#btnAddItem")?.addEventListener("click", addItem);
  $("#btnSaveItem")?.addEventListener("click", saveItemFromForm);
  $("#btnDeleteItem")?.addEventListener("click", deleteItem);

  $("#selectedItemInfinite")?.addEventListener("change", () => {
    const inf = !!$("#selectedItemInfinite")?.checked;
    const maxEl = $("#selectedItemMaxUses");
    if (maxEl) {
      maxEl.disabled = inf;
      if (inf) maxEl.value = "";
    }
  });

  $("#btnResetRun")?.addEventListener("click", resetRun);

  loadAll();
  seedIfEmpty();

  renderNodeList();
  if (state.selectedNodeId != null) selectNode(state.selectedNodeId);
  else clearEditor();

  renderItems();
  if (state.selectedItemKey) loadItemToForm(state.selectedItemKey);
}

document.addEventListener("DOMContentLoaded", init);
