"use strict";
(() => {
  const $ = id => document.getElementById(id);
  const message = $("liveMessage");
  const translate = text => window.eaglesTranslate?.(text) || text;
  let roomId = null;
  let updateTimer = null;
  let clockTimer = null;
  let roomRevision = 0;
  let updatingRevision = null;
  let isHost = false;
  let busy = false;
  let answerPending = false;
  let gameQuestionIndex = null;
  let currentRoom = null;
  let currentAnswer = null;
  let clockOffset = 0;

  function notice(text) { message.textContent = translate(text || ""); }
  function el(tag, content) { const node = document.createElement(tag); if (content !== undefined) node.textContent = content; return node; }
  function stopUpdates() {
    if (updateTimer) clearInterval(updateTimer);
    if (clockTimer) clearInterval(clockTimer);
    updateTimer = clockTimer = null;
  }
  async function post(path, data = {}) { return request(path, {method: "POST", body: JSON.stringify(data)}); }
  function setBusy(value) {
    busy = value;
    for (const id of ["joinButton", "closeRoom", "leaveRoom", "startQuiz", "nextQuestion"]) $(id).disabled = value;
    $("createButton").disabled = value || !$("quizSelect").value;
  }
  function selectRoom(id) {
    roomRevision++;
    roomId = id;
    const url = new URL(location.href);
    if (id) url.searchParams.set("room", id);
    else url.searchParams.delete("room");
    url.searchParams.delete("pin");
    history.replaceState(null, "", url.pathname + url.search);
  }
  async function getMyRooms() {
    try {
      const data = await request("/live-sessions/mine");
      $("myRooms").replaceChildren();
      if (!data.rooms.length) $("myRooms").append(el("p", translate("No active rooms.")));
      for (const room of data.rooms) {
        const b = el("button", `${room.quizTitle} · PIN ${room.pin} · ${room.participantCount} ${translate("Players")}`);
        b.type = "button";
        b.addEventListener("click", () => enterRoom(room.id));
        $("myRooms").append(b);
      }
    } catch (err) { notice(err.message); }
  }
  let materialRequest = 0;
  async function loadMaterials() {
    const generation = ++materialRequest;
    const reading = $("practiceMode").value === "reading";
    $("quizSelect").replaceChildren();
    $("createButton").disabled = true;
    const published = reading ? await request("/reading/manage?live=1") :
      (await request("/quizzes")).quizzes.filter(q => q.status === "published" && q.questionCount > 0);
    if (generation !== materialRequest) return;
    for (const q of published) $("quizSelect").add(new Option(q.title,q.id));
    if (!published.length) $("quizSelect").add(new Option(translate("No published tests yet"),""));
    $("createButton").disabled = !published.length;
    const selected = new URLSearchParams(location.search).get("quiz");
    if (!reading && published.some(q => q.id === selected)) $("quizSelect").value = selected;
  }
  $("practiceMode").addEventListener("change",()=>loadMaterials().catch(err=>notice(err.message)));
  async function init() {
    try {
      const me = await request("/me");
      if (me.status !== "approved" && me.status !== "admin") {
        location.replace("/student-dashboard.html"); return;
      }
      isHost = me.status === "admin" || me.profile?.canCreateTests === true;
      $("liveHistoryLink").hidden = isHost;
      $("liveHostStatsLink").hidden = !isHost;
      $("liveLanding").hidden = false;
      if (isHost) {
        $("hostPanel").hidden = false;
        try {
          await loadMaterials();
          await getMyRooms();
        } catch (err) { notice(err.message); }
      }
      const params = new URLSearchParams(location.search);
      if (params.get("room")) await enterRoom(params.get("room"));
      else if (/^\d{6}$/.test(params.get("pin") || "")) $("roomPin").value = params.get("pin");
    } catch (err) { notice(`${err.message}. Please sign in with an approved account.`); }
  }
  async function enterRoom(id) {
    stopUpdates(); selectRoom(id);
    currentRoom = currentAnswer = null;
    gameQuestionIndex = null;
    $("liveLanding").hidden = true;
    $("activeRoom").hidden = false;
    const revision = roomRevision;
    const terminalError = await updateRoom();
    if (terminalError || revision !== roomRevision || !roomId || ["closed","expired","finished"].includes(currentRoom?.status)) return;
    updateTimer = setInterval(() => { if (!document.hidden) updateRoom(); }, 4000);
    clockTimer = setInterval(updateClock, 250);
  }
  function updateClock() {
    if (!currentRoom || currentRoom.status !== "question" || !currentRoom.questionEndsAt) return;
    const remaining = Math.max(0, Math.ceil((Date.parse(currentRoom.questionEndsAt) - (Date.now() - clockOffset)) / 1000));
    $("gameTimer").textContent = `${remaining}s`;
    if (remaining === 0 && currentRoom.mode === "reading") {
      $("readingFields").disabled = true;
      $("submitSection").disabled = true;
    }
    // Local clock is display-only. Answer eligibility is always checked on the server.
    for (const button of $("answerGrid").querySelectorAll("button")) {
      if (remaining === 0 || currentAnswer || answerPending) button.disabled = true;
    }
  }
  function renderGame(room, data) {
    const previous = data.lastCompletedRound;
    $("previousRound").hidden = !previous;
    $("previousRound").textContent = previous
      ? `${translate("Question")} ${previous.index+1} · ${translate("Correct answer")}: ${previous.answer}` : "";
    const active = ["question", "review"].includes(room.status);
    const reading = room.mode === "reading";
    $("liveReading").hidden = !reading || !active;
    if(!reading || !active) LiveReading.reset();
    $("answerNotice").hidden = reading;
    $("startQuiz").textContent = translate(reading ? "Start Reading" : "Start Quiz");
    $("gameplay").hidden = !active;
    $("finalResult").hidden = room.status !== "finished" && !data.myResult;
    $("waitingPlayers").hidden = room.status !== "lobby";
    $("startQuiz").hidden = !(room.isHost && room.status === "lobby");
    $("startQuiz").disabled = busy || room.participantCount < 1;
    $("nextQuestion").hidden = !(room.isHost && room.status === "review");
    $("nextQuestion").textContent = translate(room.questionIndex === room.questionCount - 1 ? "Finish quiz" : "Next question");
    $("nextQuestion").disabled = busy;

    if(reading && active){
      $("roundReview").hidden=true;
      $("answerGrid").hidden=true;
      $("nextQuestion").textContent=translate(room.questionIndex+1===room.sectionCount?"Finish test":"Next passage");
      LiveReading.render(room,data.draft,updateRoom);
      $("gameTimer").textContent=room.status==="review"?translate("Time is up"):"";
      updateClock();
      return;
    }
    if (room.status === "finished" || data.myResult) {
      const result = data.myResult;
      $("resultMessage").textContent = result
        ? `${translate("Your result")}: ${result.accuracy}% (${result.correct}/${result.total} ${translate("correct")}; ${result.wrong} ${translate("wrong")}; ${result.skipped} ${translate("skipped")}).`
        : translate("Practice has ended. Participants can view their results.");
      return;
    }
    if (!active || !room.question) return;
    const {question} = room;
    $("gameProgress").textContent = `${translate("Question")} ${room.questionIndex + 1} / ${room.questionCount}`;
    $("gameQuestion").textContent = question.text;
    currentAnswer = data.myAnswer || null;
    if (gameQuestionIndex !== room.questionIndex) {
      gameQuestionIndex = room.questionIndex;
      answerPending = false;
      $("answerGrid").replaceChildren();
      question.options.forEach((option, i) => {
        const button = el("button");
        button.type = "button";
        const letter = el("span", "ABCD"[i]); letter.className = "answer-letter";
        button.append(letter, document.createTextNode(option));
        button.addEventListener("click", () => submitAnswer(room.questionIndex, i));
        $("answerGrid").append(button);
      });
    }
    $("answerGrid").hidden = room.isHost;
    [...$("answerGrid").children].forEach((button, i) => {
      button.classList.toggle("is-selected", currentAnswer?.selectedOption === i);
      button.classList.toggle("is-correct", room.status === "review" && data.review?.correctOption === i);
      button.disabled = room.status !== "question" || !!currentAnswer || answerPending;
    });
    $("answerNotice").textContent = room.isHost ? translate("Waiting for players to answer...")
      : currentAnswer ? translate("Answer received. Wait for the round to finish.")
      : room.status === "review" ? translate("Time is up. No answer submitted.") : translate("Choose one answer before the timer ends.");
    $("roundReview").hidden = room.status !== "review";
    if (room.status === "review" && data.review) {
      const index = data.review.correctOption;
      $("correctAnswer").textContent = `${translate("Correct answer")}: ${"ABCD"[index]}. ${question.options[index]}`;
      $("roundStats").textContent = room.isHost ? translate("Advance when the round review is complete.") : "";
      if (currentAnswer) $("answerNotice").textContent = translate(currentAnswer.isCorrect ? "Your answer was correct." : "Your answer was incorrect.");
    }
    $("gameTimer").textContent = room.status === "review" ? translate("Time is up") : "";
    updateClock();
  }
  async function updateRoom() {
    const revision = roomRevision;
    if (!roomId || updatingRevision === revision) return;
    updatingRevision = revision;
    try {
      const result = await request(`/live-sessions/${encodeURIComponent(roomId)}`);
      if (revision !== roomRevision) return;
      if (result.serverTime) clockOffset = Date.now() - Date.parse(result.serverTime);
      const r = result.room;
      currentRoom = r;
      $("activeTitle").textContent = r.quizTitle;
      $("activePin").textContent = r.pin;
      $("activeCount").textContent = String(r.participantCount);
      $("activeQuestions").textContent = String(r.questionCount);
      $("roomStatus").textContent = translate(r.status);
      $("activeAlias").textContent = r.alias ? `${translate("Your alias")}: ${r.alias}` : "";
      $("hostRoomTools").hidden = !r.isHost || ["expired", "closed"].includes(r.status);
      $("leaveRoom").hidden = r.isHost || r.status !== "lobby";
      $("closeRoom").hidden = !r.isHost || ["closed", "expired"].includes(r.status);
      $("playerList").replaceChildren();
      for (const p of result.participants || []) $("playerList").append(el("li", p.alias));
      renderGame(r, result);
      if (["closed", "expired", "finished"].includes(r.status)) stopUpdates();
      notice(["closed", "expired"].includes(r.status) ? "This room is no longer accepting players." : "");
    } catch (err) {
      if (revision !== roomRevision) return;
      notice(err.message);
      if ([401, 403, 404].includes(err.code)) {
        stopUpdates();
        return true;
      }
    } finally { if (updatingRevision === revision) updatingRevision = null; }
  }
  async function submitAnswer(questionIndex, selectedOption) {
    if (answerPending || currentAnswer || currentRoom?.status !== "question") return;
    answerPending = true;
    for (const button of $("answerGrid").querySelectorAll("button")) button.disabled = true;
    try {
      await post(`/live-sessions/${encodeURIComponent(roomId)}/answer`, {questionIndex, selectedOption});
      $("answerNotice").textContent = translate("Answer received. Wait for the round to finish.");
    } catch (err) { notice(err.message); }
    finally { answerPending = false; await updateRoom(); }
  }
  async function hostAction(action) {
    if (busy || !roomId) return;
    setBusy(true);
    try { await post(`/live-sessions/${encodeURIComponent(roomId)}/${action}`, action==="advance" && currentRoom?.mode==="reading"?{section:currentRoom.questionIndex}:{}); await updateRoom(); }
    catch (err) { notice(err.message); }
    finally { setBusy(false); }
  }
  function backToLanding() {
    stopUpdates(); selectRoom(null); $("activeRoom").hidden = true; $("liveLanding").hidden = false;
    currentRoom = null;
    if (isHost) getMyRooms();
  }
  $("joinForm").addEventListener("submit", async event => {
    event.preventDefault(); if (busy) return;
    setBusy(true);
    try { const data = await post("/live-sessions/join", {pin: $("roomPin").value.trim()}); await enterRoom(data.roomId); }
    catch (err) { notice(err.message); }
    finally { setBusy(false); }
  });
  $("createButton").addEventListener("click", async () => {
    if (busy) return;
    setBusy(true);
    try { const data = await post("/live-sessions", {quizId: $("quizSelect").value, ...($("practiceMode").value === "reading" ? {mode:"reading"} : {})}); await enterRoom(data.roomId); }
    catch (err) { notice(err.message); }
    finally { setBusy(false); }
  });
  $("startQuiz").addEventListener("click", () => hostAction("start"));
  $("nextQuestion").addEventListener("click", () => hostAction("advance"));
  $("leaveRoom").addEventListener("click", async () => {
    if (busy || !roomId) return;
    setBusy(true);
    try { await post(`/live-sessions/${encodeURIComponent(roomId)}/leave`); backToLanding(); }
    catch (err) { notice(err.message); }
    finally { setBusy(false); }
  });
  $("closeRoom").addEventListener("click", async () => {
    if (busy || !roomId || !confirm(translate("Close this room for all participants?"))) return;
    setBusy(true);
    try { await post(`/live-sessions/${encodeURIComponent(roomId)}/close`); backToLanding(); }
    catch (err) { notice(err.message); }
    finally { setBusy(false); }
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && roomId) updateRoom(); });
  init();
})();
