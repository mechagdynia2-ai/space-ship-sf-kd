# Space Ship SF K.D.

Browser 3D sci-fi arcade game built with Three.js, Vite and the Web Audio API.

🚀🚀🚀 Press&play here - https://mechagdynia2-ai.github.io/space-ship-sf-kd/ 🚀🚀🚀

The project contains two playable modes:

- **GAME** - classic space combat mode with levels, lasers, planets, rings, speed bonus, ring bonus, UZI, Machine Gun and Shield power-ups.
- **Kamil Speed Test** - high-speed tunnel ride with selectable or random routes: Basic, Forest, Mountains and City.

## Features

- Procedural 3D visuals rendered in the browser.
- Keyboard and touch controls for desktop and mobile.
- Mobile-oriented 720p render preset in settings.
- Fullscreen option where supported by the browser.
- FPS counter in both modes.
- Level progression up to level 999.
- Cloudflare Worker + D1 leaderboard for shared scores.
- Local score fallback when the leaderboard API is unavailable.

## Controls

| Input | Action |
| --- | --- |
| `W` / `ArrowUp` | Accelerate |
| `S` / `ArrowDown` | Brake |
| `A` / `ArrowLeft` | Move left |
| `D` / `ArrowRight` | Move right |
| `Space` | Fire |
| `Shift` | Nitro / boost |
| `Esc` | Pause / menu |

On touch devices the game shows on-screen controls, including an `ESC` button.

## Requirements

Minimum:

- Modern browser with WebGL 2 support.
- Desktop: recent Chrome, Edge or Firefox.
- Mobile: recent Android Chrome/Firefox or iOS Safari.
- Recommended mobile mode: 720p render preset.

For development:

- Node.js 18+.
- npm.

## Run Locally

Install dependencies:

```bash
npm install
```

Start the Vite development server:

```bash
npm run dev
```

Build production files:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## Leaderboard

The public GitHub Pages build uses a Cloudflare Worker API backed by D1:

```text
https://space-ship-sf-kd.mechagdynia2.workers.dev/api/scores
```

When the API is unavailable, scores are saved locally in the browser via `localStorage`. This prevents save errors, but local fallback scores are not shared between players.

The repository still includes `server.js` as a local Node.js score server for development/testing:


```bash
npm run server
```

The local server stores up to 100 best scores in `data/scores.json`.

## GitHub Pages

This repository includes a GitHub Actions workflow that builds the Vite app and deploys `dist` to GitHub Pages.

After pushing to GitHub:

1. Open the repository settings.
2. Go to **Pages**.
3. Set source to **GitHub Actions**.
4. Push to the `main` branch.

The workflow will run:

```bash
npm ci
npm run build
```

The Vite config uses `base: './'`, so the build works both on a root domain and under a repository path such as `/space-ship-sf-kd/`.

## Project Files

```text
.
├── index.html
├── package.json
├── package-lock.json
├── server.js
├── vite.config.ts
├── tsconfig.json
├── data/
├── dist/
└── .github/workflows/pages.yml
```

## License

MIT License. See [LICENSE](LICENSE).
