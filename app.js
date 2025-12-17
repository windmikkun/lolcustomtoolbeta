"use strict";

/* ===============================
   設定（内部スコアのみ）
=============================== */
const LANES = ["TOP", "JG", "MID", "ADC", "SUP"];

// 1 division = 60点、1 tier = 4 division = 240点
const DIV_STEP = 60;
const TIER_STEP = DIV_STEP * 4;

// tier-2（メイン/サブ以外）は -2 division
const OFFLANE_PENALTY = DIV_STEP * 2;

const TIER_ORDER = ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND"];
const DIV_OFFSET = { I: 180, II: 120, III: 60, IV: 0 };

// Master+ は固定ボーナス
const MASTER_PLUS_BONUS = 120;

/* ===============================
   安全なID生成（crypto.randomUUID対策）
=============================== */
function makeId() {
  if (globalThis.crypto && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
}

/* ===============================
   DOM取得
=============================== */
const $ = (id) => document.getElementById(id);

const els = {
  name: $("name"),
  tier: $("tier"),
  division: $("division"),
  divisionWrap: $("divisionWrap"),
  mainLane: $("mainLane"),
  subLane: $("subLane"),

  addBtn: $("addBtn"),
  resetBtn: $("resetBtn"),

  teamCount: $("teamCount"),
  weight: $("weight"),
  wLabel: $("wLabel"),

  buildBtn: $("buildBtn"),
  countHint: $("countHint"),

  list: $("list"),
  meta: $("resultMeta"),
  resultArea: $("resultArea"),
};

/* ===============================
   状態
=============================== */
let players = [];

/* ===============================
   Rank計算
=============================== */
function isMasterPlus(tier) {
  return ["MASTER", "GRANDMASTER", "CHALLENGER"].includes(String(tier).toUpperCase());
}

function rankToScore(rank) {
  const tier = String(rank.tier).toUpperCase();
  if (isMasterPlus(tier)) {
    const diamondTop = (TIER_ORDER.indexOf("DIAMOND") * TIER_STEP) + DIV_OFFSET.I;
    return diamondTop + MASTER_PLUS_BONUS;
  }
  const idx = TIER_ORDER.indexOf(tier);
  const div = String(rank.division || "IV").toUpperCase();
  return idx * TIER_STEP + DIV_OFFSET[div];
}

function effectiveScore(base, lane, main, sub) {
  return (lane === main || lane === sub) ? base : base - OFFLANE_PENALTY;
}

/* ===============================
   UIヘルパー
=============================== */
function needSize(teamCount) {
  return Number(teamCount) * 5;
}

function rankLabel(p) {
  if (isMasterPlus(p.rank.tier)) return p.rank.tier;
  return `${p.rank.tier} ${p.rank.division}`;
}

function updateDivisionVisibility() {
  els.divisionWrap.style.display = isMasterPlus(els.tier.value) ? "none" : "";
}

function syncWeightLabel() {
  els.wLabel.textContent = String(els.weight.value);
}

/* ===============================
   CRUD
=============================== */
function renderList() {
  els.list.innerHTML = "";

  for (const p of players) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.name}</td>
      <td class="mono">${rankLabel(p)}</td>
      <td class="mono">${p.mainLane} / ${p.subLane}</td>
      <td>
        <button data-id="${p.id}" class="secondary delBtn">削除</button>
      </td>
    `;
    els.list.appendChild(tr);
  }

  const n = players.length;
  const need = needSize(els.teamCount.value);

  if (n < need) {
    els.countHint.textContent = `現在 ${n}人（${need}人必要）`;
  } else if (n === need) {
    els.countHint.textContent = `ちょうど${need}人です`;
  } else {
    els.countHint.textContent = `現在 ${n}人（${need}人を自動抽出）`;
  }
}

function clearResult() {
  els.meta.textContent = "未作成";
  els.resultArea.innerHTML = `<div class="hint">参加者を追加してください</div>`;
}

/* ===============================
   イベント
=============================== */
els.tier.addEventListener("change", updateDivisionVisibility);

els.weight.addEventListener("input", syncWeightLabel);
els.weight.addEventListener("change", syncWeightLabel);

els.teamCount.addEventListener("change", () => {
  renderList();
  clearResult();
});

els.addBtn.addEventListener("click", () => {
  const name = els.name.value.trim();
  if (!name) return alert("名前を入力してください");
  if (players.length >= 20) return alert("最大20人までです");

  const tier = els.tier.value;
  const division = isMasterPlus(tier) ? null : els.division.value;
  const main = els.mainLane.value;
  const sub = els.subLane.value;
  if (main === sub) return alert("メインとサブは別レーンにしてください");

  players.push({
    id: makeId(),
    name,
    rank: { tier, division },
    mainLane: main,
    subLane: sub,
  });

  els.name.value = "";
  renderList();
  clearResult();
});

els.resetBtn.addEventListener("click", () => {
  if (!confirm("全消去しますか？")) return;
  players = [];
  renderList();
  clearResult();
});

els.list.addEventListener("click", (e) => {
  if (!e.target.classList.contains("delBtn")) return;
  const id = e.target.dataset.id;
  players = players.filter(p => p.id !== id);
  renderList();
  clearResult();
});

/* ===============================
   チーム作成（簡易版）
=============================== */
els.buildBtn.addEventListener("click", () => {
  const t = Number(els.teamCount.value);
  const need = needSize(t);
  if (players.length < need) {
    alert(`${need}人必要です`);
    return;
  }

  const weight = Number(els.weight.value);

  const ps = players.slice(0, need).map(p => ({
    ...p,
    baseScore: rankToScore(p.rank),
  }));

  // 強い順に並べて交互割当（簡易）
  ps.sort((a, b) => b.baseScore - a.baseScore);

  const teams = Array.from({ length: t }, () => []);
  ps.forEach((p, i) => teams[i % t].push(p));

  els.resultArea.innerHTML = teams.map((team, i) => `
    <div class="teamCard">
      <h3>Team ${i + 1}</h3>
      <ul>
        ${team.map(p => `<li>${p.name} (${rankLabel(p)})</li>`).join("")}
      </ul>
    </div>
  `).join("");

  els.meta.textContent = `作成完了 / W:${weight}`;
});

/* ===============================
   初期化
=============================== */
updateDivisionVisibility();
syncWeightLabel();
renderList();
clearResult();