# Online Chess vs AI (Express + Custom UI)

An online chess game where you play against AI agents with multiple difficulty levels and can choose to play as White or Black.

## Features

- Custom browser chess UI (no `chessboard.js`)
- Express.js backend API for game sessions
- 4 AI difficulty levels:
  - Easy
  - Medium
  - Hard
  - Expert
- Play as White or Black
- Opponent types: Minimax AI or random rule-based agent
- Legal move validation, checkmate/stalemate detection
- New game + update difficulty during play
- Type moves directly (`e2e4`, `e7e8q`)
- Supports SAN/algebraic moves (`e4`, `Nf3`, `O-O`)
- Copy and load board state via FEN
- Scrollable move history panel
- Evaluation runner for AI vs random agent (both sides)

## Setup

```bash
cd IntroAiAssignment2
npm install
npm start
```

Open: `http://localhost:3000`

## Run with Docker

Build and run:

```bash
docker compose up --build
```

Then open:

`http://localhost:3000`

## API Endpoints

- `POST /api/games` create game
- `GET /api/games/:id` get game state
- `POST /api/games/:id/move` player move
- `POST /api/games/:id/ai-move` AI move
- `PATCH /api/games/:id/difficulty` change difficulty
- `PATCH /api/games/:id/fen` load game from FEN
- `DELETE /api/games/:id` delete game
- `POST /api/evaluate` run AI vs random evaluation

### Create game body

```json
{
  "difficulty": "medium",
  "playerColor": "w",
  "aiType": "minimax"
}
```

- `playerColor`: `w` or `b`
- `aiType`: `minimax` or `random`

### Evaluation

Runs the minimax AI against the random agent as both White and Black.

```bash
curl -X POST http://localhost:3000/api/evaluate \
  -H "Content-Type: application/json" \
  -d '{"gamesPerSide":10,"difficulty":"expert"}'
```

## Tech

- Backend: Express + chess.js
- Frontend: custom HTML/CSS/JS board renderer from FEN
- AI: Minimax + alpha-beta pruning
