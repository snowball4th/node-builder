/* SG Play Runtime (standalone)
 * - Loads snapshot from localStorage (set by Builder Play button)
 * - Falls back to builder autosave if snapshot missing
 * - Renders the same "preview" style UI (real game screen)
 */

const $ = (sel) => document.querySelector(sel);

const PLAY_SNAPSHOT_KEY = "SG_PLAY_SNAPSHOT";     // Play 클릭 시 스냅샷
const BUILDER_SAVE_KEY  = "sg_builder_state_v1";  // 빌더 자동저장 키(너 app.js와 맞춤 권장)

function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

function parseNodeId(raw){
  const s = String(raw ?? "").trim();
  if(!s) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function confusionLabel(v){
  if(v <= 2) return "calm";
  if(v <= 5) return "subtle";
  if(v <= 8) return "uneasy";
  return "danger";
}

function loadData(){
  // 1) 스냅샷 우선
  const snapRaw = localStorage.getItem(PLAY_SNAPSHOT_KEY);
  if(snapRaw){
    try {
      const snap = JSON.parse(snapRaw);
      if(snap && Array.isArray(snap.nodes)) return { source: "snapshot", ...snap };
    } catch(e){}
  }

  // 2) 빌더 자동저장 fallback
  const raw = localStorage.getItem(BUILDER_SAVE_KEY);
  if(raw){
    try {
      const saved = JSON.parse(raw);
      // saved가 {nodes, items, ...} 형태라고 가정
      const nodes = Array.isArray(saved.nodes) ? saved.nodes : [];
      const items = Array.isArray(saved.items) ? saved.items : [];
      const selectedNodeId = saved.selectedNodeId ?? null;
      return { source: "autosave", nodes, items, selectedNodeId };
    } catch(e){}
  }

  return { source: "empty", nodes: [], items: [], selectedNodeId: null };
}

const state = {
  nodes: [],
  items: [],
  selectedNodeId: null,
  run: {
    currentNodeId: null,
    confusion: 0
  }
};

function getNode(id){
  return state.nodes.find(n => n.id === id) || null;
}

function startNodeId(){
  // 선택된 노드가 있으면 거기서 시작, 없으면 첫 노드
  const fromSel = parseNodeId(state.selectedNodeId);
  if(fromSel != null && getNode(fromSel)) return fromSel;
  return state.nodes[0]?.id ?? null;
}

function resetRun(){
  state.run.confusion = 0;
  state.run.currentNodeId = startNodeId();
  renderRun();
}

function renderRun(){
  const n = getNode(state.run.currentNodeId);

  const titleEl = $("#previewTitle");
  const bodyEl  = $("#previewBody");
  const choicesEl = $("#previewChoices");
  const areaEl  = $("#previewArea");
  const metaEl  = $("#playMeta");

  if(areaEl) areaEl.dataset.confusion = confusionLabel(state.run.confusion);

  if(!n){
    if(titleEl) titleEl.textContent = state.nodes.length ? "연결 오류" : "노드 없음";
    if(bodyEl) bodyEl.textContent = state.nodes.length
      ? "현재 노드를 찾지 못했어. 선택지의 toNodeId 연결을 확인해줘."
      : "노드가 없어. 먼저 빌더에서 노드를 추가해줘.";
    if(choicesEl) choicesEl.innerHTML = "";
    if(metaEl) metaEl.textContent = "";
    return;
  }

  if(titleEl) titleEl.textContent = n.title || "제목 없음";
  if(bodyEl) bodyEl.textContent = n.body || "";

  if(metaEl){
    const idStr = String(n.id).padStart(4, "0");
    metaEl.textContent = `노드 ${idStr} · (혼란 ${state.run.confusion}/10: 내부값)`;
  }

  if(choicesEl){
    choicesEl.innerHTML = "";

    (n.choices || []).forEach((ch) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "choice-btn";
      btn.textContent = ch.text || "(빈 선택지)";

      const toId = parseNodeId(ch.toNodeId);
      const ok = toId != null && !!getNode(toId);
      btn.disabled = !ok;

      btn.addEventListener("click", () => {
        const delta = parseInt(ch.confusionDelta || 0, 10) || 0;
        state.run.confusion = clamp(state.run.confusion + delta, 0, 10);
        if(ok) state.run.currentNodeId = toId;
        renderRun();
      });

      choicesEl.appendChild(btn);
    });
  }
}

(function boot(){
  const data = loadData();
  state.nodes = Array.isArray(data.nodes) ? data.nodes : [];
  state.items = Array.isArray(data.items) ? data.items : [];
  state.selectedNodeId = data.selectedNodeId ?? null;

  // 버튼 연결
  $("#btnResetRun")?.addEventListener("click", resetRun);
  $("#btnExitPlay")?.addEventListener("click", () => {
    // 빌더로 돌아가기 (상대경로 안전)
    location.href = "./index.html";
  });

  resetRun();
})();
