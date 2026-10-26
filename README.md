# CyberStrike: Incident Response Arena

**Tagline:** Detect. Triage. Defend. Dominate.

A browser-based, real-time multiplayer cybersecurity alert triage game built with Node.js, Express, and Socket.IO. It supports 2–8 players per room and five rounds of fictional security incidents.

## Features

- Create a room with a five-character code and invite other players.
- Up to 8 players per room; host controls start and progression.
- Five incident categories: phishing/social engineering, endpoint threats, identity/access, network/data loss, and final mixed incident-response showdown.
- Choose severity, response priority, and first action for each alert.
- Server-authoritative scoring: severity 100 points, priority 100 points, action 150 points, plus up to 50 speed points for a fully correct response.
- Answers stay hidden from other players until the incident closes.
- Educational explanations and correct answers appear during debrief.
- Responsive dark SOC interface and keyboard-accessible form controls.
- `/health` endpoint for hosting health checks.
- Automated Node.js test suite.

## Requirements

- Node.js 20 or newer
- npm
- A GitHub account and Render account to publish publicly

## Run locally

```bash
npm install
npm test
npm start
```

Open `http://localhost:3000`. To test multiplayer locally, open two separate browser windows or use another device on the same network (for LAN testing, use the host machine's LAN IP and ensure its firewall allows the chosen port).

Optional setting:

```bash
ROUND_SECONDS=45 npm start
```

The server clamps the timer to 20–180 seconds. Render sets `PORT` automatically.

## Deploy to Render

### Option A: Blueprint deploy (recommended)

1. Create a GitHub repository named `cyberstrike-incident-response`.
2. Upload/push the contents of this project to the repository root, including `render.yaml`.
3. Sign in to [Render](https://dashboard.render.com/).
4. Choose **New + → Blueprint**, connect GitHub, and select this repository.
5. Review the service settings from `render.yaml` and deploy.
6. After the deployment completes, open the generated `https://<your-service>.onrender.com` address.
7. Open the public URL in two separate browser sessions/devices, create a room, join using the room code, and verify the host can launch and advance incidents.

### Option B: Create a Web Service manually

- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/health`
- No environment secrets are required for the prototype.

The server listens on `0.0.0.0` and uses Render's `PORT` environment variable. Socket.IO uses the same HTTP server and supports WebSocket connections.

## Test plan and current test status

Run `npm test` for the automated tests. The suite checks five-round structure, incident references, player-limit constants, scoring rules, name sanitation, and unique incident IDs.

**Important:** These automated tests do not simulate real Socket.IO clients or prove that a public deployment is live. After deploying, manually test room creation/joining, 2–8 player limits, host-only controls, duplicate answer prevention, timeout behavior, answer reveal, and progression from round 1 through the final showdown.

## Gameplay

1. The host creates a room and shares the five-character code.
2. At least two players must be present before the host can launch.
3. Each incident has a 45-second default timer.
4. Submit exactly one severity, priority, and action answer per incident.
5. The server awards points and reveals the correct answers after all connected room members have submitted or the timer ends.
6. The host advances to the next incident; the game ends after the five rounds.

## Limitations to understand before sharing

- This is a deployable MVP/prototype, not a production incident-response platform.
- Room state and scores are stored in server memory. Restarting/redeploying the service clears active rooms.
- Render free services may spin down after inactivity, so the first visit can be slow.
- Socket.IO rooms are process-local. For multiple server instances, use a shared Socket.IO adapter and shared durable state.
- Disconnected players are retained temporarily, but reconnecting players do not automatically reclaim their old session. Rejoin/reconnection recovery should be improved before a high-stakes tournament.
- The scenarios are fictional and intended for training, not operational security advice.

## Project structure

```text
cyberstrike-incident-response/
├── public/
│   ├── index.html
│   ├── styles.css
│   └── client.js
├── test/
│   └── game.test.js
├── .env.example
├── .gitignore
├── package.json
├── render.yaml
├── server.js
└── README.md
```

## Security and privacy notes

- Do not enter real passwords, confidential incident details, or personally identifying information.
- Names are limited to 20 characters and angle brackets are stripped, but this is a training prototype and has not undergone a security audit.
- No player accounts, database, or third-party API credentials are required.
