# Online Chess vs AI (Express + Custom UI)

An online chess game where **Player 1 (you, White)** plays against AI agents with multiple difficulty levels.

## Features

- Custom browser chess UI (no `chessboard.js`)
- Express.js backend API for game sessions
- 4 AI difficulty levels:
  - Easy
  - Medium
  - Hard
  - Expert
- Legal move validation, checkmate/stalemate detection
- New game + update difficulty during play
- Type moves directly (`e2e4`, `e7e8q`)
- Supports SAN/algebraic moves (`e4`, `Nf3`, `O-O`)
- Copy and load board state via FEN
- Scrollable move history panel

## Setup

```bash
cd /home/namanhishere/introAi2
npm install
npm start
```

Open: `http://localhost:3000`

## API Endpoints

- `POST /api/games` create game
- `GET /api/games/:id` get game state
- `POST /api/games/:id/move` player move
- `POST /api/games/:id/ai-move` AI move
- `PATCH /api/games/:id/difficulty` change difficulty
- `PATCH /api/games/:id/fen` load game from FEN
- `DELETE /api/games/:id` delete game

## Tech

- Backend: Express + chess.js
- Frontend: custom HTML/CSS/JS board renderer from FEN
- AI: Minimax + alpha-beta pruning
