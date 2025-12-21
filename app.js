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

// Master+ は段階ボーナス
const MASTER_BONUS = 120;
const GRANDMASTER_BONUS = 180;
const CHALLENGER_BONUS = 240;

/* ===============================
   安全なID生成（crypto.randomUUID対策）
=============================== */
function makeId() {
  if (globalThis.crypto && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
}

// Fisher-Yates shuffle（非破壊）
function shuffle(list) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
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
  subLane1: $("subLane1"),
  subLane2: $("subLane2"),
  bulkInput: $("bulkInput"),

  addBtn: $("addBtn"),
  resetBtn: $("resetBtn"),
  bulkAddBtn: $("bulkAddBtn"),

  teamCount: $("teamCount"),
  weight: $("weight"),
  wLabel: $("wLabel"),

  buildBtn: $("buildBtn"),
  countHint: $("countHint"),

  list: $("list"),
  meta: $("resultMeta"),
  resultArea: $("resultArea"),
  scoreTableL: $("scoreTableL"),
  scoreTableR: $("scoreTableR"),
  rateSummary: $("rateSummary"),
  toggleRate: $("toggleRate"),
  rateTableWrap: $("rateTableWrap"),
  strictLane: $("strictLane"),
  strictWarn: $("strictWarn"),
  bracketBtn: $("bracketBtn"),
  bracketMode: $("bracketMode"),
  boSemi: $("boSemi"),
  boFinal: $("boFinal"),
  boRR: $("boRR"),
  exportBtn: $("exportBtn"),
  importBtn: $("importBtn"),
  importFile: $("importFile"),
  teamExportBtn: $("teamExportBtn"),
  teamImportBtn: $("teamImportBtn"),
  teamImportFile: $("teamImportFile"),
};

/* ===============================
   状態
=============================== */
const PLAYER_STORAGE_KEY = "lctb_players_v1";
let players = loadPlayers();
let lastTeams = null;

function savePlayers() {
  try {
    localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(players));
  } catch (e) {
    console.warn("savePlayers failed", e);
  }
}

function loadPlayers() {
  try {
    const raw = localStorage.getItem(PLAYER_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(p => ({
        ...p,
        id: p.id || makeId(),
        rank: p.rank || {},
        mainLane: p.mainLane || "TOP",
        subLanes: Array.isArray(p.subLanes) ? p.subLanes : [],
      }))
      .filter(p => p.name && p.rank && p.mainLane);
  } catch (e) {
    console.warn("loadPlayers failed", e);
    return [];
  }
}

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
    if (tier === "MASTER") return diamondTop + MASTER_BONUS;
    if (tier === "GRANDMASTER") return diamondTop + GRANDMASTER_BONUS;
    if (tier === "CHALLENGER") return diamondTop + CHALLENGER_BONUS;
  }
  const idx = TIER_ORDER.indexOf(tier);
  const div = String(rank.division || "IV").toUpperCase();
  return idx * TIER_STEP + DIV_OFFSET[div];
}

function effectiveScore(base, lane, main, subLanes) {
  return (lane === main || subLanes.includes(lane)) ? base : base - OFFLANE_PENALTY;
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

function getSubLanes(select1, select2) {
  const s1 = select1.value;
  const s2 = select2.value;
  const lanes = [s1];
  if (s2 && s2 !== "NONE") lanes.push(s2);
  return lanes;
}

function validateSubs(main, subs) {
  const uniq = [...new Set(subs)];
  if (uniq.length === 0) return { ok: false, msg: "サブレーンを1つ以上選択してください" };
  if (uniq.length > 2) return { ok: false, msg: "サブレーンは最大2つまでです" };
  if (uniq.includes(main)) return { ok: false, msg: "メインとサブは別レーンにしてください" };
  return { ok: true, subs: uniq };
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
      <td class="mono">${p.mainLane} / ${p.subLanes.join(", ")}</td>
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

  savePlayers();
}

function renderTeamsResult(teams, metaText = "") {
  if (!els.resultArea) return;
  els.resultArea.innerHTML = teams.map((team, i) => {
    const total = Object.values(team.slots)
      .filter(Boolean)
      .reduce((sum, p) => sum + p.score, 0);
    return `
      <div class="teamCard">
        <div class="teamHead">
          <h3>Team ${i + 1}</h3>
          <span class="badge">合計 ${total}</span>
        </div>
        <ul>
          ${LANES.map(lane => {
            const p = team.slots[lane];
            if (!p) return `<li><span class="lane">${lane}</span><span class="player">-</span></li>`;
            const laneNote = p.assignedLane && p.assignedLane !== lane ? ` (${p.assignedLane})` : "";
            return `<li><span class="lane">${lane}</span><span class="player">${p.name}${laneNote} - ${rankLabel(p)}</span></li>`;
          }).join("")}
        </ul>
      </div>
    `;
  }).join("");
  if (els.meta) els.meta.textContent = metaText || "作成済み";
}

function serializeTeams(teams) {
  return teams.map(team => ({
    slots: Object.fromEntries(LANES.map(l => {
      const p = team.slots[l];
      if (!p) return [l, null];
      return [l, {
        name: p.name,
        rank: p.rank,
        mainLane: p.mainLane,
        subLanes: p.subLanes,
        assignedLane: p.assignedLane || l,
        score: p.score,
      }];
    })),
  }));
}

function clearResult() {
  els.meta.textContent = "未作成";
  els.resultArea.innerHTML = `<div class="hint">参加者を追加してください</div>`;
  const overflow = $("overflowInfo");
  if (overflow) overflow.textContent = "";
  lastTeams = null;
}

function renderScoreTable() {
  if (!els.scoreTableL || !els.scoreTableR) return;
  const divOrder = ["IV", "III", "II", "I"];
  const rows = [];

  for (const tier of TIER_ORDER) {
    for (const div of divOrder) {
      const score = rankToScore({ tier, division: div });
      rows.push(`<tr><td>${tier}</td><td>${div}</td><td class="mono">${score}</td></tr>`);
    }
  }

  // Master+
  const masterTiers = ["MASTER", "GRANDMASTER", "CHALLENGER"];
  for (const tier of masterTiers) {
    const score = rankToScore({ tier });
    rows.push(`<tr><td>${tier}</td><td>-</td><td class="mono">${score}</td></tr>`);
  }

  // 二分割
  const mid = Math.ceil(rows.length / 2);
  els.scoreTableL.innerHTML = rows.slice(0, mid).join("");
  els.scoreTableR.innerHTML = rows.slice(mid).join("");
}

function renderRateSummary() {
  if (!els.rateSummary) return;
  const parts = [];

  for (const tier of TIER_ORDER) {
    const low = rankToScore({ tier, division: "IV" });
    const high = rankToScore({ tier, division: "I" });
    parts.push(`${tier} ${low}〜${high}`);
  }

  const masterTiers = ["MASTER", "GRANDMASTER", "CHALLENGER"];
  for (const tier of masterTiers) {
    const val = rankToScore({ tier });
    parts.push(`${tier} ${val}`);
  }

  els.rateSummary.textContent = parts.join(" / ");
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

if (els.strictLane && els.strictWarn) {
  els.strictLane.addEventListener("change", () => {
    els.strictWarn.style.display = els.strictLane.checked ? "" : "none";
  });
}

if (els.bracketBtn && els.bracketMode && els.boSemi && els.boFinal && els.boRR) {
  els.bracketBtn.addEventListener("click", () => {
    const mode = els.bracketMode.value;
    const teamCount = Number(els.teamCount.value);
    if (teamCount < 3) {
      alert("トーナメントは3チーム以上で生成してください");
      return;
    }
    if (!players || players.length < teamCount * 5) {
      alert("まずチーム作成を行ってください");
      return;
    }
    const weight = Number(els.weight.value);
    const strictOnly = !!(els.strictLane && els.strictLane.checked);
    const sorted = players
      .slice()
      .sort((a, b) => rankToScore(b.rank) - rankToScore(a.rank));
    const selected = sorted.slice(0, needSize(teamCount));
    const { teams } = assignTeams(selected, teamCount, weight, strictOnly);

    const bo = {
      r1: Number(els.boSemi.value),
      semi: Number(els.boSemi.value),
      final: Number(els.boFinal.value),
      rr: Number(els.boRR.value),
    };

    const payload = {
      mode,
      bo,
      teams: teams.map((t, idx) => ({
        name: `Team ${idx + 1}`,
        total: Object.values(t.slots).filter(Boolean).reduce((s, p) => s + p.score, 0),
        members: Object.values(t.slots).filter(Boolean).map(p => `${p.name}(${p.assignedLane})`),
      })),
    };
    try {
      localStorage.setItem("lctb_bracket_payload", JSON.stringify(payload));
    } catch (e) {
      alert("データ保存に失敗しました");
      return;
    }
    window.open("bracket.html", "_blank");
  });
}

// レート表トグル
if (els.toggleRate && els.rateTableWrap) {
  els.toggleRate.addEventListener("click", () => {
    const showing = els.rateTableWrap.style.display !== "none";
    els.rateTableWrap.style.display = showing ? "none" : "";
    els.toggleRate.textContent = showing ? "詳細を表示" : "詳細を隠す";
  });
}

els.addBtn.addEventListener("click", () => {
  const name = els.name.value.trim();
  if (!name) return alert("名前を入力してください");
  if (players.length >= 20) return alert("最大20人までです");

  const tier = els.tier.value;
  const division = isMasterPlus(tier) ? null : els.division.value;
  const main = els.mainLane.value;
  const subs = getSubLanes(els.subLane1, els.subLane2);
  const v = validateSubs(main, subs);
  if (!v.ok) return alert(v.msg);

  players.push({
    id: makeId(),
    name,
    rank: { tier, division },
    mainLane: main,
    subLanes: v.subs,
  });

  els.name.value = "";
  renderList();
  clearResult();
  savePlayers();
});

els.resetBtn.addEventListener("click", () => {
  if (!confirm("全消去しますか？")) return;
  players = [];
  renderList();
  clearResult();
  savePlayers();
});

els.list.addEventListener("click", (e) => {
  if (!e.target.classList.contains("delBtn")) return;
  const id = e.target.dataset.id;
  players = players.filter(p => p.id !== id);
  renderList();
  clearResult();
  savePlayers();
});

// まとめて追加
function parseLine(line) {
  const cols = line.split(",").map(s => s.trim()).filter(Boolean);
  if (cols.length < 5) return { ok: false, msg: "列数が足りません（名前, tier, division(省略可), メイン, サブ1, (サブ2省略可))" };

  const [name, tierRaw, divOrMain, maybeMainOrSub1, ...rest] = cols;
  if (!name) return { ok: false, msg: "名前が空です" };

  const tier = tierRaw.toUpperCase();
  const isMaster = isMasterPlus(tier);

  let division = null;
  let main;
  let subs;

  if (isMaster) {
    // division省略可: [name, tier, main, sub1, sub2?]
    main = divOrMain.toUpperCase();
    subs = [maybeMainOrSub1?.toUpperCase(), ...rest.map(s => s.toUpperCase())].filter(Boolean);
  } else {
    // division必須: [name, tier, division, main, sub1, sub2?]
    division = divOrMain.toUpperCase();
    main = maybeMainOrSub1.toUpperCase();
    subs = rest.map(s => s.toUpperCase());
  }

  const v = validateSubs(main, subs);
  if (!v.ok) return { ok: false, msg: v.msg };

  return {
    ok: true,
    player: {
      id: makeId(),
      name,
      rank: { tier, division },
      mainLane: main,
      subLanes: v.subs,
    },
  };
}

els.bulkAddBtn.addEventListener("click", () => {
  const text = els.bulkInput.value.trim();
  if (!text) return alert("入力が空です");

  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return alert("有効な行がありません");

  const adds = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const r = parseLine(line);
    if (!r.ok) return alert(`ライン${i + 1}: "${line}" でエラー: ${r.msg}`);
    adds.push(r.player);
  }

  if (players.length + adds.length > 20) return alert("最大20人までです");

  players = players.concat(adds);
  renderList();
  clearResult();
  els.bulkInput.value = "";
  savePlayers();
});

// JSONエクスポート
if (els.exportBtn) {
  els.exportBtn.addEventListener("click", () => {
    if (!players || players.length === 0) {
      alert("エクスポートする参加者がありません");
      return;
    }
    const blob = new Blob([JSON.stringify(players, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "players.json";
    a.click();
    URL.revokeObjectURL(url);
  });
}

// JSONインポート
if (els.importBtn && els.importFile) {
  els.importBtn.addEventListener("click", () => {
    els.importFile.value = "";
    els.importFile.click();
  });
  els.importFile.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!Array.isArray(parsed)) throw new Error("配列ではありません");
        const mapped = parsed.map(p => ({
          id: makeId(),
          name: p.name,
          rank: p.rank,
          mainLane: p.mainLane,
          subLanes: Array.isArray(p.subLanes) ? p.subLanes : [],
        })).filter(p => p.name && p.rank && p.mainLane);
        if (mapped.length === 0) throw new Error("有効なプレイヤーがありません");
        if (mapped.length > 20) throw new Error("最大20人までです");
        players = mapped;
        renderList();
        clearResult();
        savePlayers();
      } catch (err) {
        alert(`インポート失敗: ${err.message || err}`);
      }
    };
    reader.readAsText(file);
  });
}

// チームJSONエクスポート
if (els.teamExportBtn) {
  els.teamExportBtn.addEventListener("click", () => {
    if (!lastTeams || lastTeams.length === 0) {
      alert("エクスポートするチームがありません（先にチーム作成してください）");
      return;
    }
    const blob = new Blob([JSON.stringify(serializeTeams(lastTeams), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "teams.json";
    a.click();
    URL.revokeObjectURL(url);
  });
}

// チームJSONインポート
if (els.teamImportBtn && els.teamImportFile) {
  els.teamImportBtn.addEventListener("click", () => {
    els.teamImportFile.value = "";
    els.teamImportFile.click();
  });
  els.teamImportFile.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!Array.isArray(parsed)) throw new Error("teams配列が必要です");
        const teams = parsed.map(t => ({
          slots: Object.fromEntries(LANES.map(l => {
            const p = t.slots?.[l];
            if (!p) return [l, null];
            return [l, {
              id: makeId(),
              name: p.name,
              rank: p.rank,
              mainLane: p.mainLane,
              subLanes: Array.isArray(p.subLanes) ? p.subLanes : [],
              assignedLane: p.assignedLane || l,
              score: p.score,
            }];
          })),
        }));
        lastTeams = teams;
        renderTeamsResult(teams, "インポート済み");
        const overflow = $("overflowInfo");
        if (overflow) overflow.textContent = "チームをインポートしました";
        // プレイヤー一覧にも同期
        const mergedPlayers = [];
        const byName = new Set();
        for (const team of teams) {
          for (const lane of LANES) {
            const p = team.slots[lane];
            if (!p || byName.has(p.name)) continue;
            byName.add(p.name);
            mergedPlayers.push({
              id: makeId(),
              name: p.name,
              rank: p.rank,
              mainLane: p.mainLane || lane,
              subLanes: Array.isArray(p.subLanes) ? p.subLanes : [],
            });
          }
        }
        players = mergedPlayers.slice(0, 20);
        renderList();
        savePlayers();
      } catch (err) {
        alert(`チームインポート失敗: ${err.message || err}`);
      }
    };
    reader.readAsText(file);
  });
}

/* ===============================
   チーム作成（マッチアップ考慮版）
=============================== */
function emptyTeams(teamCount) {
  return Array.from({ length: teamCount }, () => ({
    slots: { TOP: null, JG: null, MID: null, ADC: null, SUP: null },
  }));
}

function teamTotals(teams) {
  return teams.map(team => Object.values(team.slots)
    .filter(Boolean)
    .reduce((sum, p) => sum + p.score, 0));
}

function matchupCost(teams) {
  // 各レーンで最大-最小を集計（対面差を表す）
  let cost = 0;
  for (const lane of LANES) {
    const scores = teams
      .map(team => team.slots[lane]?.score)
      .filter(s => typeof s === "number");
    if (scores.length < 2) continue;
    cost += Math.max(...scores) - Math.min(...scores);
  }
  return cost;
}

function evaluateCost(teams, weight) {
  const totals = teamTotals(teams);
  if (totals.length < 2) return { cost: 0, laneCost: 0, spread: 0 };
  const spread = Math.max(...totals) - Math.min(...totals);
  const laneCost = matchupCost(teams);
  // weight: 0〜4（5段階）
  const w = Math.max(0, Math.min(4, Number(weight)));

  // 重み計算（最大をlexicographic近似に）
  const laneWeight = Math.pow(w + 1, 2);  // 1〜25
  const spreadWeight = (4 - w) + 1;       // 5〜1

  const laneFirstCost = (laneCost * 1_000_000) + spread; // lane差優先、同差ならspread比較

  return w >= 4
    ? { cost: laneFirstCost, laneCost, spread }
    : { cost: (laneCost * laneWeight) + (spread * spreadWeight), laneCost, spread };
}

function cloneTeams(teams) {
  return teams.map(team => ({
    slots: Object.fromEntries(LANES.map(l => [l, team.slots[l]])),
  }));
}

function assignTeams(players, teamCount, weight, strictOnly) {
  const baseList = players.map(p => ({
    ...p,
    baseScore: rankToScore(p.rank),
  }));

  // 基本は強い順、複数試行でより良い割当を探索
  const sorted = [...baseList].sort((a, b) => b.baseScore - a.baseScore);

  function greedy(order) {
    const teams = emptyTeams(teamCount);
    const unassigned = [];
    for (const p of order) {
      let best = { cost: Infinity, teamIdx: 0, lane: "TOP" };
      for (let ti = 0; ti < teamCount; ti++) {
        for (const lane of LANES) {
          if (teams[ti].slots[lane]) continue;
          if (strictOnly && lane !== p.mainLane && !p.subLanes.includes(lane)) continue;
          const score = effectiveScore(p.baseScore, lane, p.mainLane, p.subLanes);
          const next = cloneTeams(teams);
          next[ti].slots[lane] = { ...p, assignedLane: lane, score };
          const { cost } = evaluateCost(next, weight);
          if (cost < best.cost) {
            best = { cost, teamIdx: ti, lane, score };
          }
        }
      }
      if (best.cost === Infinity) {
        unassigned.push(p);
      } else {
        teams[best.teamIdx].slots[best.lane] = { ...p, assignedLane: best.lane, score: best.score };
      }
    }
    return { teams, unassigned };
  }

  let bestTeams = null;
  let bestUnassigned = [];
  let bestCost = Infinity;
  const trials = 25;

  for (let i = 0; i < trials; i++) {
    const order = i === 0 ? sorted : shuffle(sorted);
    const { teams, unassigned } = greedy(order);
    const { cost } = evaluateCost(teams, weight);
    if (cost < bestCost) {
      bestCost = cost;
      bestTeams = teams;
      bestUnassigned = unassigned;
    }
  }

  if (bestTeams) return { teams: bestTeams, unassigned: bestUnassigned };
  const fallback = greedy(sorted);
  return { teams: fallback.teams, unassigned: fallback.unassigned };
}

els.buildBtn.addEventListener("click", () => {
  const t = Number(els.teamCount.value);
  const need = needSize(t);
  if (players.length < need) {
    alert(`${need}人必要です`);
    return;
  }

  const weight = Number(els.weight.value);
  const strictOnly = !!(els.strictLane && els.strictLane.checked);

  // 余剰がある場合は上位need人を使用（簡易抽出）
  const sorted = players
    .slice()
    .sort((a, b) => rankToScore(b.rank) - rankToScore(a.rank));

  const selected = sorted.slice(0, need);
  const overflowPlayers = sorted.slice(need);

  const { teams, unassigned } = assignTeams(selected, t, weight, strictOnly);
  lastTeams = teams;
  renderTeamsResult(teams, `作成完了 / W:${weight}`);

  const overflow = $("overflowInfo");
  if (overflow) {
    const msgs = [];
    if (overflowPlayers.length > 0) {
      msgs.push(`抽出されなかった参加者: ${overflowPlayers.map(p => p.name).join(", ")}`);
    }
    if (unassigned && unassigned.length > 0) {
      msgs.push(`割り当てできなかった参加者: ${unassigned.map(p => p.name).join(", ")}`);
    }
    overflow.textContent = msgs.join(" / ");
  }
});

/* ===============================
   初期化
=============================== */
updateDivisionVisibility();
syncWeightLabel();
renderList();
clearResult();
renderScoreTable();
renderRateSummary();