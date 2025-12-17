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

// Master+ は MVPとして固定値（必要ならLP拡張）
const MASTER_PLUS_BONUS = 120;

/* ===============================
   DOM
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
let players = []; // {id,name,rank:{tier,division|null}, mainLane, subLane}

/* ===============================
   Rank -> internal score
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
    if (idx === -1) throw new Error("Unknown tier: " + tier);
    const div = String(rank.division || "IV").toUpperCase();
    if (!(div in DIV_OFFSET)) throw new Error("Unknown division: " + div);
    return idx * TIER_STEP + DIV_OFFSET[div];
}

function effectiveScore(baseScore, assignedLane, mainLane, subLane) {
    return (assignedLane === mainLane || assignedLane === subLane)
        ? baseScore
        : baseScore - OFFLANE_PENALTY;
}

/* ===============================
   UI helpers
=============================== */
function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
    }[c]));
}

function needSize(teamCount) {
    return Number(teamCount) * 5; // 2->10, 3->15, 4->20
}

function rankLabel(p) {
    if (isMasterPlus(p.rank.tier)) return p.rank.tier;
    return `${p.rank.tier} ${p.rank.division}`;
}

function updateDivisionVisibility() {
    els.divisionWrap.style.display = isMasterPlus(els.tier.value) ? "none" : "";
}

function updateWeightLabel() {
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
      <td>${escapeHtml(p.name)}</td>
      <td class="mono">${escapeHtml(rankLabel(p))}</td>
      <td class="mono">${escapeHtml(p.mainLane)} / ${escapeHtml(p.subLane)}</td>
      <td>
        <div class="actions">
          <button class="secondary" data-act="edit" data-id="${p.id}">編集</button>
          <button class="secondary" data-act="del" data-id="${p.id}">削除</button>
        </div>
      </td>
    `;
        els.list.appendChild(tr);
    }

    const n = players.length;
    const t = Number(els.teamCount.value);
    const need = needSize(t);
    const max = 20;

    if (n > max) {
        els.countHint.textContent = `参加者が${max}人を超えています（現在 ${n}人）→ 追加を控えてください`;
    } else if (n < need) {
        els.countHint.textContent = `現在 ${n}人（${t}チーム作成には ${need}人必要）`;
    } else if (n === need) {
        els.countHint.textContent = `現在 ${n}人（ちょうど${t}チーム分です）`;
    } else {
        els.countHint.textContent = `現在 ${n}人（${need}人を自動抽出します）`;
    }
}

function clearResult() {
    els.meta.textContent = "未作成";
    els.resultArea.innerHTML = `<div class="hint">参加者を追加して「チーム作成」を押してください。</div>`;
}

/* ===============================
   イベント
=============================== */
els.tier.addEventListener("change", updateDivisionVisibility);
function syncWeightLabelForce() {
    const slider = document.getElementById("weight");
    if (!slider) return;

    // id重複があっても全部更新（本来idは一意だけど、現場ではこれが強い）
    const labels = document.querySelectorAll('[id="wLabel"]');
    labels.forEach(label => {
        // textContentだけで反映されない環境対策で両方書く
        label.textContent = String(slider.value);
        label.innerText = String(slider.value);
    });
}

// input/changeを両方拾う
document.addEventListener("input", (e) => {
    if (e.target && e.target.id === "weight") syncWeightLabelForce();
});
document.addEventListener("change", (e) => {
    if (e.target && e.target.id === "weight") syncWeightLabelForce();
});

// 初期同期
syncWeightLabelForce();


els.teamCount.addEventListener("change", () => {
    renderList();
    clearResult();
});

els.addBtn.addEventListener("click", () => {
    const name = els.name.value.trim();
    if (!name) return alert("名前を入力してください");
    if (players.length >= 20) return alert("MVP仕様: 最大20人までです");

    const tier = els.tier.value;
    const division = isMasterPlus(tier) ? null : els.division.value;

    const mainLane = els.mainLane.value;
    const subLane = els.subLane.value;
    if (mainLane === subLane) return alert("メインとサブは別レーンにしてください");

    players.push({
        id: makeId(),
        name,
        rank: { tier, division },
        mainLane,
        subLane,
    });

    els.name.value = "";
    renderList();
    clearResult();
});

els.resetBtn.addEventListener("click", () => {
    if (!confirm("参加者を全消去しますか？")) return;
    players = [];
    renderList();
    clearResult();
});

els.list.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    const id = btn.dataset.id;
    const act = btn.dataset.act;
    const idx = players.findIndex(p => p.id === id);
    if (idx === -1) return;

    if (act === "del") {
        players.splice(idx, 1);
        renderList();
        clearResult();
        return;
    }

    if (act === "edit") {
        const p = players[idx];

        const newName = prompt("名前", p.name);
        if (newName === null) return;
        const n = newName.trim();
        if (!n) return;

        p.name = n;
        players[idx] = p;
        renderList();
    }
});

els.buildBtn.addEventListener("click", () => {
    const t = Number(els.teamCount.value);
    const need = needSize(t);

    if (players.length < need) {
        alert(`人数不足: ${t}チーム作成には ${need}人必要です`);
        return;
    }

    const weight = Number(els.weight.value);

    // 内部用に baseScore 付与
    const ps = players.map(p => ({
        ...p,
        baseScore: rankToScore(p.rank),
    }));

    const result = buildTeams(ps, t, weight);

    // 描画
    renderResult(result, t, weight);
});

/* ===============================
   コアロジック
=============================== */

/**
 * 2チーム(10人)は厳密探索（品質重視）
 * それ以外（3/4チーム、または抽出が必要）は高速ヒューリスティック
 */
function buildTeams(ps, teamCount, matchupWeight) {
    const need = needSize(teamCount);

    // まず抽出（必要人数より多い場合）
    const selected = selectPlayers(ps, need, teamCount, matchupWeight);

    // 厳密探索：ちょうど10人・2チーム
    if (teamCount === 2 && selected.length === 10) {
        return exactTwoTeamsWithMatchups(selected, matchupWeight);
    }

    // ヒューリスティック：3/4チーム、または抽出が絡む
    return heuristicMultiTeams(selected, teamCount, matchupWeight);
}

/**
 * 自動抽出:
 * - 2チーム(10人)で人数が多い場合:
 *   nC10 が重い時があるので「候補サンプリング + 局所最適」の実装にしてあります。
 * - 3/4チームは必要人数が大きく、組合せが比較的マシなので、軽めのサンプリングでOK。
 */
function selectPlayers(all, need, teamCount, matchupWeight) {
    if (all.length === need) return all.slice();

    // まず強さ順にして「明らかに遠い外れ値」を減らす（探索の安定化）
    const sorted = all.slice().sort((a, b) => b.baseScore - a.baseScore);

    // 参加者上限が20なので、基本は全員からでもOKだが、
    // 2チームで 20C10 = 184,756 は厳密評価だと重い可能性があるためサンプリングする。
    const n = sorted.length;

    // まず「中央付近を優先」するために、中央値近辺を厚めに残す
    // （例：20人中、上位/下位を少し落として16人プールにする）
    let pool = sorted;
    if (n > need) {
        // プールサイズは need+6 を目安（10→16, 15→20, 20→20）
        const targetPool = Math.min(n, need + 6);
        if (targetPool < n) {
            const cut = n - targetPool;
            const cutTop = Math.floor(cut / 2);
            const cutBottom = cut - cutTop;
            pool = sorted.slice(cutTop, n - cutBottom);
        }
    }

    if (pool.length === need) return pool;

    // サンプリングして最良の subset を選ぶ
    const SAMPLES = (teamCount === 2) ? 2500 : 1200; // 体感で軽い設定
    let best = null;

    // まず「スコアが近い」候補を作るため、ランダム + 近傍入替を混ぜる
    for (let s = 0; s < SAMPLES; s++) {
        const subset = randomSubset(pool, need);

        // subsetを軽くヒューリスティック評価してスコア算出
        const quick = quickScore(subset, teamCount, matchupWeight);

        if (!best || quick.score < best.score) {
            best = { score: quick.score, subset };
        }
    }

    return best.subset;
}

/**
 * 速い評価（抽出用）
 * - 2チーム: 総合スコア（baseのみ）を均等化する簡易
 * - 3/4チーム: greedy割当のspreadで簡易
 */
function quickScore(subset, teamCount, matchupWeight) {
    if (teamCount === 2) {
        const arr = subset.map(p => p.baseScore).sort((a, b) => b - a);
        // ざっくり：上から交互に配る
        let s1 = 0, s2 = 0;
        for (let i = 0; i < arr.length; i++) (i % 2 === 0 ? s1 : s2) += arr[i];
        return { score: Math.abs(s1 - s2) };
    }

    // 3/4チームは greedy の spread
    const teams = Array.from({ length: teamCount }, () => ({ sum: 0, count: 0 }));
    const arr = subset.slice().sort((a, b) => b.baseScore - a.baseScore);
    for (const p of arr) {
        teams.sort((a, b) => a.sum - b.sum || a.count - b.count);
        const t = teams.find(x => x.count < 5);
        t.sum += p.baseScore;
        t.count += 1;
    }
    const sums = teams.map(t => t.sum);
    const spread = Math.max(...sums) - Math.min(...sums);
    return { score: spread };
}

/* ====== 厳密探索（2チーム） ====== */
function exactTwoTeamsWithMatchups(players10, matchupWeight) {
    const idxs = [...Array(10).keys()];
    const combs = combinations(idxs, 5);

    let best = null;

    for (const aIdxs of combs) {
        const aSet = new Set(aIdxs);
        const bIdxs = idxs.filter(i => !aSet.has(i));

        const A = aIdxs.map(i => players10[i]);
        const B = bIdxs.map(i => players10[i]);

        // A/Bのレーン割当を総当たりし、対面差も含めて評価
        const r = bestMatchupAssignments(A, B, matchupWeight);

        if (!best || r.score < best.score) best = r;
        if (best && best.score === 0) break;
    }

    // best は A/B が lane順の rows を持つ形に統一して返す
    return {
        mode: "exact",
        selected: players10,
        teams: [
            { name: "Team A", rows: best.A.rows, sum: best.A.sum },
            { name: "Team B", rows: best.B.rows, sum: best.B.sum },
        ],
        matchups: [
            { aName: "Team A", bName: "Team B", laneDiffs: best.laneDiffs, laneDiffMax: best.laneDiffMax, teamDiff: best.teamDiff }
        ],
        summary: {
            teamSpread: best.teamDiff,
            maxLaneDiff: best.laneDiffMax,
            score: best.score,
        }
    };
}

function bestMatchupAssignments(teamAPlayers, teamBPlayers, matchupWeight) {
    const perms = permutationsHeap(LANES);

    let best = null;

    for (const lanesA of perms) {
        // Aレーン別スコア
        const aLaneScore = new Map();
        let sumA = 0;
        const aRows = [];
        for (let i = 0; i < 5; i++) {
            const p = teamAPlayers[i];
            const lane = lanesA[i];
            const eff = effectiveScore(p.baseScore, lane, p.mainLane, p.subLane);
            sumA += eff;
            aLaneScore.set(lane, eff);
            aRows.push({ lane, player: p, eff });
        }

        for (const lanesB of perms) {
            const bLaneScore = new Map();
            let sumB = 0;
            const bRows = [];
            for (let i = 0; i < 5; i++) {
                const p = teamBPlayers[i];
                const lane = lanesB[i];
                const eff = effectiveScore(p.baseScore, lane, p.mainLane, p.subLane);
                sumB += eff;
                bLaneScore.set(lane, eff);
                bRows.push({ lane, player: p, eff });
            }

            const teamDiff = Math.abs(sumA - sumB);

            let laneDiffMax = 0;
            const laneDiffs = [];
            for (const lane of LANES) {
                const d = Math.abs(aLaneScore.get(lane) - bLaneScore.get(lane));
                laneDiffMax = Math.max(laneDiffMax, d);
                laneDiffs.push({ lane, a: aLaneScore.get(lane), b: bLaneScore.get(lane), diff: d });
            }

            const score = teamDiff + matchupWeight * laneDiffMax;

            if (!best || score < best.score) {
                aRows.sort((x, y) => LANES.indexOf(x.lane) - LANES.indexOf(y.lane));
                bRows.sort((x, y) => LANES.indexOf(x.lane) - LANES.indexOf(y.lane));
                laneDiffs.sort((x, y) => LANES.indexOf(x.lane) - LANES.indexOf(y.lane));

                best = {
                    score,
                    teamDiff,
                    laneDiffMax,
                    laneDiffs,
                    A: { sum: sumA, rows: aRows },
                    B: { sum: sumB, rows: bRows },
                };
            }
        }
    }

    return best;
}

/* ====== ヒューリスティック（3/4チーム or 抽出あり） ====== */
function heuristicMultiTeams(selected, teamCount, matchupWeight) {
    // 1) 初期分割（強い順に、合計が小さいチームへ）
    const arr = selected.slice().sort((a, b) => b.baseScore - a.baseScore);
    let teams = Array.from({ length: teamCount }, (_, i) => ({ name: `Team ${i + 1}`, members: [] }));

    for (const p of arr) {
        teams.sort((a, b) => sumBase(a.members) - sumBase(b.members));
        const t = teams.find(x => x.members.length < 5);
        t.members.push(p);
    }

    // 2) 各チームのベストレーン割当（対面は一旦無視してチーム内最大化）
    teams = teams.map(t => assignBestLanesForOneTeam(t, matchupWeight));

    // 3) 目的関数: teamSpread + matchupWeight*(pairingのlaneDiffMax合計)
    //    pairing: (1vs2), (3vs4) / 3チームは(1vs2)のみ表示
    const evalObj = (teamsNow) => objectiveTeams(teamsNow, matchupWeight);

    let best = { teams: deepCopyTeams(teams), ...evalObj(teams) };

    // 4) ローカルサーチ（スワップ改善）
    //    ほどほど回して安定させる
    const ITER = 6000;
    for (let it = 0; it < ITER; it++) {
        const curTeams = best.teams;

        // ランダムに2チーム選んで1人交換
        const a = randInt(0, teamCount - 1);
        let b = randInt(0, teamCount - 1);
        if (b === a) b = (b + 1) % teamCount;

        const tA = curTeams[a];
        const tB = curTeams[b];

        const ia = randInt(0, 4);
        const ib = randInt(0, 4);

        const nextTeams = deepCopyTeams(curTeams);

        // swap
        const tmp = nextTeams[a].members[ia];
        nextTeams[a].members[ia] = nextTeams[b].members[ib];
        nextTeams[b].members[ib] = tmp;

        // 再割当（交換した2チームだけ再計算）
        nextTeams[a] = assignBestLanesForOneTeam(nextTeams[a], matchupWeight);
        nextTeams[b] = assignBestLanesForOneTeam(nextTeams[b], matchupWeight);

        const scoreNext = objectiveTeams(nextTeams, matchupWeight);

        // 改善したら採用
        if (scoreNext.score < best.score) {
            best = { teams: nextTeams, ...scoreNext };
        }
    }

    return {
        mode: "heuristic",
        selected,
        teams: best.teams.map((t, i) => ({ name: t.name, rows: t.rows, sum: t.sum })),
        matchups: buildMatchups(best.teams),
        summary: {
            teamSpread: best.teamSpread,
            maxLaneDiff: best.maxLaneDiff,
            score: best.score,
        }
    };
}

function assignBestLanesForOneTeam(team) {
    // 5人->5レーンの割当(120通り)で有効合計最大
    const perms = permutationsHeap(LANES);
    let best = null;

    for (const lanes of perms) {
        let sum = 0;
        const rows = [];
        for (let i = 0; i < 5; i++) {
            const p = team.members[i];
            const lane = lanes[i];
            const eff = effectiveScore(p.baseScore, lane, p.mainLane, p.subLane);
            sum += eff;
            rows.push({ lane, player: p, eff });
        }
        if (!best || sum > best.sum) best = { sum, rows };
    }

    best.rows.sort((a, b) => LANES.indexOf(a.lane) - LANES.indexOf(b.lane));

    return {
        ...team,
        sum: best.sum,
        rows: best.rows
    };
}

function objectiveTeams(teams, matchupWeight) {
    const sums = teams.map(t => t.sum);
    const teamSpread = Math.max(...sums) - Math.min(...sums);

    const matchups = buildMatchups(teams);
    const maxLaneDiff = matchups.length
        ? Math.max(...matchups.map(m => m.laneDiffMax))
        : 0;

    // スコア：チーム間のばらつき + 対面最大差（ペアごとの最大）を合算
    const matchupPenalty = (matchupWeight > 0)
        ? matchups.reduce((acc, m) => acc + m.laneDiffMax, 0)
        : 0;

    const score = teamSpread + matchupWeight * matchupPenalty;

    return { teamSpread, maxLaneDiff, score };
}

/* ===============================
   描画
=============================== */
function renderResult(result, teamCount, weight) {
    const used = result.selected.length;
    const need = needSize(teamCount);

    const modeLabel = (result.mode === "exact")
        ? "厳密探索"
        : "高速最適化";

    els.meta.textContent =
        `${modeLabel} / 使用: ${used}人（必要: ${need}人） / spread: ${result.summary.teamSpread} / maxLaneDiff: ${result.summary.maxLaneDiff} / score: ${result.summary.score} / W:${weight}`;

    // チーム表示
    const teamsHtml = `
    <div class="teamsGrid">
      ${result.teams.map((t, idx) => renderTeamCard(t, idx)).join("")}
    </div>
  `;

    // 対面（ペア戦）表示
    const matchupsHtml = result.matchups.length
        ? `
      <div class="matchups">
        ${result.matchups.map(m => renderMatchupCard(m)).join("")}
      </div>
    `
        : `<div class="hint">対面表示：チーム数が3の場合は Team1 vs Team2 のみ表示します。</div>`;

    els.resultArea.innerHTML = teamsHtml + matchupsHtml;
}

function renderTeamCard(team, idx) {
    const rows = team.rows.map(r => {
        const p = r.player;
        const fit = (r.lane === p.mainLane || r.lane === p.subLane) ? "main/sub" : "tier-2";
        const fitClass = (fit === "main/sub") ? "fitGood" : "fitWarn";
        return `
      <tr>
        <td class="mono">${r.lane}</td>
        <td>${escapeHtml(p.name)}</td>
        <td class="mono">${escapeHtml(rankLabel(p))}</td>
        <td class="mono ${fitClass}">${fit}</td>
      </tr>
    `;
    }).join("");

    return `
    <div class="teamCard">
      <div class="teamHead">
        <h3>${escapeHtml(team.name)}</h3>
        <span class="badge">合計(有効): <span class="mono">${team.sum}</span></span>
      </div>
      <table>
        <thead>
          <tr><th>Lane</th><th>Player</th><th>Rank</th><th>fit</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="hint mt10">※ fit=tier-2 はメイン/サブ以外のため <span class="mono">-2division</span> で計算</div>
    </div>
  `;
}

function renderMatchupCard(m) {
    const rows = m.laneDiffs.map(d => `
    <tr>
      <td class="mono">${d.lane}</td>
      <td class="mono">${d.a}</td>
      <td class="mono">${d.b}</td>
      <td class="mono">${d.diff}</td>
    </tr>
  `).join("");

    return `
    <div class="matchupCard mt14">
      <div class="teamHead">
        <h3>${escapeHtml(m.aName)} vs ${escapeHtml(m.bName)}</h3>
        <span class="badge">teamDiff: <span class="mono">${m.teamDiff}</span> / laneMax: <span class="mono">${m.laneDiffMax}</span></span>
      </div>
      <table>
        <thead><tr><th>Lane</th><th>${escapeHtml(m.aName)}</th><th>${escapeHtml(m.bName)}</th><th>Diff</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="hint mt10">※ 対面差は「各レーンの有効スコア差」です</div>
    </div>
  `;
}

/* ===============================
   対面の作り方（最大4チーム）
   - 2チーム: 1vs2
   - 3チーム: 1vs2 を表示（3は回転用）
   - 4チーム: 1vs2 と 3vs4 を表示
=============================== */
function buildMatchups(teams) {
    if (teams.length < 2) return [];

    const pairs = [];
    if (teams.length === 2) pairs.push([0, 1]);
    if (teams.length === 3) pairs.push([0, 1]);
    if (teams.length === 4) pairs.push([0, 1], [2, 3]);

    return pairs.map(([a, b]) => matchupInfo(teams[a], teams[b]));
}

function matchupInfo(teamA, teamB) {
    const aMap = new Map(teamA.rows.map(r => [r.lane, r.eff]));
    const bMap = new Map(teamB.rows.map(r => [r.lane, r.eff]));

    const laneDiffs = LANES.map(lane => {
        const a = aMap.get(lane);
        const b = bMap.get(lane);
        const diff = Math.abs(a - b);
        return { lane, a, b, diff };
    });

    const laneDiffMax = Math.max(...laneDiffs.map(x => x.diff));
    const teamDiff = Math.abs(teamA.sum - teamB.sum);

    return {
        aName: teamA.name,
        bName: teamB.name,
        laneDiffs,
        laneDiffMax,
        teamDiff
    };
}

/* ===============================
   ユーティリティ
=============================== */

// 組合せ（nCk）: n<=20で使う
function combinations(arr, k) {
    const res = [];
    const combo = [];
    function dfs(start) {
        if (combo.length === k) { res.push(combo.slice()); return; }
        for (let i = start; i <= arr.length - (k - combo.length); i++) {
            combo.push(arr[i]);
            dfs(i + 1);
            combo.pop();
        }
    }
    dfs(0);
    return res;
}

// 5! の順列（Heap's algorithmで高速）
function permutationsHeap(arr) {
    const a = arr.slice();
    const res = [];
    function heap(n) {
        if (n === 1) { res.push(a.slice()); return; }
        heap(n - 1);
        for (let i = 0; i < n - 1; i++) {
            const j = (n % 2 === 0) ? i : 0;
            [a[j], a[n - 1]] = [a[n - 1], a[j]];
            heap(n - 1);
        }
    }
    heap(a.length);
    return res;
}

function sumBase(members) {
    return members.reduce((acc, p) => acc + p.baseScore, 0);
}

function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomSubset(arr, k) {
    const a = arr.slice();
    // Fisher–Yates shuffle（先頭kだけ使う）
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a.slice(0, k);
}

function deepCopyTeams(teams) {
    return teams.map(t => ({
        name: t.name,
        members: t.members.slice(),
        sum: t.sum,
        rows: t.rows ? t.rows.map(r => ({ lane: r.lane, player: r.player, eff: r.eff })) : undefined,
    }));
}

// ===== weightラベルの強制同期（イベント委譲で確実に動かす）=====
function syncWeightLabelForce() {
    const slider = document.getElementById("weight");
    const label = document.getElementById("wLabel");
    if (!slider || !label) return;
    label.textContent = String(slider.value);
}

// スライダー操作中に確実に反映
document.addEventListener("input", (e) => {
    if (e.target && e.target.id === "weight") syncWeightLabelForce();
});

// クリックなどで値が変わった時も反映
document.addEventListener("change", (e) => {
    if (e.target && e.target.id === "weight") syncWeightLabelForce();
});

function makeId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
}

// 初期表示
syncWeightLabelForce();


/* ===============================
   初期化
=============================== */
updateDivisionVisibility();
renderList();
syncWeightLabelForce();
clearResult();
