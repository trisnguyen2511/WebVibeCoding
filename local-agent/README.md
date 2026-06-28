# WebVibe Local Agent

Receives button events from the Game Controller browser tab and injects them as OS-level keypresses — works with any app (emulators, games, etc).

## Prerequisites

- Node.js 18+
- Python 3 + build tools (required by `robotjs`)
  - **macOS**: `xcode-select --install`
  - **Windows**: `npm install -g windows-build-tools`
  - **Linux**: `sudo apt install build-essential`

## Install & Run

```bash
cd local-agent
npm install
npm start
```

The agent listens on `ws://localhost:9999`.

## Usage

1. Run `npm start` in this folder
2. Open Game Controller in the browser
3. Switch **Input Mode** → **Local Agent** on the host page
4. The status indicator turns green when connected
5. Button presses from all phones are now injected as real keypresses

## Key Mapping

Keys in `.inf` files use DOM key names. They map to OS keys:

| .inf key     | OS key   |
|--------------|----------|
| `ArrowUp`    | Up arrow |
| `ArrowDown`  | Down arrow |
| `ArrowLeft`  | Left arrow |
| `ArrowRight` | Right arrow |
| `Enter`      | Enter    |
| `Shift`      | Shift    |
| `z`, `x`...  | z, x...  |

Single-character keys (`z`, `x`, `a`, `s`) pass through as-is.
