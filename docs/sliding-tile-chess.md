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

## Design decisions

These decisions explain why the variant behaves the way it does. The normative
rules are in the sections above.

- **The hole is a barrier, not an empty square.** Its four squares do not exist,
  so no piece may enter or pass through them. This is the defining feature of
  the variant: the hole changes movement, check and draw detection, not just the
  board's appearance. A knight may jump over the hole because it jumps, but it
  must land on a real square. A pawn cannot double-step over the hole because
  its first step would enter the missing tile.
- **Only one tile is missing.** The other empty middle tiles are real tiles and
  can be slid; the board is a full 4×4 tile grid with exactly one hole. This
  keeps the slide mechanics uniform.
- **The hole starts at tile 10 (c3–d4).** This is a provisional starting point,
  directly in front of the white queen's pawn. It should be tested in play and
  may change if it proves awkward.
- **Slides count as legal actions for game end.** Checkmate, stalemate and draw
  detection use the combined list of moves and slides; otherwise a player with a
  slide available could be incorrectly declared stalemated.
- **A slide can promote.** A pawn that reaches the last rank by a slide promotes
  like a pawn that arrives by a normal move. Promotion should not depend on how
  the pawn got there.
- **Slides affect castling rights.** Sliding the king or a rook removes the
  corresponding castling right, because the piece has moved. Castling may become
  less useful in this variant, but the rights follow the pieces.
- **Slides never create en passant.** An en passant target only arises from a
  normal double-step. A slide also clears any existing target, because en
  passant lasts only one turn.
- **The opponent's king may be slid.** This is experimental. A slide can move
  the opponent's king into or out of check. It is allowed for now so that play
  can show whether it produces sensible positions.
- **The halfmove clock follows the slide's content.** A slide that moves a pawn
  resets the clock; any other slide increments it. This mirrors normal move
  behaviour and keeps the 50-move rule meaningful.
- **Multiple promotions are resolved in order.** If one slide promotes several
  of the mover's pawns, the mover chooses them one after another. Opponent
  pawns auto-promote to a queen, because only the moving player should make
  choices and the opponent's promotion must not block the UI.
- **The repetition key includes the hole.** Two positions with the same pieces
  but a different hole are not the same position, because the available moves
  and slides differ.

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

