"use strict";

const app = document.getElementById("app");
const shockAudio = document.getElementById("shock-audio");
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const defaultNames = ["プレイヤー1", "プレイヤー2"];
const playerClasses = ["p1", "p2"];

const gameState = {
  players: [
    { id: 0, name: "プレイヤー1", score: 0, shocks: 0, history: [] },
    { id: 1, name: "プレイヤー2", score: 0, shocks: 0, history: [] }
  ],
  firstSetterIndex: 0,
  trapSetterIndex: 0,
  sitterIndex: 1,
  availableChairs: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  electricChair: null,
  selectedChair: null,
  turn: 1,
  phase: "setup",
  timerSeconds: 180,
  timerEndAt: null,
  timerIntervalId: null,
  soundEnabled: true,
  reducedFlash: prefersReducedMotion.matches,
  locked: false,
  lastResult: null,
  gameResult: null
};

if (shockAudio) {
  shockAudio.volume = 0.7;
}

window.addEventListener("popstate", () => {
  history.pushState(null, "", location.href);
});
history.replaceState(null, "", location.href);
history.pushState(null, "", location.href);

function startGame() {
  const name1 = document.getElementById("player1-name")?.value.trim() || defaultNames[0];
  const name2 = document.getElementById("player2-name")?.value.trim() || defaultNames[1];
  const firstSetter = Number(document.getElementById("first-setter")?.value || "0");
  gameState.players[0].name = name1;
  gameState.players[1].name = name2;
  resetGame(false);
  gameState.firstSetterIndex = firstSetter;
  gameState.trapSetterIndex = firstSetter;
  gameState.sitterIndex = firstSetter === 0 ? 1 : 0;
  startTurn();
}

function resetGame(keepPhase = true) {
  stopTimer();
  gameState.players.forEach((player) => {
    player.score = 0;
    player.shocks = 0;
    player.history = [];
  });
  gameState.availableChairs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  gameState.electricChair = null;
  gameState.selectedChair = null;
  gameState.turn = 1;
  gameState.timerSeconds = 180;
  gameState.timerEndAt = null;
  gameState.locked = false;
  gameState.lastResult = null;
  gameState.gameResult = null;
  if (keepPhase) {
    gameState.phase = "trap-selection";
    gameState.trapSetterIndex = 0;
    gameState.sitterIndex = 1;
  }
}

function startTurn() {
  stopTimer();
  gameState.phase = "trap-selection";
  gameState.electricChair = null;
  gameState.selectedChair = null;
  gameState.locked = false;
  render();
}

function selectChair(number) {
  if (gameState.locked || !["trap-selection", "chair-selection"].includes(gameState.phase)) return;
  if (!gameState.availableChairs.includes(number)) return;
  gameState.selectedChair = number;
  render();
}

function confirmTrap() {
  if (gameState.locked || gameState.phase !== "trap-selection" || gameState.selectedChair === null) return;
  gameState.locked = true;
  gameState.electricChair = gameState.selectedChair;
  gameState.selectedChair = null;
  showHandoverScreen();
}

function showHandoverScreen() {
  gameState.phase = "handover";
  gameState.locked = false;
  render();
}

function startChairSelection() {
  if (gameState.phase !== "handover") return;
  gameState.phase = "chair-selection";
  gameState.selectedChair = null;
  gameState.locked = false;
  startTimer();
  render();
}

function confirmChair() {
  if (gameState.locked || gameState.phase !== "chair-selection" || gameState.selectedChair === null) return;
  gameState.locked = true;
  gameState.phase = "judging";
  stopTimer();
  render();
  judgeResult();
}

function judgeResult() {
  const shocked = gameState.selectedChair === gameState.electricChair;
  if (shocked) {
    applyShockResult();
    playShockEffect().then(showTurnOrGameResult);
    return;
  }
  applySafeResult();
  window.setTimeout(showTurnOrGameResult, 260);
}

function applySafeResult() {
  const player = gameState.players[gameState.sitterIndex];
  const chair = gameState.selectedChair;
  player.score += chair;
  player.history.push(String(chair));
  gameState.players[gameState.trapSetterIndex].history.push("-");
  gameState.availableChairs = gameState.availableChairs.filter((number) => number !== chair);
  gameState.lastResult = {
    type: "safe",
    chair,
    points: chair,
    playerIndex: gameState.sitterIndex
  };
}

function applyShockResult() {
  const player = gameState.players[gameState.sitterIndex];
  const chair = gameState.selectedChair;
  player.score = 0;
  player.shocks += 1;
  player.history.push("⚡");
  gameState.players[gameState.trapSetterIndex].history.push("-");
  gameState.lastResult = {
    type: "shock",
    chair,
    points: 0,
    playerIndex: gameState.sitterIndex
  };
}

function showTurnOrGameResult() {
  const result = checkGameEnd();
  gameState.locked = false;
  if (result) {
    gameState.gameResult = result;
    gameState.phase = "game-result";
  } else {
    gameState.phase = "turn-result";
  }
  render();
}

function checkGameEnd() {
  const fortyWinner = gameState.players.find((player) => player.score >= 40);
  if (fortyWinner) {
    return {
      type: "win",
      reason: "40点到達",
      winnerIndex: fortyWinner.id,
      loserIndex: fortyWinner.id === 0 ? 1 : 0
    };
  }

  const shockedOut = gameState.players.find((player) => player.shocks >= 3);
  if (shockedOut) {
    return {
      type: "win",
      reason: "電流3回",
      winnerIndex: shockedOut.id === 0 ? 1 : 0,
      loserIndex: shockedOut.id
    };
  }

  if (gameState.availableChairs.length === 1) {
    const [p1, p2] = gameState.players;
    if (p1.score === p2.score) {
      return { type: "draw", reason: "残り1脚時点で同点" };
    }
    const winnerIndex = p1.score > p2.score ? 0 : 1;
    return {
      type: "win",
      reason: "残り1脚時点で得点上位",
      winnerIndex,
      loserIndex: winnerIndex === 0 ? 1 : 0
    };
  }
  return null;
}

function switchRoles() {
  const nextSetter = gameState.sitterIndex;
  gameState.sitterIndex = gameState.trapSetterIndex;
  gameState.trapSetterIndex = nextSetter;
  gameState.turn += 1;
  startTurn();
}

function startTimer() {
  stopTimer();
  gameState.timerEndAt = Date.now() + 180000;
  updateTimer();
  gameState.timerIntervalId = window.setInterval(updateTimer, 1000);
}

function stopTimer() {
  if (gameState.timerIntervalId) {
    window.clearInterval(gameState.timerIntervalId);
    gameState.timerIntervalId = null;
  }
}

function updateTimer() {
  if (!gameState.timerEndAt) {
    gameState.timerSeconds = 180;
    return;
  }
  gameState.timerSeconds = Math.max(0, Math.ceil((gameState.timerEndAt - Date.now()) / 1000));
  updateTimerNode();
}

function playShockEffect() {
  const overlay = createElement("div", {
    className: `effect-overlay ${gameState.reducedFlash || prefersReducedMotion.matches ? "reduced" : ""}`,
    ariaHidden: "true"
  });
  const content = createElement("div", { className: "effect-content" });
  content.append(createElement("span", { className: "bolt", text: "⚡" }), document.createTextNode("電流！"));
  overlay.append(content);
  document.body.append(overlay);

  if (gameState.soundEnabled && shockAudio) {
    try {
      shockAudio.currentTime = 0;
      const playPromise = shockAudio.play();
      if (playPromise?.catch) playPromise.catch(() => {});
    } catch (_error) {
      // Audio may be blocked or the file may be absent. The visual result still continues.
    }
  }

  return new Promise((resolve) => {
    window.setTimeout(() => {
      overlay.remove();
      resolve();
    }, 1500);
  });
}

function render() {
  app.replaceChildren();
  if (gameState.phase === "setup") {
    app.append(renderSetup());
    return;
  }

  const screen = createElement("main", { className: "screen" });
  screen.append(renderHeader());

  if (gameState.phase === "handover") {
    screen.append(renderHandover());
  } else if (gameState.phase === "turn-result") {
    screen.append(renderTurnResult());
  } else if (gameState.phase === "game-result") {
    screen.append(renderGameResult());
  } else {
    screen.append(renderStatus(), renderChairBoard(), renderConfirmArea());
  }

  app.append(screen);
  updateTimerNode();
}

function renderSetup() {
  const screen = createElement("main", { className: "screen setup-screen" });
  const panel = createElement("section", { className: "setup-panel" });
  panel.append(createElement("h1", { className: "title setup-title", text: "電気イスゲーム" }));
  panel.append(createElement("p", { className: "sound-credit setup-credit", text: "BGM by OtoLogic(CC BY 4.0)" }));

  const name1 = renderField("プレイヤー1の名前", "input", "player1-name");
  name1.querySelector("input").value = gameState.players[0].name;
  const name2 = renderField("プレイヤー2の名前", "input", "player2-name");
  name2.querySelector("input").value = gameState.players[1].name;
  const first = renderField("最初に電流を仕掛けるプレイヤー", "select", "first-setter");
  const select = first.querySelector("select");
  select.append(new Option("プレイヤー1", "0"), new Option("プレイヤー2", "1"));

  panel.append(name1, name2, first, renderSettings(), button("開始", "primary-button", startGame));
  screen.append(panel);
  return screen;
}

function renderField(labelText, type, id) {
  const label = createElement("label", { text: labelText });
  label.setAttribute("for", id);
  const control = document.createElement(type);
  control.id = id;
  if (type === "input") {
    control.type = "text";
    control.autocomplete = "off";
    control.maxLength = 18;
  }
  const field = createElement("div", { className: "field" });
  field.append(label, control);
  return field;
}

function renderSettings() {
  const box = createElement("div", { className: "settings-box" });
  const sound = checkbox("効果音ON", gameState.soundEnabled, (checked) => {
    gameState.soundEnabled = checked;
  });
  const flash = checkbox("画面点滅を減らす", gameState.reducedFlash, (checked) => {
    gameState.reducedFlash = checked;
  });
  box.append(sound, flash);
  return box;
}

function renderHeader() {
  const frag = document.createDocumentFragment();
  const topbar = createElement("header", { className: "topbar" });
  topbar.append(createElement("h1", { className: "title", text: "電気イスゲーム" }), createElement("div", {
    id: "timer",
    className: "timer",
    text: formatTimer(gameState.timerSeconds)
  }));
  frag.append(topbar, renderScoreTable());
  return frag;
}

function renderScoreTable() {
  const wrap = createElement("div", { className: "score-wrap", role: "region", ariaLabel: "得点履歴" });
  const table = createElement("table", { className: "score-table" });
  const maxTurns = Math.max(8, gameState.turn, gameState.players[0].history.length, gameState.players[1].history.length);
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  headRow.append(createElement("th", { text: "プレイヤー" }));
  for (let i = 1; i <= maxTurns; i += 1) headRow.append(createElement("th", { text: String(i) }));
  headRow.append(createElement("th", { className: "total", text: "計" }));
  thead.append(headRow);
  const tbody = document.createElement("tbody");
  getScoreDisplayOrder().forEach((player) => {
    const row = document.createElement("tr");
    row.append(createElement("th", { className: playerClasses[player.id], text: player.name }));
    for (let i = 0; i < maxTurns; i += 1) {
      row.append(createElement("td", { className: playerClasses[player.id], text: player.history[i] || "-" }));
    }
    row.append(createElement("td", { className: `total ${playerClasses[player.id]}`, text: String(player.score) }));
    tbody.append(row);
  });
  table.append(thead, tbody);
  wrap.append(table);
  return wrap;
}

function getScoreDisplayOrder() {
  const first = gameState.players[gameState.firstSetterIndex] || gameState.players[0];
  const second = gameState.players[first.id === 0 ? 1 : 0];
  return [first, second];
}

function renderStatus() {
  const status = createElement("section", { className: "status", ariaLabel: "進行状況" });
  status.append(
    statusCard("ターン", `${gameState.turn}`),
    statusCard("進行", phaseLabel()),
    statusCard("電流セット", gameState.players[gameState.trapSetterIndex].name, playerClasses[gameState.trapSetterIndex]),
    statusCard("イス選び", gameState.players[gameState.sitterIndex].name, playerClasses[gameState.sitterIndex])
  );
  return status;
}

function renderChairBoard() {
  const stage = createElement("section", { className: "chair-stage" });
  const ring = createElement("div", { className: "chair-ring" });
  for (let number = 1; number <= 12; number += 1) {
    ring.append(renderChair(number));
  }
  ring.append(renderCenterMessage());
  stage.append(ring);
  return stage;
}

function renderChair(number) {
  const angle = ((number % 12) * 30 - 90) * (Math.PI / 180);
  const radius = 41;
  const x = 50 + Math.cos(angle) * radius;
  const y = 50 + Math.sin(angle) * radius;
  const isAvailable = gameState.availableChairs.includes(number);
  const isSelected = gameState.selectedChair === number;
  const chair = button(String(number), `chair ${isSelected ? "selected" : ""} ${isAvailable ? "" : "used"}`, () => selectChair(number));
  chair.style.setProperty("--x", x.toFixed(3));
  chair.style.setProperty("--y", y.toFixed(3));
  chair.disabled = !isAvailable || gameState.locked || !["trap-selection", "chair-selection"].includes(gameState.phase);
  chair.setAttribute("aria-pressed", isSelected ? "true" : "false");
  chair.setAttribute("aria-label", `${number}番のイス${isAvailable ? "" : " 使用済み"}`);
  return chair;
}

function renderCenterMessage() {
  const message = createElement("div", { className: "center-message" });
  if (gameState.phase === "trap-selection") {
    message.append(
      document.createTextNode(`${gameState.players[gameState.trapSetterIndex].name}さんが`),
      createElement("br"),
      document.createTextNode("電流を"),
      createElement("br"),
      document.createTextNode("仕掛けるターンです")
    );
  } else if (gameState.phase === "chair-selection") {
    message.append(
      document.createTextNode(`${gameState.players[gameState.sitterIndex].name}さんが`),
      createElement("br"),
      document.createTextNode("座るイスを"),
      createElement("br"),
      document.createTextNode("選ぶターンです")
    );
    if (gameState.selectedChair !== null) {
      message.append(createElement("div", { className: "selected-text", text: `${gameState.selectedChair}番` }));
    }
  } else {
    message.append(document.createTextNode("判定中"));
  }
  return message;
}

function renderConfirmArea() {
  const text = gameState.phase === "trap-selection" ? "電流を確定" : gameState.phase === "chair-selection" ? "イスを確定" : "判定中";
  const action = gameState.phase === "trap-selection" ? confirmTrap : confirmChair;
  const confirm = button(text, "primary-button", action);
  confirm.disabled = gameState.locked || gameState.selectedChair === null || !["trap-selection", "chair-selection"].includes(gameState.phase);
  return confirm;
}

function renderHandover() {
  const box = createElement("section", { className: "handover-box" });
  box.append(
    createElement("p", { className: "big-message", text: "電流をセットしました" }),
    createElement("p", { className: "sub-message", text: `端末を${gameState.players[gameState.sitterIndex].name}さんに渡してください` }),
    button("準備できました", "primary-button", startChairSelection)
  );
  return box;
}

function renderTurnResult() {
  const result = gameState.lastResult;
  const player = gameState.players[result.playerIndex];
  const nextSetter = gameState.players[gameState.sitterIndex];
  const nextSitter = gameState.players[gameState.trapSetterIndex];
  const box = createElement("section", { className: `result-box ${result.type === "safe" ? "success-pop" : ""}` });
  box.append(createElement("h2", {
    className: `result-title ${result.type}`,
    text: result.type === "safe" ? "回避成功！" : "電流！"
  }));
  const message = result.type === "safe"
    ? `${result.chair}番で${result.points}ポイント獲得`
    : `${result.chair}番で電流を受けました`;
  box.append(createElement("p", { className: "sub-message", text: message }));
  box.append(metricGrid([
    ["選んだイス", `${result.chair}番`],
    ["獲得点", result.type === "safe" ? `${result.points}点` : "⚡"],
    ["現在の得点", `${player.score}点`],
    ["電流回数", `${player.shocks}回`],
    ["次の電流セット", nextSetter.name],
    ["次のイス選び", nextSitter.name]
  ]));
  box.append(button("次のターンへ", "primary-button", switchRoles));
  return box;
}

function renderGameResult() {
  const result = gameState.gameResult;
  const box = createElement("section", { className: "result-box" });
  const title = result.type === "draw" ? "引き分け" : `${gameState.players[result.winnerIndex].name}さんの勝利`;
  box.append(createElement("h2", { className: "result-title safe", text: title }));
  if (result.type === "win") {
    box.append(createElement("p", { className: "sub-message", text: `敗者：${gameState.players[result.loserIndex].name}さん` }));
  }
  box.append(metricGrid([
    [gameState.players[0].name, `${gameState.players[0].score}点 / 電流${gameState.players[0].shocks}回`],
    [gameState.players[1].name, `${gameState.players[1].score}点 / 電流${gameState.players[1].shocks}回`],
    ["勝敗理由", result.reason],
    ["残りイス", gameState.availableChairs.join(", ")]
  ]));
  box.append(renderScoreTable());
  const replay = button("もう一度遊ぶ", "primary-button", () => {
    const setter = gameState.firstSetterIndex;
    resetGame(false);
    gameState.firstSetterIndex = setter;
    gameState.trapSetterIndex = setter;
    gameState.sitterIndex = setter === 0 ? 1 : 0;
    startTurn();
  });
  const setup = button("名前設定に戻る", "secondary-button", () => {
    stopTimer();
    gameState.phase = "setup";
    render();
  });
  const row = createElement("div", { className: "button-row" });
  row.append(replay, setup);
  box.append(row);
  return box;
}

function metricGrid(items) {
  const grid = createElement("div", { className: "result-grid" });
  items.forEach(([label, value]) => {
    const metric = createElement("div", { className: "metric" });
    metric.append(createElement("span", { text: label }), createElement("strong", { text: value }));
    grid.append(metric);
  });
  return grid;
}

function statusCard(label, value, className = "") {
  const card = createElement("div", { className: "status-card" });
  card.append(createElement("div", { className: "status-label", text: label }), createElement("div", { className: `status-value ${className}`, text: value }));
  return card;
}

function phaseLabel() {
  const labels = {
    "trap-selection": "電流セット",
    handover: "電流セット済み",
    "chair-selection": "イス選び",
    judging: "判定中",
    "turn-result": "結果",
    "game-result": "最終結果"
  };
  return labels[gameState.phase] || "準備中";
}

function button(text, className, onClick) {
  const node = createElement("button", { className, text });
  node.type = "button";
  node.addEventListener("click", onClick);
  return node;
}

function checkbox(labelText, checked, onChange) {
  const label = createElement("label", { className: "toggle" });
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  input.addEventListener("change", () => onChange(input.checked));
  label.append(input, document.createTextNode(labelText));
  return label;
}

function createElement(tag, options = {}) {
  const element = document.createElement(tag);
  if (options.className) element.className = options.className;
  if (options.text !== undefined) element.textContent = options.text;
  if (options.id) element.id = options.id;
  if (options.role) element.setAttribute("role", options.role);
  if (options.ariaLabel) element.setAttribute("aria-label", options.ariaLabel);
  if (options.ariaHidden) element.setAttribute("aria-hidden", options.ariaHidden);
  return element;
}

function updateTimerNode() {
  const timer = document.getElementById("timer");
  if (!timer) return;
  timer.textContent = gameState.timerSeconds === 0 && gameState.phase === "chair-selection"
    ? "会話時間終了"
    : formatTimer(gameState.timerSeconds);
  timer.className = "timer";
  if (gameState.phase !== "chair-selection") return;
  if (gameState.timerSeconds === 0) timer.classList.add("done");
  else if (gameState.timerSeconds <= 10) timer.classList.add("danger");
  else if (gameState.timerSeconds <= 60) timer.classList.add("warn");
}

function formatTimer(seconds) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && gameState.phase === "chair-selection") updateTimer();
});

render();
