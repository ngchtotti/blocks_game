const BOARD_SIZE = 20;

const PLAYERS = [
  { id: 1, name: "青", css: "p1", startCorner: [0, 0] },
  { id: 2, name: "黄", css: "p2", startCorner: [BOARD_SIZE - 1, BOARD_SIZE - 1] }
];

const SHAPES = [
  { id: "I1", cells: [[0, 0]] },
  { id: "I2", cells: [[0, 0], [1, 0]] },
  { id: "V3", cells: [[0, 0], [0, 1], [1, 0]] },
  { id: "I3", cells: [[0, 0], [1, 0], [2, 0]] },
  { id: "L4", cells: [[0, 0], [0, 1], [0, 2], [1, 2]] },
  { id: "T4", cells: [[0, 0], [1, 0], [2, 0], [1, 1]] },
  { id: "Z4", cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
  { id: "P5", cells: [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]] }
];

const state = {
  board: Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0)),
  currentPlayerIdx: 0,
  selectedPieceId: null,
  transforms: { rotation: 0, flipped: false },
  inventory: new Map(),
  firstMoveDone: new Map(),
  passesInRow: 0,
  gameOver: false
};

const boardEl = document.getElementById("board");
const pieceListEl = document.getElementById("pieceList");
const turnInfoEl = document.getElementById("turnInfo");
const messageEl = document.getElementById("message");
const scoreEl = document.getElementById("score");

function resetGame() {
  state.board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));
  state.currentPlayerIdx = 0;
  state.selectedPieceId = null;
  state.transforms = { rotation: 0, flipped: false };
  state.inventory = new Map();
  state.firstMoveDone = new Map();
  state.passesInRow = 0;
  state.gameOver = false;

  PLAYERS.forEach((p) => {
    state.inventory.set(
      p.id,
      SHAPES.map((shape) => shape.id)
    );
    state.firstMoveDone.set(p.id, false);
  });

  buildBoard();
  render();
}

function buildBoard() {
  boardEl.innerHTML = "";
  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.x = String(x);
      cell.dataset.y = String(y);
      cell.addEventListener("mouseenter", () => showPreviewAt(x, y));
      cell.addEventListener("mouseleave", clearPreview);
      cell.addEventListener("click", () => placeAt(x, y));
      boardEl.appendChild(cell);
    }
  }
}

function currentPlayer() {
  return PLAYERS[state.currentPlayerIdx];
}

function getShapeById(pieceId) {
  return SHAPES.find((shape) => shape.id === pieceId);
}

function normalizeCells(cells) {
  const minX = Math.min(...cells.map((c) => c[0]));
  const minY = Math.min(...cells.map((c) => c[1]));
  return cells.map(([x, y]) => [x - minX, y - minY]);
}

function transformCells(cells, { rotation, flipped }) {
  let transformed = cells.map(([x, y]) => [x, y]);
  if (flipped) {
    transformed = transformed.map(([x, y]) => [-x, y]);
  }

  for (let i = 0; i < rotation; i += 1) {
    transformed = transformed.map(([x, y]) => [y, -x]);
  }
  return normalizeCells(transformed);
}

function getTransformedPieceCells(pieceId) {
  const shape = getShapeById(pieceId);
  if (!shape) return [];
  return transformCells(shape.cells, state.transforms);
}

function playerHasPiece(playerId, pieceId) {
  return state.inventory.get(playerId)?.includes(pieceId);
}

function canPlace(player, cells, anchorX, anchorY) {
  if (!cells.length) return { ok: false, reason: "ピースを選んでください" };

  const absCells = cells.map(([dx, dy]) => [anchorX + dx, anchorY + dy]);

  for (const [x, y] of absCells) {
    if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) {
      return { ok: false, reason: "盤面の外です" };
    }
    if (state.board[y][x] !== 0) {
      return { ok: false, reason: "他のピースと重なっています" };
    }
  }

  const firstMoveDone = state.firstMoveDone.get(player.id);
  const edgeDirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ];
  const diagDirs = [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1]
  ];

  let hasCornerTouch = false;

  for (const [x, y] of absCells) {
    for (const [dx, dy] of edgeDirs) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= BOARD_SIZE || ny < 0 || ny >= BOARD_SIZE) continue;
      if (state.board[ny][nx] === player.id) {
        return { ok: false, reason: "同じ色同士は辺で接してはいけません" };
      }
    }
    for (const [dx, dy] of diagDirs) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= BOARD_SIZE || ny < 0 || ny >= BOARD_SIZE) continue;
      if (state.board[ny][nx] === player.id) {
        hasCornerTouch = true;
      }
    }
  }

  if (!firstMoveDone) {
    const [sx, sy] = player.startCorner;
    const coversStartCorner = absCells.some(([x, y]) => x === sx && y === sy);
    if (!coversStartCorner) {
      return { ok: false, reason: `最初の手は開始角(${sx + 1}, ${sy + 1})を含めてください` };
    }
  } else if (!hasCornerTouch) {
    return { ok: false, reason: "同じ色の角に接するように置いてください" };
  }

  return { ok: true, absCells };
}

function placeAt(x, y) {
  if (state.gameOver) return;

  const player = currentPlayer();
  const pieceId = state.selectedPieceId;
  if (!pieceId || !playerHasPiece(player.id, pieceId)) {
    setMessage("先に手持ちのピースを選択してください");
    return;
  }

  const cells = getTransformedPieceCells(pieceId);
  const result = canPlace(player, cells, x, y);

  if (!result.ok) {
    setMessage(result.reason);
    return;
  }

  result.absCells.forEach(([cx, cy]) => {
    state.board[cy][cx] = player.id;
  });

  state.inventory.set(
    player.id,
    state.inventory.get(player.id).filter((id) => id !== pieceId)
  );

  state.firstMoveDone.set(player.id, true);
  state.selectedPieceId = null;
  state.transforms = { rotation: 0, flipped: false };
  state.passesInRow = 0;

  setMessage(`${player.name}が${pieceId}を配置しました`);
  nextTurn();
}

function showPreviewAt(anchorX, anchorY) {
  clearPreview();
  if (!state.selectedPieceId || state.gameOver) return;

  const player = currentPlayer();
  const cells = getTransformedPieceCells(state.selectedPieceId);
  const result = canPlace(player, cells, anchorX, anchorY);
  if (!result.ok) return;

  for (const [x, y] of result.absCells) {
    const idx = y * BOARD_SIZE + x;
    const cellEl = boardEl.children[idx];
    cellEl.classList.add("preview", player.css);
  }
}

function clearPreview() {
  boardEl.querySelectorAll(".preview").forEach((el) => {
    el.classList.remove("preview", "p1", "p2");
  });
}

function nextTurn() {
  state.currentPlayerIdx = (state.currentPlayerIdx + 1) % PLAYERS.length;
  if (state.passesInRow >= PLAYERS.length) {
    endGame();
    return;
  }
  render();
}

function passTurn() {
  if (state.gameOver) return;
  state.passesInRow += 1;
  setMessage(`${currentPlayer().name}がパスしました`);
  state.selectedPieceId = null;
  state.transforms = { rotation: 0, flipped: false };
  nextTurn();
}

function endGame() {
  state.gameOver = true;
  const scores = PLAYERS.map((p) => ({
    ...p,
    score: state.board.flat().filter((id) => id === p.id).length
  }));
  scores.sort((a, b) => b.score - a.score);

  if (scores[0].score === scores[1].score) {
    setMessage(`ゲーム終了: 引き分け (${scores[0].score} - ${scores[1].score})`);
  } else {
    setMessage(`ゲーム終了: ${scores[0].name}の勝ち (${scores[0].score} 対 ${scores[1].score})`);
  }
  render();
}

function rotateSelected() {
  if (!state.selectedPieceId || state.gameOver) return;
  state.transforms.rotation = (state.transforms.rotation + 1) % 4;
  renderPieceList();
}

function flipSelected() {
  if (!state.selectedPieceId || state.gameOver) return;
  state.transforms.flipped = !state.transforms.flipped;
  renderPieceList();
}

function setMessage(text) {
  messageEl.textContent = `メッセージ: ${text}`;
}

function renderBoard() {
  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      const idx = y * BOARD_SIZE + x;
      const cell = boardEl.children[idx];
      cell.className = "cell";
      if (state.board[y][x] === 1) cell.classList.add("p1");
      if (state.board[y][x] === 2) cell.classList.add("p2");
    }
  }
}

function renderPieceList() {
  pieceListEl.innerHTML = "";
  const player = currentPlayer();
  const pieces = state.inventory.get(player.id) || [];

  if (!pieces.length) {
    const empty = document.createElement("p");
    empty.textContent = "手持ちピースなし";
    pieceListEl.appendChild(empty);
    return;
  }

  pieces.forEach((pieceId) => {
    const card = document.createElement("button");
    card.className = "piece-card";
    if (pieceId === state.selectedPieceId) {
      card.classList.add("selected");
    }
    card.type = "button";
    card.addEventListener("click", () => {
      state.selectedPieceId = pieceId;
      state.transforms = { rotation: 0, flipped: false };
      renderPieceList();
    });

    const label = document.createElement("div");
    label.textContent = pieceId;

    const shapeCells =
      pieceId === state.selectedPieceId
        ? getTransformedPieceCells(pieceId)
        : normalizeCells(getShapeById(pieceId).cells);
    const width = Math.max(...shapeCells.map(([x]) => x)) + 1;
    const height = Math.max(...shapeCells.map(([, y]) => y)) + 1;

    const mini = document.createElement("div");
    mini.className = "piece-mini-grid";
    mini.style.gridTemplateColumns = `repeat(${width}, 14px)`;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const miniCell = document.createElement("div");
        miniCell.className = "piece-mini-cell";
        if (shapeCells.some(([cx, cy]) => cx === x && cy === y)) {
          miniCell.classList.add("filled", player.css);
        }
        mini.appendChild(miniCell);
      }
    }

    card.append(label, mini);
    pieceListEl.appendChild(card);
  });
}

function renderStatus() {
  const player = currentPlayer();
  turnInfoEl.textContent = state.gameOver
    ? "ターン: ゲーム終了"
    : `ターン: ${player.name} (${player.css === "p1" ? "青" : "黄"})`;

  const p1Score = state.board.flat().filter((id) => id === 1).length;
  const p2Score = state.board.flat().filter((id) => id === 2).length;
  scoreEl.textContent = `スコア (置いたマス数): 青 ${p1Score} - 黄 ${p2Score}`;
}

function render() {
  clearPreview();
  renderBoard();
  renderPieceList();
  renderStatus();
}

document.getElementById("rotateBtn").addEventListener("click", rotateSelected);
document.getElementById("flipBtn").addEventListener("click", flipSelected);
document.getElementById("passBtn").addEventListener("click", passTurn);
document.getElementById("restartBtn").addEventListener("click", () => {
  resetGame();
  setMessage("新しいゲームを開始しました");
});

resetGame();
setMessage("ゲーム開始。青プレイヤーからです");
