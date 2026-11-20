"use strict";
(() => {
  const $ = id => document.getElementById(id);
  const message = $("liveMessage");
  const translate = text => window.eaglesTranslate?.(text) || text;
  let roomId = null;
  let updateTimer = null;
  let updating = false;
  let isHost = false;
  let busy = false;
  function notice(text) { message.textContent = translate(text || ""); }
  function el(tag, content) { const node = document.createElement(tag); if (content !== undefined) node.textContent = content; return node; }
  function stopUpdates() { if (updateTimer) clearInterval(updateTimer); updateTimer = null; }
  async function post(path, data = {}) { return request(path, {method: "POST", body: JSON.stringify(data)}); }
  function setBusy(value) {
    busy = value;
    for (const id of ["joinButton", "createButton", "closeRoom", "leaveRoom"]) $(id).disabled = value;
  }
  function selectRoom(id) {
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
        const b = el("button", `${room.quizTitle} · PIN ${room.pin} · ${room.participantCount} players`);
        b.type = "button";
        b.addEventListener("click", () => enterRoom(room.id));
        $("myRooms").append(b);
      }
    } catch (err) { notice(err.message); }
  }
  async function init() {
    try {
      const me = await request("/me");
      if (me.status !== "approved" && me.status !== "admin") {
        location.replace("/student-dashboard.html"); return;
      }
      isHost = me.status === "admin" || me.profile?.canCreateTests === true;
      $("liveLanding").hidden = false;
      if (isHost) {
        $("hostPanel").hidden = false;
        try {
          const data = await request("/quizzes");
          const published = data.quizzes.filter(q => q.status === "published" && q.questionCount > 0);
          $("quizSelect").replaceChildren();
          if (!published.length) $("quizSelect").append(el("option", translate("No published tests yet")));
          for (const q of published) {
            const opt = el("option", q.title);
            opt.value = q.id;
            $("quizSelect").append(opt);
          }
          $("createButton").disabled = !published.length;
          const selected = new URLSearchParams(location.search).get("quiz");
          if (selected && published.some(q => q.id === selected)) $("quizSelect").value = selected;
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
    $("liveLanding").hidden = true;
    $("activeRoom").hidden = false;
    await updateRoom();
    updateTimer = setInterval(() => { if (!document.hidden) updateRoom(); }, 12000);
  }
  async function updateRoom() {
    if (!roomId || updating) return;
    updating = true;
    try {
      const result = await request(`/live-sessions/${encodeURIComponent(roomId)}`);
      const r = result.room;
      $("activeTitle").textContent = r.quizTitle;
      $("activePin").textContent = r.pin;
      $("activeCount").textContent = String(r.participantCount);
      $("activeQuestions").textContent = String(r.questionCount);
      $("roomStatus").textContent = translate(r.status);
      $("activeAlias").textContent = r.alias ? `${translate("Your alias")}: ${r.alias}` : "";
      $("hostRoomTools").hidden = !r.isHost;
      $("leaveRoom").hidden = r.isHost || r.status !== "lobby";
      $("closeRoom").hidden = r.status !== "lobby";
      $("playerList").replaceChildren();
      for (const p of result.participants || []) $("playerList").append(el("li", p.alias));
      if (r.status !== "lobby") { stopUpdates(); notice(translate("This room is no longer accepting players.")); }
      else notice("");
    } catch (err) { notice(err.message); if ([401,403,404].includes(err.code)) stopUpdates(); }
    finally { updating = false; }
  }
  function backToLanding() {
    stopUpdates(); selectRoom(null); $("activeRoom").hidden = true; $("liveLanding").hidden = false;
    if (isHost) getMyRooms();
  }
  $("joinForm").addEventListener("submit", async event => {
    event.preventDefault(); if (busy) return;
    setBusy(true);
    try {
      const pin = $("roomPin").value.trim();
      const data = await post("/live-sessions/join", {pin});
      await enterRoom(data.roomId);
    } catch (err) { notice(err.message); }
    finally { setBusy(false); }
  });
  $("createButton").addEventListener("click", async () => {
    if (busy) return;
    setBusy(true);
    try {
      const data = await post("/live-sessions", {quizId: $("quizSelect").value});
      await enterRoom(data.roomId);
    } catch (err) { notice(err.message); }
    finally { setBusy(false); }
  });
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
