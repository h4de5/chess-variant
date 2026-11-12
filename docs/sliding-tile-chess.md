# Sliding-Tile Chess Variant — Rules and Decisions

Status: implemented in `game.js` (2026-11-12).

This document records the rules of the sliding-tile chess variant and the
reasoning behind them. The variant is playable in `game.js`; the notes below
describe the current implementation.

## Terminology

- **Tile**: one 2×2 block of board squares.
- **Tile grid**: the 4×4 grid of tiles over the 8×8 board.
- **Hole**: the single tile position that is missing. Its four squares do not exist.
- **Slide**: moving one tile orthogonally into the hole.

## Board and tile numbering

- Tiles are numbered 1–16 row-major: 1 = top-left, 16 = bottom-right.
- `tileRow = floor((n - 1) / 4)` and `tileCol = (n - 1) % 4` (0-based).
- Board rows covered by tile `n`: `2 * tileRow` and `2 * tileRow + 1`
  (row 0 = rank 8, row 7 = rank 1).
- Board columns: `2 * tileCol` and `2 * tileCol + 1`
  (column 0 = file a, column 7 = file h).
- Example tile 10: tileRow 2, tileCol 1 → files c/d, ranks 4/3 →
  squares `c4`, `d4`, `c3`, `d3`. This is directly in front of the white
  queen's pawn (`d2`).

## Initial position

- Normal chess starting position.
- The hole starts at tile 10 (provisional; to be tested in play).
- All other middle tiles (5–12 except 10) are real but empty tiles and may be slid.
- A tile may carry zero, one or several pieces.

## Turn actions

On a turn a player chooses exactly one action:

1. **Normal move**: move one of their own pieces according to the normal chess rules.
2. **Slide**: slide one tile that is orthogonally adjacent to the hole
   (up, down, left, right) into the hole.

Slide details:

- The whole 2×2 tile moves, including every piece on it (own and opponent pieces).
- The vacated tile becomes the new hole.
- A slide never captures: the destination is the hole.
- A slide is a complete turn.
- A slide can answer check only by moving the king's own tile out of the line or
  by sliding the attacking piece's tile away. Interposing a piece is not possible
  along a line that crosses the hole tile, because the hole already breaks that
  line.

## Legality and game end

- An action is legal only if the moving side's king is **not** in check after it.
  A move or slide that leaves or puts the own king in check is invalid and cannot
  be executed.
- If the opponent is in check after the action, the opponent must resolve it on
  their next turn: move the king, interpose, or slide.
- Check, checkmate, stalemate and draw detection include slides as legal actions.
- If a player has no legal action: checkmate if in check, otherwise stalemate/draw.
- The hole is part of the position and affects all rules.

## Special rules

- **Promotion**: a pawn that reaches the last rank — whether by a normal move or
  by being slid — promotes; the player chooses Q, R, B or N.
- **Castling**: castling rights are lost when the king or a rook is moved by a
  slide, exactly as with a normal move. Castling may become less useful in this
  variant anyway.
- **En passant**: a slide never creates an en passant target. Any existing en
  passant target expires after a slide, like after any other move.
- **Sliding the opponent's king**: allowed for now (experimental). This can move
  the opponent's king into or out of check. Observe whether this produces
  sensible play.
- **Hole and movement**: no piece may occupy the hole. A sliding piece cannot pass
  through the hole. A knight may jump over the hole, but its destination must be a
  real square. A pawn cannot step or double-step onto or through the hole.

## Decision log

| Date | Decision | Reason / source |
|---|---|---|
| 2026-11-12 | The hole is a real gap; no piece can move there. | User answer 1. |
| 2026-11-12 | Draw/stalemate logic must include the hole. | User answer 1 ("remis wenn sonst kein zug wäre"). |
| 2026-11-12 | Start hole at tile 10; other empty middle tiles are real empty tiles. | User answer 2; to be tested in play. |
| 2026-11-12 | A pawn slid to the last rank promotes. | User answer 3. |
| 2026-11-12 | Castling rights are lost when king/rook is slid. | User answer 3; castling may be less useful later. |
| 2026-11-12 | En passant expires if the capturing pawn is slid. | User answer 3. |
| 2026-11-12 | Sliding the opponent's king is allowed for now. | User answer 4; experimental. |
| 2026-11-12 | A knight may jump over the hole; its destination must be a real square. | Implementation decision, keeps the knight's jump character. |
| 2026-11-12 | A pawn cannot double-step over the hole. | The first step is checked for the hole before the double-step is offered. |
| 2026-11-12 | A slide with a pawn resets the halfmove clock; other slides increment it. | Mirrors normal move behaviour. |
| 2026-11-12 | A slide never creates an en passant target and clears any existing one. | En passant only lasts one turn. |
| 2026-11-12 | Multiple pawns promoted by one slide: own pawns are chosen one after another, opponent pawns auto-promote to queen. | Only the moving player makes choices; opponent promotions must not block the UI. |
| 2026-11-12 | The repetition key includes the hole tile. | Two positions with the same pieces but a different hole are not the same position. |

## Playtest items

- Is tile 10 the right starting hole?
- Does sliding the opponent's king lead to sensible play?
- How often do checkmate/stalemate occur when slides are almost always available?
- Is the halfmove reset on pawn slides too generous?

## Engine and AI implementation

The engine:

- Stores the hole as a tile index (`state.hole`, 0-based) and derives the missing
  squares from it.
- Generates normal moves and slides (`pseudoMoves`, `pseudoSlides`).
- Filters both by self-check by simulating the resulting position (`legalMoves`).
- Uses the combined action list for check/checkmate/stalemate/draw detection.
- Tracks castling rights, en passant and halfmove effects of slides in
  `makeSlide`.
- Appends the hole tile to the repetition key (`positionKey`).

The computer opponent:

- Uses the same `legalMoves` list, so it considers slides and never plays an
  illegal action.
- Keeps the shallow depth-2 search with material plus a simple piece-square term.
  It does not evaluate hole-specific features (open lines, trapped pieces, hole
  mobility) yet.
- Treats a slide as one action in the search, matching the human rules.

## Appendix: original Q&A (German, verbatim)

Questions:

1. Ist das Loch ein fehlendes 2×2-Stück (die 4 Felder existieren nicht, Figuren
   können nicht hineinziehen), oder nur ein leerer Bereich, in den normale Züge
   hineingehen dürfen?
2. Ist das Startloch immer Block 10, und sind die übrigen leeren Mittelblöcke
   echte (leere) Plättchen, die man schieben kann?
3. Schub-Sonderfälle: Bauer auf letzter Reihe → Umwandlung? Rochaderechte weg,
   wenn König/Turm geschoben werden? En passant nur bei normalem Doppelschritt?
4. Darf man auch einen Block mit dem gegnerischen König schieben (und ihn damit
   ins/aus dem Schach bewegen)?

Answers (verbatim):

> 1. es ist ein loch. dort können keine figuren ziehen. mit allen regeln da daran
>    hängen (remis wenn sonst kein zug wäre), 2. ja genau. block 10 vorerst.
>    werden das durch spiele erproben. 3. wenn der bauer an die letzte reihe
>    (samt dem teil) geschobn wird: ja umwandlung, rochaderechte weg: ja - macht
>    im späteren verlauf vielleicht eh wenig sinn die rochade. en passant verfällt
>    wenn angriffs bauer verschobn wird, 4. aktuell ja. wir werden sehen wo das
>    hinführt.
