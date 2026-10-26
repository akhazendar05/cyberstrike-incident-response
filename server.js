const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const { randomInt } = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const HOST = "0.0.0.0";
const ROUND_SECONDS = Math.max(20, Math.min(180, Number(process.env.ROUND_SECONDS || 45)));
const MAX_PLAYERS = 8;
const MIN_PLAYERS = 2;
const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true }, pingTimeout: 20000, pingInterval: 25000 });
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));
app.get("/health", (_req, res) => res.status(200).json({ ok: true, service: "cyberstrike", uptimeSeconds: Math.round(process.uptime()) }));
app.get("/api/status", (_req, res) => res.json({ game: "CyberStrike: Incident Response Arena", maxPlayers: MAX_PLAYERS, minPlayers: MIN_PLAYERS, roundSeconds: ROUND_SECONDS }));

const INCIDENTS = [
  { id:"phish-1", category:"PHISHING / SOCIAL ENGINEERING", title:"Urgent payroll reset", severity:"high", priority:"P1", action:"quarantine", story:"Several employees report an email claiming payroll access expires in 30 minutes. The link leads to a lookalike sign-in page.", evidence:["Sender domain differs from the company domain by one character","Two employees entered credentials","Message was delivered to 34 inboxes"], explanation:"Treat credential-harvesting campaigns as high severity. Quarantine the message, block the sender and URL, and initiate credential resets for users who interacted." },
  { id:"phish-2", category:"PHISHING / SOCIAL ENGINEERING", title:"Suspicious invoice attachment", severity:"medium", priority:"P2", action:"isolate-email", story:"A vendor invoice arrives unexpectedly with a macro-enabled attachment. No one has opened it yet.", evidence:["Sender is a known vendor but the reply-to address is unfamiliar","Attachment is macro-enabled","No endpoint alert or execution observed"], explanation:"The risk is credible but there is no evidence of execution. Hold or quarantine the message, verify with the vendor through a known channel, and inspect the attachment safely." },
  { id:"endpoint-1", category:"ENDPOINT THREATS", title:"Ransomware behavior detected", severity:"critical", priority:"P1", action:"isolate-host", story:"EDR detects rapid file renaming and shadow-copy deletion on a finance workstation. The user reports files becoming inaccessible.", evidence:["Behavior matches ransomware patterns","File operations are still increasing","Host has access to a shared finance drive"], explanation:"This is an active, potentially spreading incident. Isolate the endpoint immediately, preserve evidence, notify incident command, and investigate lateral movement and shared-drive exposure." },
  { id:"endpoint-2", category:"ENDPOINT THREATS", title:"Unsigned utility blocked", severity:"low", priority:"P3", action:"review-alert", story:"Endpoint protection blocks an unsigned diagnostic utility launched from a user downloads folder. No child process or network connection is recorded.", evidence:["Execution was blocked","No persistence indicators observed","User says they were troubleshooting a printer"], explanation:"A blocked event without follow-on indicators is lower urgency. Preserve the alert, validate the software source, and monitor for repeat behavior before escalating." },
  { id:"identity-1", category:"IDENTITY / ACCESS", title:"Impossible-travel sign-in", severity:"high", priority:"P1", action:"disable-account", story:"One account authenticates from Michigan and then from an overseas hosting provider seven minutes later. MFA was approved.", evidence:["Geolocation and timing are inconsistent","Sign-in used a valid session","Account has access to HR records"], explanation:"Assume the account may be compromised. Revoke sessions, temporarily disable or restrict the account, reset credentials, review MFA factors, and audit recent activity." },
  { id:"identity-2", category:"IDENTITY / ACCESS", title:"Repeated failed admin logins", severity:"medium", priority:"P2", action:"rate-limit", story:"A privileged account receives 45 failed sign-in attempts from one internal workstation over 10 minutes. No successful login is shown.", evidence:["Single source host","No successful authentication","Source is an IT support subnet"], explanation:"Repeated attempts against a privileged identity need investigation. Rate-limit or temporarily block the source as appropriate, verify legitimate admin activity, and check neighboring accounts." },
  { id:"network-1", category:"NETWORK / DATA LOSS", title:"Large outbound transfer", severity:"critical", priority:"P1", action:"contain-egress", story:"A workstation begins transferring 8 GB to a newly registered external file-sharing domain after hours. The user has no approved transfer request.", evidence:["Destination domain is newly registered","Volume is unusual for this device","DLP policy flagged possible sensitive files"], explanation:"Possible data exfiltration needs rapid containment. Restrict the outbound connection, preserve network and endpoint evidence, engage the incident lead, and determine what data left the environment." },
  { id:"network-2", category:"NETWORK / DATA LOSS", title:"Port scan from lab subnet", severity:"low", priority:"P3", action:"validate-source", story:"Network monitoring reports a short port scan from a lab subnet. The source may be an approved vulnerability scanner.", evidence:["Scan lasted under one minute","Source belongs to the security lab","No exploit or access event followed"], explanation:"Validate the source against the authorized scan schedule and asset owner. Avoid disrupting approved testing, but escalate if the activity is unauthorized or continues." },
  { id:"mixed-1", category:"FINAL SHOWDOWN", title:"Domain controller + cloud alerts", severity:"critical", priority:"P1", action:"incident-command", story:"A privileged account creates a new cloud access key, then a domain controller reports suspicious remote service creation. A sensitive file repository shows unusual reads.", evidence:["Privileged identity may be compromised","Potential on-premises and cloud activity","Multiple systems and data sources are involved"], explanation:"Treat this as a coordinated high-impact incident. Activate incident command, contain compromised identities and affected hosts, preserve logs, assess data access, and coordinate cloud and on-prem response." },
  { id:"mixed-2", category:"FINAL SHOWDOWN", title:"Repeated policy violation", severity:"medium", priority:"P2", action:"investigate-change", story:"A server repeatedly attempts to use an outdated protocol after a recent maintenance window. No suspicious external traffic or exploitation is observed.", evidence:["Activity began after a change window","No known exploit indicators","System owner has not confirmed the change"], explanation:"Correlate the event with the approved change, confirm business impact, and remediate the configuration. Escalate if the change is unauthorized or exploitation evidence appears." }
];

const ROUNDS = [
  { name: "Phishing & Social Engineering", incidentIds: ["phish-1","phish-2"] },
  { name: "Endpoint Threats", incidentIds: ["endpoint-1","endpoint-2"] },
  { name: "Identity & Access", incidentIds: ["identity-1","identity-2"] },
  { name: "Network & Data Loss", incidentIds: ["network-1","network-2"] },
  { name: "Final Incident Response Showdown", incidentIds: ["mixed-1","mixed-2"] }
];
const rooms = new Map();
const socketRoom = new Map();

function cleanName(value) {
  return String(value || "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 20);
}
function makeCode() {
  let code = "";
  for (let i = 0; i < 5; i++) code += ROOM_CODE_CHARS[randomInt(ROOM_CODE_CHARS.length)];
  return code;
}
function uniqueCode() {
  let code;
  do { code = makeCode(); } while (rooms.has(code));
  return code;
}
function roomSnapshot(room, reveal = false) {
  const current = room.roundIndex >= 0 && room.roundIndex < ROUNDS.length ? ROUNDS[room.roundIndex] : null;
  const incident = current ? INCIDENTS.find(x => x.id === room.currentIncidentId) : null;
  return {
    code: room.code, hostId: room.hostId, status: room.status,
    roundIndex: room.roundIndex, roundCount: ROUNDS.length,
    roundName: current ? current.name : (room.status === "finished" ? "Game complete" : "Waiting room"),
    incidentNumber: room.incidentIndex + 1, incidentsInRound: current ? current.incidentIds.length : 0,
    deadline: room.deadline, roundSeconds: ROUND_SECONDS,
    players: [...room.players.values()].map(p => ({ id:p.id, name:p.name, score:p.score, connected:p.connected, isHost:p.id === room.hostId, submitted: Boolean(room.submissions[p.id]) })),
    incident: incident && (reveal || room.status === "round-results" || room.status === "finished") ? { ...incident } : incident ? {
      id: incident.id, category: incident.category, title: incident.title, story: incident.story, evidence: incident.evidence
    } : null,
    results: reveal || room.status === "round-results" || room.status === "finished" ? room.results : null,
    readyCount: Object.keys(room.submissions).length,
    totalPlayers: room.players.size
  };
}
function broadcast(room, reveal = false) {
  io.to(room.code).emit("state", roomSnapshot(room, reveal));
}
function clearTimer(room) {
  if (room.timer) clearTimeout(room.timer);
  room.timer = null;
}
function getRoomForSocket(socket) {
  const code = socketRoom.get(socket.id);
  return code ? rooms.get(code) : null;
}
function emitError(socket, message) {
  socket.emit("game-error", { message });
}
function newRoom(host, name) {
  const code = uniqueCode();
  const room = {
    code, hostId: host.id, status: "lobby", roundIndex: -1, incidentIndex: -1,
    currentIncidentId: null, deadline: null, timer: null, players: new Map(),
    submissions: {}, results: [], createdAt: Date.now()
  };
  room.players.set(host.id, { id:host.id, name, score:0, connected:true });
  rooms.set(code, room);
  socketRoom.set(host.id, code);
  host.join(code);
  return room;
}
function removePlayer(socket, room) {
  if (!room) return;
  room.players.delete(socket.id);
  delete room.submissions[socket.id];
  socketRoom.delete(socket.id);
  socket.leave(room.code);
  if (!room.players.size) {
    clearTimer(room);
    rooms.delete(room.code);
    return;
  }
  if (room.hostId === socket.id) {
    room.hostId = room.players.keys().next().value;
    room.players.get(room.hostId).isHost = true;
  }
  broadcast(room);
}
function scoreSubmission(incident, answer, elapsedMs) {
  const correctSeverity = answer.severity === incident.severity;
  const correctPriority = answer.priority === incident.priority;
  const correctAction = answer.action === incident.action;
  const speedBonus = correctSeverity && correctPriority && correctAction
    ? Math.max(0, Math.min(50, Math.floor((ROUND_SECONDS * 1000 - elapsedMs) / (ROUND_SECONDS * 1000) * 50))) : 0;
  return {
    severityCorrect: correctSeverity, priorityCorrect: correctPriority, actionCorrect: correctAction,
    points: (correctSeverity ? 100 : 0) + (correctPriority ? 100 : 0) + (correctAction ? 150 : 0) + speedBonus,
    speedBonus
  };
}
function finishRound(room) {
  clearTimer(room);
  if (!room.currentIncidentId) return;
  room.status = "round-results";
  const incident = INCIDENTS.find(x => x.id === room.currentIncidentId);
  room.results = room.results.filter(r => r.incidentId !== incident.id);
  room.results.push({
    incidentId: incident.id, title: incident.title, correct: { severity:incident.severity, priority:incident.priority, action:incident.action },
    explanation: incident.explanation,
    players: [...room.players.values()].map(p => ({
      id:p.id, name:p.name, score:p.score, answer:room.submissions[p.id] || null
    })).sort((a,b) => b.score-a.score)
  });
  room.deadline = null;
  broadcast(room, true);
}
function startIncident(room) {
  clearTimer(room);
  const round = ROUNDS[room.roundIndex];
  if (!round) { room.status = "finished"; room.deadline = null; broadcast(room, true); return; }
  if (room.incidentIndex >= round.incidentIds.length) {
    room.roundIndex += 1;
    room.incidentIndex = -1;
    if (room.roundIndex >= ROUNDS.length) {
      room.status = "finished"; room.deadline = null; broadcast(room, true); return;
    }
    room.status = "round-break";
    broadcast(room);
    return;
  }
  room.incidentIndex += 1;
  room.currentIncidentId = round.incidentIds[room.incidentIndex];
  room.submissions = {};
  room.status = "playing";
  room.deadline = Date.now() + ROUND_SECONDS * 1000;
  room.timer = setTimeout(() => finishRound(room), ROUND_SECONDS * 1000);
  broadcast(room);
}
function advance(room) {
  if (room.status === "lobby") {
    if (room.players.size < MIN_PLAYERS) return { ok:false, message:"At least two players are required to start." };
    room.roundIndex = 0; room.incidentIndex = -1;
    startIncident(room);
    return { ok:true };
  }
  if (room.status === "round-results") {
    startIncident(room);
    return { ok:true };
  }
  if (room.status === "round-break") {
    startIncident(room);
    return { ok:true };
  }
  if (room.status === "finished") return { ok:false, message:"This game has already finished." };
  return { ok:false, message:"Wait for the current incident to finish." };
}

io.on("connection", socket => {
  socket.emit("connected", { id: socket.id });
  socket.on("create-room", ({ name } = {}) => {
    if (getRoomForSocket(socket)) return emitError(socket, "Leave your current room before creating another.");
    const safeName = cleanName(name);
    if (!safeName) return emitError(socket, "Enter a player name first.");
    const room = newRoom(socket, safeName);
    socket.emit("room-created", { code: room.code });
    broadcast(room);
  });
  socket.on("join-room", ({ code, name } = {}) => {
    if (getRoomForSocket(socket)) return emitError(socket, "Leave your current room before joining another.");
    const room = rooms.get(String(code || "").trim().toUpperCase());
    const safeName = cleanName(name);
    if (!safeName) return emitError(socket, "Enter a player name first.");
    if (!room) return emitError(socket, "Room not found. Check the code with the host.");
    if (room.status !== "lobby") return emitError(socket, "This game has already started.");
    if (room.players.size >= MAX_PLAYERS) return emitError(socket, "This room is full (maximum 8 players).");
    if ([...room.players.values()].some(p => p.name.toLowerCase() === safeName.toLowerCase())) return emitError(socket, "That player name is already taken in this room.");
    room.players.set(socket.id, { id:socket.id, name:safeName, score:0, connected:true });
    socketRoom.set(socket.id, room.code);
    socket.join(room.code);
    socket.emit("room-joined", { code:room.code });
    broadcast(room);
  });
  socket.on("start-game", () => {
    const room = getRoomForSocket(socket);
    if (!room) return emitError(socket, "Join a room first.");
    if (socket.id !== room.hostId) return emitError(socket, "Only the host can start or advance the game.");
    const result = advance(room);
    if (!result.ok) return emitError(socket, result.message);
  });
  socket.on("submit-answer", (answer = {}) => {
    const room = getRoomForSocket(socket);
    if (!room || room.status !== "playing") return emitError(socket, "There is no active incident to answer.");
    if (!room.players.has(socket.id)) return emitError(socket, "You are not a player in this room.");
    if (room.submissions[socket.id]) return emitError(socket, "Your answer has already been submitted.");
    const allowed = {
      severity: ["low","medium","high","critical"],
      priority: ["P1","P2","P3"],
      action: ["quarantine","isolate-email","isolate-host","review-alert","disable-account","rate-limit","contain-egress","validate-source","incident-command","investigate-change"]
    };
    if (!allowed.severity.includes(answer.severity) || !allowed.priority.includes(answer.priority) || !allowed.action.includes(answer.action)) {
      return emitError(socket, "Choose a valid severity, priority, and response action.");
    }
    const incident = INCIDENTS.find(x => x.id === room.currentIncidentId);
    const elapsedMs = Math.max(0, Math.min(ROUND_SECONDS * 1000, ROUND_SECONDS * 1000 - (room.deadline - Date.now())));
    const result = scoreSubmission(incident, answer, elapsedMs);
    room.submissions[socket.id] = { ...answer, ...result, submittedAt:Date.now() };
    room.players.get(socket.id).score += result.points;
    socket.emit("answer-received", { points:result.points, result });
    if (Object.keys(room.submissions).length >= room.players.size) finishRound(room);
    else broadcast(room);
  });
  socket.on("leave-room", () => removePlayer(socket, getRoomForSocket(socket)));
  socket.on("disconnect", () => {
    const room = getRoomForSocket(socket);
    if (room && room.players.has(socket.id)) {
      room.players.get(socket.id).connected = false;
      // Keep disconnected players and their score in the room for the active game.
      broadcast(room);
      setTimeout(() => {
        const current = rooms.get(room.code);
        if (current && current.players.has(socket.id) && !io.sockets.sockets.has(socket.id)) {
          removePlayer({ id:socket.id, leave:()=>{} }, current);
        }
      }, 60000).unref?.();
    }
  });
});

const internals = { INCIDENTS, ROUNDS, rooms, scoreSubmission, cleanName, MAX_PLAYERS, MIN_PLAYERS };
if (require.main === module) {
  server.listen(PORT, HOST, () => console.log(`CyberStrike listening on ${HOST}:${PORT}`));
}
module.exports = { app, server, io, internals };
