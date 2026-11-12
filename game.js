(() => {
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");
  const overlay = document.getElementById("overlay");
  const overlayContent = document.getElementById("overlayContent");

  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;

  const BOARD_X = 20;
  const BOARD_Y = 20;
  const SQ = 70;
  const BOARD = SQ * 8;

  const PANEL_X = 600;
  const PANEL_Y = 20;
  const PANEL_W = 180;
  const PANEL_H = 560;

  const LIGHT_SQ = "#e9d6b0";
  const DARK_SQ = "#a97b52";

  const ARROW_R = 15;

  const GLYPH = { K: "\u265A", Q: "\u265B", R: "\u265C", B: "\u265D", N: "\u265E", P: "\u265F" };
  const VALUES = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 0 };
  const MATE = 100000;

  const START_HOLE = 9;

  let state;
  let mode = "computer";
  let computerColor = "b";
  let selected = null;
  let legalTargets = [];
  let legalActions = [];
  let lastMove = null;
  let pendingPromotion = null;
  let pendingSlidePromotion = null;
  let gameOver = false;
  let statusText = "";
  let moveLog = [];
  let positionCounts = new Map();
  let computerThinking = false;
  let buttons = [];
  let gameToken = 0;
  let hoveredArrow = null;

  const inside = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
  const rowOf = (i) => Math.floor(i / 8);
  const colOf = (i) => i % 8;
  const other = (color) => (color === "w" ? "b" : "w");
  const squareName = (i) => "abcdefgh"[colOf(i)] + (8 - rowOf(i));

  // ---------- tile geometry ----------

  const tileOf = (i) => Math.floor(rowOf(i) / 2) * 4 + Math.floor(colOf(i) / 2);
  const isHoleSquare = (st, i) => tileOf(i) === st.hole;
  const tileOrigin = (t) => ({ r: Math.floor(t / 4) * 2, c: (t % 4) * 2 });

  function tileSquares(t) {
    const o = tileOrigin(t);
    const i = o.r * 8 + o.c;
    return [i, i + 1, i + 8, i + 9];
  }

  // ---------- board & state ----------

  function initialBoard() {
    const back = ["R", "N", "B", "Q", "K", "B", "N", "R"];
    const board = new Array(64).fill(null);
    for (let c = 0; c < 8; c++) {
      board[c] = "b" + back[c];
      board[8 + c] = "bP";
      board[48 + c] = "wP";
      board[56 + c] = "w" + back[c];
    }
    return board;
  }

  function createState() {
    return {
      board: initialBoard(),
      turn: "w",
      castling: { wK: true, wQ: true, bK: true, bQ: true },
      ep: null,
      halfmove: 0,
      fullmove: 1,
      hole: START_HOLE,
      history: [],
    };
  }

  // ---------- move generation ----------

  function addPromotions(moves, from, to) {
    for (const pr of ["Q", "R", "B", "N"]) moves.push({ kind: "move", from, to, promotion: pr });
  }

  function pseudoMoves(st, color) {
    const b = st.board;
    const moves = [];

    for (let i = 0; i < 64; i++) {
      const p = b[i];
      if (!p || p[0] !== color || isHoleSquare(st, i)) continue;
      const r = rowOf(i);
      const c = colOf(i);
      const t = p[1];

      if (t === "P") {
        const dir = color === "w" ? -1 : 1;
        const startRow = color === "w" ? 6 : 1;
        const promoRow = color === "w" ? 0 : 7;
        const one = r + dir;

        if (inside(one, c)) {
          const to = one * 8 + c;
          if (!isHoleSquare(st, to) && !b[to]) {
            if (one === promoRow) {
              addPromotions(moves, i, to);
            } else {
              moves.push({ kind: "move", from: i, to });
              const two = r + 2 * dir;
              if (r === startRow) {
                const to2 = two * 8 + c;
                if (!isHoleSquare(st, to2) && !b[to2]) moves.push({ kind: "move", from: i, to: to2 });
              }
            }
          }
        }

        for (const dc of [-1, 1]) {
          const nc = c + dc;
          if (!inside(one, nc)) continue;
          const to = one * 8 + nc;
          if (isHoleSquare(st, to)) continue;
          if (b[to] && b[to][0] !== color) {
            if (one === promoRow) addPromotions(moves, i, to);
            else moves.push({ kind: "move", from: i, to });
          } else if (!b[to] && st.ep === to) {
            moves.push({ kind: "move", from: i, to, enPassant: true });
          }
        }
      } else if (t === "N") {
        for (const [dr, dc] of [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]) {
          const nr = r + dr;
          const nc = c + dc;
          if (!inside(nr, nc)) continue;
          const to = nr * 8 + nc;
          if (isHoleSquare(st, to)) continue;
          if (!b[to] || b[to][0] !== color) moves.push({ kind: "move", from: i, to });
        }
      } else if (t === "K") {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (!dr && !dc) continue;
            const nr = r + dr;
            const nc = c + dc;
            if (!inside(nr, nc)) continue;
            const to = nr * 8 + nc;
            if (isHoleSquare(st, to)) continue;
            if (!b[to] || b[to][0] !== color) moves.push({ kind: "move", from: i, to });
          }
        }
        addCastling(st, color, moves);
      } else {
        const dirs = [];
        if (t === "R" || t === "Q") dirs.push([-1, 0], [1, 0], [0, -1], [0, 1]);
        if (t === "B" || t === "Q") dirs.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
        for (const [dr, dc] of dirs) {
          let nr = r + dr;
          let nc = c + dc;
          while (inside(nr, nc)) {
            const to = nr * 8 + nc;
            if (isHoleSquare(st, to)) break;
            if (!b[to]) {
              moves.push({ kind: "move", from: i, to });
            } else {
              if (b[to][0] !== color) moves.push({ kind: "move", from: i, to });
              break;
            }
            nr += dr;
            nc += dc;
          }
        }
      }
    }
    return moves;
  }

  function addCastling(st, color, moves) {
    const b = st.board;
    const enemy = other(color);
    const clear = (i) => !b[i] && !isHoleSquare(st, i);
    if (color === "w") {
      if (st.castling.wK && b[63] === "wR" && clear(61) && clear(62) &&
        !isSquareAttacked(st, 60, enemy) && !isSquareAttacked(st, 61, enemy) && !isSquareAttacked(st, 62, enemy)) {
        moves.push({ kind: "move", from: 60, to: 62, castle: "K" });
      }
      if (st.castling.wQ && b[56] === "wR" && clear(57) && clear(58) && clear(59) &&
        !isSquareAttacked(st, 60, enemy) && !isSquareAttacked(st, 59, enemy) && !isSquareAttacked(st, 58, enemy)) {
        moves.push({ kind: "move", from: 60, to: 58, castle: "Q" });
      }
    } else {
      if (st.castling.bK && b[7] === "bR" && clear(5) && clear(6) &&
        !isSquareAttacked(st, 4, enemy) && !isSquareAttacked(st, 5, enemy) && !isSquareAttacked(st, 6, enemy)) {
        moves.push({ kind: "move", from: 4, to: 6, castle: "K" });
      }
      if (st.castling.bQ && b[0] === "bR" && clear(1) && clear(2) && clear(3) &&
        !isSquareAttacked(st, 4, enemy) && !isSquareAttacked(st, 3, enemy) && !isSquareAttacked(st, 2, enemy)) {
        moves.push({ kind: "move", from: 4, to: 2, castle: "Q" });
      }
    }
  }

  function pseudoSlides(st) {
    const res = [];
    const tr = Math.floor(st.hole / 4);
    const tc = st.hole % 4;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nr = tr + dr;
      const nc = tc + dc;
      if (nr < 0 || nr > 3 || nc < 0 || nc > 3) continue;
      const fromTile = nr * 4 + nc;
      const offset = -dr * 16 - dc * 2;
      res.push(buildSlide(st, fromTile, st.hole, offset));
    }
    return res;
  }

  function buildSlide(st, fromTile, toTile, offset) {
    const promotions = [];
    for (const src of tileSquares(fromTile)) {
      const p = st.board[src];
      if (!p || p[1] !== "P") continue;
      const dest = src + offset;
      const promoRow = p[0] === "w" ? 0 : 7;
      if (rowOf(dest) === promoRow) promotions.push({ idx: dest, color: p[0], type: "Q" });
    }
    return { kind: "slide", fromTile, toTile, offset, promotions };
  }

  function isSquareAttacked(st, idx, by) {
    const b = st.board;
    const r = rowOf(idx);
    const c = colOf(idx);

    const pr = by === "w" ? r + 1 : r - 1;
    for (const dc of [-1, 1]) {
      if (inside(pr, c + dc) && b[pr * 8 + c + dc] === by + "P") return true;
    }

    for (const [dr, dc] of [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]) {
      const nr = r + dr;
      const nc = c + dc;
      if (inside(nr, nc) && b[nr * 8 + nc] === by + "N") return true;
    }

    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (inside(nr, nc) && b[nr * 8 + nc] === by + "K") return true;
      }
    }

    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      let nr = r + dr;
      let nc = c + dc;
      while (inside(nr, nc)) {
        if (isHoleSquare(st, nr * 8 + nc)) break;
        const p = b[nr * 8 + nc];
        if (p) {
          if (p[0] === by && (p[1] === "R" || p[1] === "Q")) return true;
          break;
        }
        nr += dr;
        nc += dc;
      }
    }

    for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      let nr = r + dr;
      let nc = c + dc;
      while (inside(nr, nc)) {
        if (isHoleSquare(st, nr * 8 + nc)) break;
        const p = b[nr * 8 + nc];
        if (p) {
          if (p[0] === by && (p[1] === "B" || p[1] === "Q")) return true;
          break;
        }
        nr += dr;
        nc += dc;
      }
    }

    return false;
  }

  function findKing(b, color) {
    const target = color + "K";
    for (let i = 0; i < 64; i++) if (b[i] === target) return i;
    return -1;
  }

  function inCheck(st, color) {
    const k = findKing(st.board, color);
    return k >= 0 && isSquareAttacked(st, k, other(color));
  }

  function legalMoves(st, color) {
    const res = [];
    for (const m of pseudoMoves(st, color)) {
      makeMove(st, m);
      if (!inCheck(st, color)) res.push(m);
      unmakeMove(st);
    }
    for (const m of pseudoSlides(st)) {
      makeMove(st, m);
      if (!inCheck(st, color)) res.push(m);
      unmakeMove(st);
    }
    return res;
  }

  // ---------- make / unmake ----------

  function makeMove(st, move) {
    const undo = {
      board: st.board.slice(),
      turn: st.turn,
      castling: { ...st.castling },
      ep: st.ep,
      halfmove: st.halfmove,
      fullmove: st.fullmove,
      hole: st.hole,
    };

    if (move.kind === "slide") {
      makeSlide(st, move);
      st.history.push(undo);
      return undo;
    }

    const b = st.board;
    const piece = b[move.from];
    const color = piece[0];
    const type = piece[1];
    let captured = b[move.to];

    b[move.from] = null;

    if (move.enPassant) {
      const capIdx = move.to + (color === "w" ? 8 : -8);
      captured = b[capIdx];
      b[capIdx] = null;
    }

    if (move.castle) {
      const row = rowOf(move.from);
      if (move.castle === "K") {
        b[row * 8 + 5] = b[row * 8 + 7];
        b[row * 8 + 7] = null;
      } else {
        b[row * 8 + 3] = b[row * 8 + 0];
        b[row * 8 + 0] = null;
      }
    }

    b[move.to] = move.promotion ? color + move.promotion : piece;

    const rights = st.castling;
    if (type === "K") {
      if (color === "w") {
        rights.wK = false;
        rights.wQ = false;
      } else {
        rights.bK = false;
        rights.bQ = false;
      }
    }
    if (type === "R") {
      if (move.from === 63) rights.wK = false;
      if (move.from === 56) rights.wQ = false;
      if (move.from === 7) rights.bK = false;
      if (move.from === 0) rights.bQ = false;
    }
    if (move.to === 63) rights.wK = false;
    if (move.to === 56) rights.wQ = false;
    if (move.to === 7) rights.bK = false;
    if (move.to === 0) rights.bQ = false;

    st.ep = type === "P" && Math.abs(move.to - move.from) === 16 ? (move.from + move.to) / 2 : null;
    if (type === "P" || captured) st.halfmove = 0;
    else st.halfmove++;
    st.turn = other(color);
    if (color === "b") st.fullmove++;
    st.history.push(undo);
    return undo;
  }

  function makeSlide(st, move) {
    const b = st.board;
    const mover = st.turn;
    const srcs = tileSquares(move.fromTile);
    const moved = srcs.map((i) => b[i]);
    for (const i of srcs) b[i] = null;

    let pawnMoved = false;
    for (let k = 0; k < 4; k++) {
      let p = moved[k];
      if (!p) continue;
      const dest = srcs[k] + move.offset;
      if (p[1] === "P") {
        pawnMoved = true;
        const promoRow = p[0] === "w" ? 0 : 7;
        if (rowOf(dest) === promoRow) {
          const entry = move.promotions && move.promotions.find((x) => x.idx === dest);
          p = p[0] + (entry && entry.type ? entry.type : "Q");
        }
      }
      b[dest] = p;
    }

    const rights = st.castling;
    for (let k = 0; k < 4; k++) {
      const p = moved[k];
      if (!p) continue;
      const src = srcs[k];
      if (p[1] === "K") {
        if (p[0] === "w") {
          rights.wK = false;
          rights.wQ = false;
        } else {
          rights.bK = false;
          rights.bQ = false;
        }
      } else if (p[1] === "R") {
        if (src === 63) rights.wK = false;
        if (src === 56) rights.wQ = false;
        if (src === 7) rights.bK = false;
        if (src === 0) rights.bQ = false;
      }
    }

    st.hole = move.fromTile;
    st.ep = null;
    st.halfmove = pawnMoved ? 0 : st.halfmove + 1;
    st.turn = other(mover);
    if (mover === "b") st.fullmove++;
  }

  function unmakeMove(st) {
    const undo = st.history.pop();
    if (!undo) return;
    st.board = undo.board;
    st.turn = undo.turn;
    st.castling = undo.castling;
    st.ep = undo.ep;
    st.halfmove = undo.halfmove;
    st.fullmove = undo.fullmove;
    st.hole = undo.hole;
  }

  // ---------- game status ----------

  function positionKey(st) {
    return st.board.map((p) => p || ".").join("") + st.turn +
      (st.castling.wK ? "K" : "") + (st.castling.wQ ? "Q" : "") +
      (st.castling.bK ? "k" : "") + (st.castling.bQ ? "q" : "") +
      (st.ep === null ? "-" : st.ep) + "h" + st.hole;
  }

  function recordPosition() {
    const key = positionKey(state);
    positionCounts.set(key, (positionCounts.get(key) || 0) + 1);
  }

  function insufficientMaterial(b) {
    const pieces = [];
    for (let i = 0; i < 64; i++) {
      const p = b[i];
      if (p && p[1] !== "K") pieces.push({ type: p[1], idx: i });
    }
    if (pieces.length === 0) return true;
    if (pieces.length === 1 && (pieces[0].type === "B" || pieces[0].type === "N")) return true;
    if (pieces.every((x) => x.type === "B")) {
      const colors = new Set(pieces.map((x) => (rowOf(x.idx) + colOf(x.idx)) % 2));
      if (colors.size === 1) return true;
    }
    return false;
  }

  function moveLabel(move) {
    if (move.kind === "slide") return "S " + (move.fromTile + 1) + "\u2192" + (move.toTile + 1);
    if (move.castle === "K") return "O-O";
    if (move.castle === "Q") return "O-O-O";
    const cap = move.enPassant || !!state.board[move.to];
    let s = squareName(move.from) + (cap ? "x" : "-") + squareName(move.to);
    if (move.promotion) s += "=" + move.promotion;
    return s;
  }

  function refreshLegal() {
    legalActions = legalMoves(state, state.turn);
  }

  function updateStatus() {
    statusText = "";

    if (legalActions.length === 0) {
      gameOver = true;
      if (inCheck(state, state.turn)) {
        const winner = state.turn === "w" ? "Schwarz" : "Wei\u00df";
        statusText = "Schachmatt";
        showResult("Schachmatt", winner + " gewinnt.");
      } else {
        statusText = "Patt";
        showResult("Remis", "Patt \u2013 keine legalen Aktionen.");
      }
      return;
    }

    if (state.halfmove >= 100) {
      gameOver = true;
      statusText = "Remis";
      showResult("Remis", "50-Z\u00fcge-Regel.");
      return;
    }
    if (insufficientMaterial(state.board)) {
      gameOver = true;
      statusText = "Remis";
      showResult("Remis", "Unzureichendes Material.");
      return;
    }
    if ((positionCounts.get(positionKey(state)) || 0) >= 3) {
      gameOver = true;
      statusText = "Remis";
      showResult("Remis", "Dreifache Stellungswiederholung.");
      return;
    }
    if (inCheck(state, state.turn)) statusText = "Schach!";
  }

  // ---------- game flow ----------

  function startGame(newMode) {
    mode = newMode || mode;
    gameToken++;
    state = createState();
    selected = null;
    legalTargets = [];
    lastMove = null;
    pendingPromotion = null;
    pendingSlidePromotion = null;
    gameOver = false;
    statusText = "";
    moveLog = [];
    computerThinking = false;
    hoveredArrow = null;
    positionCounts = new Map();
    recordPosition();
    refreshLegal();
    overlay.classList.remove("visible");
    render();
  }

  function showMenu() {
    gameOver = true;
    overlayContent.innerHTML =
      "<h1>Pl\u00e4ttchen-Schach</h1>" +
      "<p>Schach mit 2\u00d72-Pl\u00e4ttchen und einem Loch.</p>" +
      '<p class="hint">Figuren normal ziehen oder ein Pl\u00e4ttchen neben dem Loch mit den Pfeilen am Loch hineinschieben. Das Loch wandert mit.</p>' +
      '<div class="buttons">' +
      '<button data-mode="computer">Gegen Computer</button>' +
      '<button data-mode="player" class="secondary">2 Spieler</button>' +
      "</div>";
    overlay.classList.add("visible");
  }

  function showResult(title, text) {
    overlayContent.innerHTML =
      "<h1>" + title + "</h1>" +
      "<p>" + text + "</p>" +
      '<div class="buttons">' +
      '<button data-action="again">Nochmal</button>' +
      '<button data-action="menu" class="secondary">Men\u00fc</button>' +
      "</div>";
    overlay.classList.add("visible");
  }

  function humanCanAct() {
    if (gameOver || computerThinking) return false;
    if (pendingPromotion || pendingSlidePromotion) return false;
    if (mode === "computer" && state.turn === computerColor) return false;
    return true;
  }

  function applyMove(move) {
    const label = moveLabel(move);
    makeMove(state, move);
    moveLog.push(label);
    lastMove = move;
    selected = null;
    legalTargets = [];
    pendingPromotion = null;
    pendingSlidePromotion = null;
    hoveredArrow = null;
    recordPosition();
    refreshLegal();
    updateStatus();
    render();
    if (!gameOver && mode === "computer" && state.turn === computerColor) scheduleComputer();
  }

  function requestSlide(slide) {
    const own = slide.promotions.filter((p) => p.color === state.turn);
    if (own.length) {
      pendingSlidePromotion = { slide, queue: own, current: 0 };
      render();
    } else {
      applyMove(slide);
    }
  }

  function applySlidePromotion(type) {
    const info = pendingSlidePromotion;
    info.queue[info.current].type = type;
    info.current++;
    if (info.current >= info.queue.length) {
      const slide = info.slide;
      pendingSlidePromotion = null;
      applyMove(slide);
    } else {
      render();
    }
  }

  function scheduleComputer() {
    computerThinking = true;
    render();
    const token = gameToken;
    setTimeout(() => {
      if (token !== gameToken) return;
      computerThinking = false;
      if (gameOver || state.turn !== computerColor) {
        render();
        return;
      }
      const best = chooseComputerMove();
      if (best) applyMove(best);
      else {
        updateStatus();
        render();
      }
    }, 280);
  }

  // ---------- simple AI ----------

  function evaluate(b) {
    let score = 0;
    for (let i = 0; i < 64; i++) {
      const p = b[i];
      if (!p) continue;
      const sign = p[0] === "w" ? 1 : -1;
      const r = rowOf(i);
      const c = colOf(i);
      let v = VALUES[p[1]];
      const centerDist = Math.abs(3.5 - r) + Math.abs(3.5 - c);
      if (p[1] === "N" || p[1] === "B") v += Math.round((7 - centerDist) * 3);
      if (p[1] === "P") v += (p[0] === "w" ? 6 - r : r - 1) * 4;
      score += sign * v;
    }
    return score;
  }

  function chooseComputerMove() {
    const color = computerColor;
    const maximizing = color === "w";
    const moves = legalMoves(state, color);
    if (moves.length === 0) return null;
    if (Math.random() < 0.1) return moves[Math.floor(Math.random() * moves.length)];

    let bestVal = maximizing ? -Infinity : Infinity;
    let bestMoves = [];

    for (const m of moves) {
      makeMove(state, m);
      let val;
      const replies = legalMoves(state, other(color));
      if (replies.length === 0) {
        val = inCheck(state, other(color)) ? (maximizing ? MATE : -MATE) : 0;
      } else {
        const opponentMax = other(color) === "w";
        let pick = opponentMax ? -Infinity : Infinity;
        for (const r of replies) {
          makeMove(state, r);
          const e = evaluate(state.board);
          unmakeMove(state);
          if (opponentMax ? e > pick : e < pick) pick = e;
        }
        val = pick;
      }
      unmakeMove(state);

      const better = maximizing ? val > bestVal : val < bestVal;
      if (better) {
        bestVal = val;
        bestMoves = [m];
      } else if (Math.abs(val - bestVal) <= 20) {
        bestMoves.push(m);
      }
    }

    return bestMoves[Math.floor(Math.random() * bestMoves.length)];
  }

  // ---------- rendering ----------

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawPiece(piece, cx, cy, size) {
    const color = piece[0];
    const glyph = GLYPH[piece[1]];
    ctx.font = Math.round(size * 0.8) + 'px "Segoe UI Symbol", "Noto Sans Symbols 2", "DejaVu Sans", serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(2, size * 0.035);
    ctx.strokeStyle = color === "w" ? "#2b2b2b" : "#f2f2f2";
    ctx.fillStyle = color === "w" ? "#f7f7f7" : "#1a1a1a";
    ctx.strokeText(glyph, cx, cy + size * 0.04);
    ctx.fillText(glyph, cx, cy + size * 0.04);
  }

  function drawHole() {
    const o = tileOrigin(state.hole);
    ctx.fillStyle = LIGHT_SQ;
    ctx.fillRect(BOARD_X + o.c * SQ, BOARD_Y + o.r * SQ, 2 * SQ, 2 * SQ);
  }

  function drawTileGrid() {
    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
    ctx.lineWidth = 1.5;
    for (let k = 1; k < 4; k++) {
      const x = BOARD_X + k * 2 * SQ;
      ctx.beginPath();
      ctx.moveTo(x, BOARD_Y);
      ctx.lineTo(x, BOARD_Y + BOARD);
      ctx.stroke();
      const y = BOARD_Y + k * 2 * SQ;
      ctx.beginPath();
      ctx.moveTo(BOARD_X, y);
      ctx.lineTo(BOARD_X + BOARD, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawTileNumbers() {
    ctx.save();
    ctx.font = "bold 11px system-ui";
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    for (let t = 0; t < 16; t++) {
      const o = tileOrigin(t);
      const x = BOARD_X + (o.c + 2) * SQ - 6;
      const y = BOARD_Y + o.r * SQ + 5;
      ctx.fillStyle = t === state.hole ? "rgba(0, 0, 0, 0.22)" : "rgba(255, 255, 255, 0.32)";
      ctx.fillText(String(t + 1), x, y);
    }
    ctx.restore();
  }

  function slideArrowDefs() {
    const tr = Math.floor(state.hole / 4);
    const tc = state.hole % 4;
    const cx = BOARD_X + (2 * tc + 1) * SQ;
    const cy = BOARD_Y + (2 * tr + 1) * SQ;
    const defs = [];
    if (tr > 0) defs.push({ tile: (tr - 1) * 4 + tc, x: cx, y: BOARD_Y + 2 * tr * SQ, dir: "down" });
    if (tr < 3) defs.push({ tile: (tr + 1) * 4 + tc, x: cx, y: BOARD_Y + (2 * tr + 2) * SQ, dir: "up" });
    if (tc > 0) defs.push({ tile: tr * 4 + (tc - 1), x: BOARD_X + 2 * tc * SQ, y: cy, dir: "right" });
    if (tc < 3) defs.push({ tile: tr * 4 + (tc + 1), x: BOARD_X + (2 * tc + 2) * SQ, y: cy, dir: "left" });
    return defs;
  }

  function drawArrowButton(a, active) {
    const r = active ? ARROW_R + 1 : ARROW_R;
    ctx.save();
    ctx.beginPath();
    ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
    ctx.fillStyle = active ? "rgba(28, 35, 43, 0.62)" : "rgba(28, 35, 43, 0.4)";
    ctx.fill();
    ctx.strokeStyle = active ? "rgba(255, 255, 255, 0.55)" : "rgba(255, 255, 255, 0.24)";
    ctx.lineWidth = 1;
    ctx.stroke();

    const s = active ? 6.5 : 6;
    ctx.fillStyle = active ? "rgba(255, 255, 255, 0.98)" : "rgba(255, 255, 255, 0.82)";
    ctx.beginPath();
    if (a.dir === "down") {
      ctx.moveTo(a.x, a.y + s);
      ctx.lineTo(a.x - s * 0.9, a.y - s * 0.6);
      ctx.lineTo(a.x + s * 0.9, a.y - s * 0.6);
    } else if (a.dir === "up") {
      ctx.moveTo(a.x, a.y - s);
      ctx.lineTo(a.x - s * 0.9, a.y + s * 0.6);
      ctx.lineTo(a.x + s * 0.9, a.y + s * 0.6);
    } else if (a.dir === "right") {
      ctx.moveTo(a.x + s, a.y);
      ctx.lineTo(a.x - s * 0.6, a.y - s * 0.9);
      ctx.lineTo(a.x - s * 0.6, a.y + s * 0.9);
    } else {
      ctx.moveTo(a.x - s, a.y);
      ctx.lineTo(a.x + s * 0.6, a.y - s * 0.9);
      ctx.lineTo(a.x + s * 0.6, a.y + s * 0.9);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawSlideArrows() {
    const tiles = new Set(legalActions.filter((m) => m.kind === "slide").map((m) => m.fromTile));
    for (const d of slideArrowDefs()) {
      if (tiles.has(d.tile)) drawArrowButton(d, hoveredArrow === d.tile);
    }
  }

  function hitSlideArrow(p) {
    for (const d of slideArrowDefs()) {
      const dx = p.x - d.x;
      const dy = p.y - d.y;
      if (dx * dx + dy * dy <= (ARROW_R + 4) ** 2) {
        const slide = legalActions.find((m) => m.kind === "slide" && m.fromTile === d.tile);
        if (slide) return slide;
      }
    }
    return null;
  }

  function render() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = "#0d1117";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? LIGHT_SQ : DARK_SQ;
        ctx.fillRect(BOARD_X + c * SQ, BOARD_Y + r * SQ, SQ, SQ);
      }
    }

    drawHole();
    drawTileGrid();
    drawTileNumbers();

    if (lastMove) {
      ctx.fillStyle = "rgba(255, 214, 0, 0.35)";
      const cells = lastMove.kind === "slide" ? tileSquares(lastMove.toTile) : [lastMove.from, lastMove.to];
      for (const idx of cells) {
        ctx.fillRect(BOARD_X + colOf(idx) * SQ, BOARD_Y + rowOf(idx) * SQ, SQ, SQ);
      }
    }

    if (selected !== null) {
      ctx.fillStyle = "rgba(88, 166, 255, 0.45)";
      ctx.fillRect(BOARD_X + colOf(selected) * SQ, BOARD_Y + rowOf(selected) * SQ, SQ, SQ);
    }

    const kingIdx = findKing(state.board, state.turn);
    if (kingIdx >= 0 && isSquareAttacked(state, kingIdx, other(state.turn))) {
      ctx.fillStyle = "rgba(255, 60, 60, 0.55)";
      ctx.fillRect(BOARD_X + colOf(kingIdx) * SQ, BOARD_Y + rowOf(kingIdx) * SQ, SQ, SQ);
    }

    for (const m of legalTargets) {
      const cx = BOARD_X + colOf(m.to) * SQ + SQ / 2;
      const cy = BOARD_Y + rowOf(m.to) * SQ + SQ / 2;
      if (state.board[m.to] || m.enPassant) {
        ctx.beginPath();
        ctx.arc(cx, cy, SQ * 0.42, 0, Math.PI * 2);
        ctx.lineWidth = 6;
        ctx.strokeStyle = "rgba(20, 20, 20, 0.35)";
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(cx, cy, SQ * 0.14, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(20, 20, 20, 0.35)";
        ctx.fill();
      }
    }

    for (let i = 0; i < 64; i++) {
      const p = state.board[i];
      if (!p || isHoleSquare(state, i)) continue;
      drawPiece(p, BOARD_X + colOf(i) * SQ + SQ / 2, BOARD_Y + rowOf(i) * SQ + SQ / 2, SQ);
    }

    ctx.font = "12px system-ui";
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    for (let c = 0; c < 8; c++) {
      ctx.fillText("abcdefgh"[c], BOARD_X + c * SQ + 4, BOARD_Y + BOARD - 16);
    }
    for (let r = 0; r < 8; r++) {
      ctx.fillText(String(8 - r), BOARD_X + 4, BOARD_Y + r * SQ + 4);
    }

    if (humanCanAct()) drawSlideArrows();

    ctx.strokeStyle = "#2b2b2b";
    ctx.lineWidth = 2;
    ctx.strokeRect(BOARD_X - 1, BOARD_Y - 1, BOARD + 2, BOARD + 2);

    drawPanel();

    if (pendingPromotion) {
      drawPromotionChooser(state.turn, "Umwandlung w\u00e4hlen");
    } else if (pendingSlidePromotion) {
      const n = pendingSlidePromotion.queue.length;
      drawPromotionChooser(state.turn, "Umwandlung " + (pendingSlidePromotion.current + 1) + "/" + n);
    }
  }

  function drawPanel() {
    ctx.fillStyle = "#1c232b";
    roundRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 14);
    ctx.fill();
    ctx.strokeStyle = "#30363d";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";

    ctx.fillStyle = "#e6edf3";
    ctx.font = "bold 24px system-ui";
    ctx.fillText("Schach", PANEL_X + 18, PANEL_Y + 38);

    ctx.fillStyle = "#8b949e";
    ctx.font = "13px system-ui";
    ctx.fillText(mode === "computer" ? "Gegen Computer" : "2 Spieler", PANEL_X + 18, PANEL_Y + 60);

    ctx.fillStyle = "#8b949e";
    ctx.font = "12px system-ui";
    ctx.fillText("2\u00d72-Pl\u00e4ttchen \u00b7 Loch", PANEL_X + 18, PANEL_Y + 78);

    const turnColor = state.turn;
    if (computerThinking) {
      ctx.fillStyle = "#f2cc60";
      ctx.font = "bold 15px system-ui";
      ctx.fillText("Computer denkt \u2026", PANEL_X + 18, PANEL_Y + 102);
    } else {
      let label;
      if (mode === "computer") label = turnColor === "w" ? "Du bist am Zug" : "Computer am Zug";
      else label = turnColor === "w" ? "Wei\u00df am Zug" : "Schwarz am Zug";
      ctx.fillStyle = "#e6edf3";
      ctx.font = "bold 15px system-ui";
      ctx.fillText(label, PANEL_X + 18, PANEL_Y + 102);
    }

    ctx.beginPath();
    ctx.arc(PANEL_X + PANEL_W - 26, PANEL_Y + 30, 7, 0, Math.PI * 2);
    ctx.fillStyle = turnColor === "w" ? "#f7f7f7" : "#1a1a1a";
    ctx.strokeStyle = "#8b949e";
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();

    if (statusText) {
      ctx.fillStyle = "#f2cc60";
      ctx.font = "bold 14px system-ui";
      ctx.fillText(statusText, PANEL_X + 18, PANEL_Y + 126);
    }

    ctx.strokeStyle = "#30363d";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PANEL_X + 18, PANEL_Y + 146);
    ctx.lineTo(PANEL_X + PANEL_W - 18, PANEL_Y + 146);
    ctx.stroke();

    ctx.font = "13px ui-monospace, monospace";
    ctx.fillStyle = "#adbac7";
    const visible = moveLog.slice(-13);
    const startIndex = moveLog.length - visible.length;
    for (let k = 0; k < visible.length; k++) {
      const abs = startIndex + k;
      const text = abs % 2 === 0 ? abs / 2 + 1 + ". " + visible[k] : "   " + visible[k];
      ctx.fillText(text, PANEL_X + 18, PANEL_Y + 168 + k * 18);
    }

    buttons = [
      { x: PANEL_X + 16, y: PANEL_Y + 420, w: PANEL_W - 32, h: 42, label: "Neues Spiel", action: "restart" },
      { x: PANEL_X + 16, y: PANEL_Y + 472, w: PANEL_W - 32, h: 42, label: "Men\u00fc", action: "menu" },
    ];
    for (const b of buttons) {
      ctx.fillStyle = b.action === "menu" ? "#30363d" : "#1f6feb";
      roundRect(b.x, b.y, b.w, b.h, 10);
      ctx.fill();
      ctx.fillStyle = "#e6edf3";
      ctx.font = "bold 14px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1);
    }

    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }

  function promotionLayout() {
    const w = 64;
    const gap = 10;
    const total = w * 4 + gap * 3;
    const x0 = BOARD_X + (BOARD - total) / 2;
    const y0 = BOARD_Y + BOARD / 2 - w / 2 + 10;
    return ["Q", "R", "B", "N"].map((t, k) => ({ type: t, x: x0 + k * (w + gap), y: y0, w, h: w }));
  }

  function drawPromotionChooser(color, title) {
    ctx.fillStyle = "rgba(13, 17, 23, 0.6)";
    ctx.fillRect(BOARD_X, BOARD_Y, BOARD, BOARD);

    const cells = promotionLayout();
    const pad = 16;
    const px = cells[0].x - pad;
    const py = cells[0].y - 34;
    const pw = cells[3].x + cells[3].w + pad - px;
    const ph = cells[0].h + 34 + pad;

    ctx.fillStyle = "#1c232b";
    roundRect(px, py, pw, ph, 12);
    ctx.fill();
    ctx.strokeStyle = "#30363d";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = "#e6edf3";
    ctx.font = "bold 15px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(title, px + pw / 2, py + 24);

    for (const cell of cells) {
      ctx.fillStyle = LIGHT_SQ;
      ctx.fillRect(cell.x, cell.y, cell.w, cell.h);
      ctx.strokeStyle = "#30363d";
      ctx.strokeRect(cell.x, cell.y, cell.w, cell.h);
      drawPiece(color + cell.type, cell.x + cell.w / 2, cell.y + cell.h / 2, cell.w);
    }

    ctx.textAlign = "left";
  }

  // ---------- input ----------

  function pointerPosition(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * HEIGHT,
    };
  }

  function insideRect(p, r) {
    return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  }

  function handleButton(action) {
    if (action === "restart") startGame(mode);
    else if (action === "menu") showMenu();
  }

  function handleBoardClick(p) {
    const c = Math.floor((p.x - BOARD_X) / SQ);
    const r = Math.floor((p.y - BOARD_Y) / SQ);
    if (!inside(r, c)) {
      selected = null;
      legalTargets = [];
      render();
      return;
    }
    const idx = r * 8 + c;

    if (selected !== null) {
      const matches = legalTargets.filter((m) => m.to === idx);
      if (matches.length) {
        if (matches[0].promotion) {
          pendingPromotion = matches;
          render();
          return;
        }
        applyMove(matches[0]);
        return;
      }
    }

    const piece = state.board[idx];
    if (piece && piece[0] === state.turn && !isHoleSquare(state, idx)) {
      selected = idx;
      legalTargets = legalActions.filter((m) => m.kind === "move" && m.from === idx);
    } else {
      selected = null;
      legalTargets = [];
    }
    render();
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (overlay.classList.contains("visible")) return;
    const p = pointerPosition(event);

    if (pendingPromotion) {
      for (const cell of promotionLayout()) {
        if (insideRect(p, cell)) {
          const move = pendingPromotion.find((m) => m.promotion === cell.type);
          if (move) applyMove(move);
          return;
        }
      }
      return;
    }

    if (pendingSlidePromotion) {
      for (const cell of promotionLayout()) {
        if (insideRect(p, cell)) {
          applySlidePromotion(cell.type);
          return;
        }
      }
      return;
    }

    for (const b of buttons) {
      if (insideRect(p, b)) {
        handleButton(b.action);
        return;
      }
    }

    if (!humanCanAct()) return;

    const slide = hitSlideArrow(p);
    if (slide) {
      requestSlide(slide);
      return;
    }

    handleBoardClick(p);
  });

  canvas.addEventListener("pointermove", (event) => {
    let next = null;
    if (!overlay.classList.contains("visible") && humanCanAct()) {
      const slide = hitSlideArrow(pointerPosition(event));
      next = slide ? slide.fromTile : null;
    }
    if (next !== hoveredArrow) {
      hoveredArrow = next;
      canvas.style.cursor = next === null ? "default" : "pointer";
      render();
    }
  });

  canvas.addEventListener("pointerleave", () => {
    if (hoveredArrow === null) return;
    hoveredArrow = null;
    canvas.style.cursor = "default";
    render();
  });

  overlayContent.addEventListener("click", (event) => {
    const btn = event.target.closest("button");
    if (!btn) return;
    if (btn.dataset.mode) startGame(btn.dataset.mode);
    else if (btn.dataset.action === "again") startGame(mode);
    else if (btn.dataset.action === "menu") showMenu();
  });

  // ---------- init ----------

  state = createState();
  recordPosition();
  refreshLegal();
  render();
  showMenu();
})();
