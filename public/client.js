(() => {
  const socket = io();
  const $ = id => document.getElementById(id);
  const screens = ["lobby-screen","room-screen","game-screen","results-screen"];
  let currentState = null;
  let roomCode = "";
  let lastIncidentId = "";
  let timerInterval = null;
  let toastTimeout = null;
  const nameInput = $("player-name");
  function showScreen(id) { screens.forEach(s => $(s).classList.toggle("hidden", s !== id)); }
  function showToast(message) {
    const el = $("toast"); el.textContent = message; el.classList.add("show");
    clearTimeout(toastTimeout); toastTimeout = setTimeout(() => el.classList.remove("show"), 3600);
  }
  function showError(message) { $("lobby-error").textContent = message; showToast(message); }
  function initials(name) { return name.trim().split(/\s+/).slice(0,2).map(x => x[0]).join("").toUpperCase(); }
  function escapeText(text) { return String(text ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  function playerRows(players, leaderboard = false) {
    const sorted = [...players].sort((a,b) => b.score-a.score || a.name.localeCompare(b.name));
    return sorted.map((p,i) => `<div class="${leaderboard ? "leaderboard-row" : "player-row"}"><span class="${leaderboard ? `rank ${i===0 && p.score>0 ? "first":""}` : "avatar"}">${leaderboard ? String(i+1).padStart(2,"0") : escapeText(initials(p.name))}</span><span class="player-name">${escapeText(p.name)}${leaderboard ? "" : `<small>${p.connected ? (p.isHost ? "ROOM HOST" : "CONNECTED") : "RECONNECTING…"}</small>`}</span>${p.isHost && !leaderboard ? '<span class="host-tag">HOST</span>' : ""}<strong class="player-score">${p.score.toLocaleString()} <small>PTS</small></strong></div>`).join("");
  }
  function renderState(state) {
    currentState = state; roomCode = state.code;
    $("room-code-display").textContent = state.code;
    $("player-count").textContent = `${state.totalPlayers}/8`;
    $("players-list").innerHTML = playerRows(state.players);
    $("leaderboard-list").innerHTML = playerRows(state.players, true);
    $("host-controls").classList.toggle("hidden", !state.players.some(p => p.id === socket.id && p.isHost));
    $("waiting-host").classList.toggle("hidden", state.players.some(p => p.id === socket.id && p.isHost));
    $("start-btn").disabled = state.totalPlayers < 2;
    if (state.status === "lobby") {
      showScreen("room-screen"); $("room-title").textContent = "Waiting for your squad";
      $("start-btn").textContent = state.totalPlayers < 2 ? "Waiting for operators…" : "Launch operation →";
    } else if (state.status === "playing") {
      showScreen("game-screen"); renderIncident(state);
    } else if (state.status === "round-results" || state.status === "round-break") {
      showScreen("game-screen"); renderRoundResults(state);
    } else if (state.status === "finished") {
      showScreen("results-screen"); renderFinal(state);
    }
  }
  function renderIncident(state) {
    const incident = state.incident;
    if (!incident) return;
    $("round-label").textContent = `ROUND ${String(state.roundIndex+1).padStart(2,"0")} OF ${String(state.roundCount).padStart(2,"0")}`;
    $("round-name").textContent = state.roundName;
    $("incident-category").textContent = incident.category;
    $("incident-title").textContent = incident.title;
    $("incident-story").textContent = incident.story;
    $("case-id").textContent = `CS-${incident.id.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,8)}`;
    $("evidence-list").innerHTML = (incident.evidence || []).map(item => `<li>${escapeText(item)}</li>`).join("");
    $("round-progress").innerHTML = Array.from({length:state.roundCount},(_,i)=>`<span class="progress-segment ${i<state.roundIndex?"done":i===state.roundIndex?"active":""}"></span>`).join("");
    if (lastIncidentId !== incident.id) {
      lastIncidentId = incident.id; $("answer-form").reset(); $("submit-btn").disabled = false;
      $("answer-status").textContent = ""; $("answer-status").classList.remove("error");
    }
    const me = state.players.find(p => p.id === socket.id);
    const submitted = Boolean(me && me.submitted);
    $("submit-btn").disabled = submitted;
    if (submitted) { $("answer-status").textContent = "Decision submitted. Waiting for the other operators or the timer."; }
    startTimer(state.deadline);
  }
  function startTimer(deadline) {
    clearInterval(timerInterval);
    const update = () => {
      const remain = Math.max(0, deadline - Date.now());
      const seconds = Math.ceil(remain/1000);
      $("timer").textContent = `00:${String(seconds).padStart(2,"0")}`;
      $("timer-bar").style.width = `${Math.max(0,remain/(currentState.roundSeconds*1000)*100)}%`;
      $("timer-box");
      document.querySelector(".timer-box").classList.toggle("urgent", seconds <= 10);
      if (!remain) clearInterval(timerInterval);
    };
    update(); timerInterval = setInterval(update,250);
  }
  function renderRoundResults(state) {
    clearInterval(timerInterval);
    const result = state.results && state.results[state.results.length-1];
    if (!result) return;
    $("incident-category").textContent = "INCIDENT DEBRIEF";
    $("incident-title").textContent = result.title;
    $("incident-story").textContent = result.explanation;
    $("evidence-list").innerHTML = [
      `Correct severity: ${result.correct.severity.toUpperCase()}`,
      `Correct response priority: ${result.correct.priority}`,
      `Best first action: ${result.correct.action}`
    ].map(x=>`<li>${escapeText(x)}</li>`).join("");
    $("case-id").textContent = "RESULTS REVEALED";
    $("answer-status").textContent = "Incident closed. Review the lesson, then the host can continue.";
    $("submit-btn").disabled = true;
    $("round-name").textContent = state.status === "round-break" ? "Round complete" : "Incident debrief";
    $("round-label").textContent = `ROUND ${String(state.roundIndex+1).padStart(2,"0")} OF ${String(state.roundCount).padStart(2,"0")}`;
    $("timer").textContent = "DONE"; $("timer-bar").style.width = "0%";
    const host = state.players.some(p=>p.id===socket.id&&p.isHost);
    $("incident-category").className = "category-pill";
    $("incident-story").textContent = result.explanation;
    $("submit-btn").classList.add("hidden");
    $("answer-form").querySelectorAll("fieldset, .score-preview, .hint").forEach(el=>el.classList.add("hidden"));
    let advanceBtn = document.getElementById("advance-btn");
    if (!advanceBtn) {
      advanceBtn = document.createElement("button"); advanceBtn.id="advance-btn"; advanceBtn.type="button"; advanceBtn.className="btn btn-primary btn-wide";
      $("answer-form").appendChild(advanceBtn);
      advanceBtn.addEventListener("click", () => socket.emit("start-game"));
    }
    advanceBtn.textContent = state.status === "round-break" ? "Start next round →" : "Next incident →";
    advanceBtn.classList.toggle("hidden", !host);
    $("answer-status").textContent = host ? "Debrief complete. Continue when your team is ready." : "Waiting for the host to continue…";
  }
  function renderFinal(state) {
    clearInterval(timerInterval);
    $("results-title").textContent = "Mission debrief";
    $("final-leaderboard").innerHTML = playerRows(state.players,true);
    const results = state.results || [];
    $("debrief-list").innerHTML = results.map(r=>`<article class="debrief-item"><h3>${escapeText(r.title)}</h3><div class="correct-answer"><span class="answer-chip">SEVERITY: ${escapeText(r.correct.severity.toUpperCase())}</span><span class="answer-chip">${escapeText(r.correct.priority)}</span><span class="answer-chip">${escapeText(r.correct.action)}</span></div><p>${escapeText(r.explanation)}</p></article>`).join("") || "<p>No incidents recorded.</p>";
  }
  $("create-btn").addEventListener("click", () => { $("lobby-error").textContent=""; socket.emit("create-room",{name:nameInput.value}); });
  $("join-btn").addEventListener("click", () => { $("lobby-error").textContent=""; socket.emit("join-room",{name:nameInput.value,code:$("room-code-input").value}); });
  $("room-code-input").addEventListener("input", e=>{e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,5);});
  $("start-btn").addEventListener("click",()=>socket.emit("start-game"));
  
$("add-bots-btn").addEventListener("click", () => {
  $("add-bots-btn").disabled = true;
  socket.emit("add-bots");
});
  $("leave-btn").addEventListener("click",()=>{socket.emit("leave-room");clearInterval(timerInterval);currentState=null;lastIncidentId="";$("submit-btn").classList.remove("hidden");$("answer-form").querySelectorAll("fieldset, .score-preview, .hint").forEach(el=>el.classList.remove("hidden"));const a=document.getElementById("advance-btn");if(a)a.remove();showScreen("lobby-screen");});
  $("back-lobby-btn").addEventListener("click",()=>{showScreen("room-screen");showToast("The game has finished. Create a new room to play again.");});
  $("answer-form").addEventListener("submit",e=>{
    e.preventDefault();
    const form=new FormData(e.currentTarget);
    const answer={severity:form.get("severity"),priority:form.get("priority"),action:form.get("action")};
    if(!answer.severity||!answer.priority||!answer.action){$("answer-status").textContent="Choose a severity, priority, and action.";return;}
    $("submit-btn").disabled=true;socket.emit("submit-answer",answer);
  });
  socket.on("connected",()=>{});
  socket.on("room-created",({code})=>{roomCode=code;$("lobby-error").textContent="";showToast(`Room ${code} created. Share this code with your team.`);});
  socket.on("room-joined",({code})=>{roomCode=code;$("lobby-error").textContent="";});
  socket.on("state",renderState);
  socket.on("game-error",({message})=>{showError(message);if(currentState&&currentState.status==="playing")$("submit-btn").disabled=false;});
  socket.on("answer-received",({points})=>{showToast(`Decision locked: +${points} points. Stay ready for the debrief.`);});
  socket.on("disconnect",()=>showToast("Connection lost. Trying to reconnect…"));
  socket.on("connect",()=>{if(roomCode)showToast("Connected. If you were in a game, rejoin using the room code.");});
  // This prototype keeps rooms in memory. Reconnection to an active socket is not automatic.
})();
