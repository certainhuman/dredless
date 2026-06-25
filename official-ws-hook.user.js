// ==UserScript==
// @name         Dredless WebSocket Capture
// @namespace    dredless
// @version      0.3.2
// @description  Capture drednot.io WebSocket traffic from window.tpgaClient.repsocket.websocket.
// @match        https://drednot.io/*
// @match        https://test.drednot.io/*
// @run-at       document-idle
// @grant        none
// @inject-into  page
// ==/UserScript==

(() => {
  const VERSION = "0.3.2";
  const GLOBAL_KEY = "__dredlessWsCapture";
  const PUBLIC_KEY = "dredlessCapture";
  const global = globalThis;

  const previous = global[GLOBAL_KEY];
  if (previous?.version === VERSION) {
    previous.install();
    previous.showUi();
    console.info("websocket userscript already installed", previous.summary());
    return previous;
  }
  previous?.restore?.();

  const records = [];
  const options = {
    maxRecords: 100000,
    log: false,
    pollMs: 250
  };
  const confirmClickMs = 1600;
  let sequence = 0;
  let socketId = 0;
  let socket = null;
  let originalSend = null;
  let messageListener = null;
  let closeListener = null;
  let errorListener = null;
  let pollTimer = null;
  let capturing = true;
  let uiHost = null;
  let uiRoot = null;
  let uiTimer = null;
  let minimized = false;
  let pendingAction = null;
  let pendingActionTimer = null;

  function currentSocket() {
    return global.tpgaClient?.repsocket?.websocket || null;
  }

  function isWebSocketLike(value) {
    return Boolean(
      value &&
      typeof value === "object" &&
      typeof value.send === "function" &&
      typeof value.addEventListener === "function" &&
      typeof value.readyState === "number"
    );
  }

  function frameBase(direction, activeSocket = socket) {
    return {
      event: "official-ws-frame",
      source: "official-client",
      version: VERSION,
      seq: ++sequence,
      time: Date.now(),
      direction,
      socketId,
      url: String(activeSocket?.url || ""),
      readyState: activeSocket?.readyState ?? null
    };
  }

  function pushRecord(record) {
    records.push(record);
    if (records.length > options.maxRecords) records.splice(0, records.length - options.maxRecords);
    if (options.log) {
      console.debug("dredless ws", record.event, record.direction ?? "", record.data?.kind ?? "");
    }
    refreshUiSoon();
    return record;
  }

  function bytesToBase64(bytes) {
    let text = "";
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      text += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(text);
  }

  function base64ToBytes(base64) {
    const text = atob(String(base64));
    const bytes = new Uint8Array(text.length);
    for (let index = 0; index < text.length; index += 1) bytes[index] = text.charCodeAt(index);
    return bytes;
  }

  function binaryPayload(bytes) {
    return {
      kind: "binary",
      byteLength: bytes.byteLength,
      base64: bytesToBase64(bytes)
    };
  }

  function objectTag(value) {
    return Object.prototype.toString.call(value);
  }

  function isArrayBufferLike(value) {
    if (!value || typeof value !== "object") return false;
    const tag = objectTag(value);
    return tag === "[object ArrayBuffer]" || tag === "[object SharedArrayBuffer]";
  }

  function isArrayBufferViewLike(value) {
    if (!value || typeof value !== "object") return false;
    if (ArrayBuffer.isView(value)) return true;
    const tag = objectTag(value);
    return (
      isArrayBufferLike(value.buffer) &&
      Number.isInteger(value.byteOffset) &&
      Number.isInteger(value.byteLength) &&
      (
        tag === "[object DataView]" ||
        tag === "[object Uint8Array]" ||
        tag === "[object Uint8ClampedArray]" ||
        tag === "[object Int8Array]" ||
        tag === "[object Uint16Array]" ||
        tag === "[object Int16Array]" ||
        tag === "[object Uint32Array]" ||
        tag === "[object Int32Array]" ||
        tag === "[object Float32Array]" ||
        tag === "[object Float64Array]" ||
        tag === "[object BigUint64Array]" ||
        tag === "[object BigInt64Array]"
      )
    );
  }

  function isBlobLike(value) {
    return Boolean(
      value &&
      typeof value === "object" &&
      typeof value.arrayBuffer === "function" &&
      typeof value.size === "number" &&
      typeof value.type === "string"
    );
  }

  function serializeFrameData(data) {
    if (typeof data === "string") return { kind: "text", byteLength: data.length, text: data };
    if (isArrayBufferLike(data)) return binaryPayload(new Uint8Array(data));
    if (isArrayBufferViewLike(data)) return binaryPayload(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
    if (isBlobLike(data)) {
      return data.arrayBuffer().then((buffer) => ({
        kind: "blob",
        byteLength: buffer.byteLength,
        mimeType: data.type || "",
        base64: bytesToBase64(new Uint8Array(buffer))
      }));
    }
    return { kind: typeof data, byteLength: null, tag: objectTag(data), text: String(data) };
  }

  function recordFrame(direction, activeSocket, data) {
    if (!capturing) return null;
    const base = frameBase(direction, activeSocket);
    try {
      const payload = serializeFrameData(data);
      if (payload && typeof payload.then === "function") {
        payload
          .then((resolved) => pushRecord({ ...base, data: resolved }))
          .catch((error) => pushRecord({
            ...base,
            data: { kind: "error", message: error?.message || String(error) }
          }));
        return base;
      }
      return pushRecord({ ...base, data: payload });
    } catch (error) {
      return pushRecord({
        ...base,
        data: { kind: "error", message: error?.message || String(error) }
      });
    }
  }

  function eventRecord(event, activeSocket = socket, extra = {}) {
    return pushRecord({
      event,
      source: "official-client",
      version: VERSION,
      seq: ++sequence,
      time: Date.now(),
      socketId,
      url: String(activeSocket?.url || ""),
      readyState: activeSocket?.readyState ?? null,
      ...extra
    });
  }

  function hook(target = currentSocket()) {
    if (!isWebSocketLike(target)) {
      throw new Error("window.tpgaClient.repsocket.websocket is not available yet");
    }
    if (target === socket && originalSend) return api;

    restoreSocket();
    socket = target;
    socketId += 1;
    originalSend = socket.send;

    const wrappedSend = function(data) {
      recordFrame("out", socket, data);
      return originalSend.call(this, data);
    };

    try {
      socket.send = wrappedSend;
    } catch (_) {}
    if (socket.send !== wrappedSend) {
      try {
        Object.defineProperty(socket, "send", {
          configurable: true,
          writable: true,
          value: wrappedSend
        });
      } catch (error) {
        restoreSocket();
        throw new Error(`Unable to wrap websocket.send on the instance: ${error.message}`);
      }
    }

    messageListener = (event) => recordFrame("in", socket, event.data);
    closeListener = (event) => eventRecord("official-ws-closed", socket, {
      code: event?.code ?? null,
      reason: event?.reason ?? "",
      wasClean: event?.wasClean ?? null
    });
    errorListener = () => eventRecord("official-ws-error", socket);
    socket.addEventListener("message", messageListener);
    socket.addEventListener("close", closeListener);
    socket.addEventListener("error", errorListener);
    eventRecord("official-ws-hooked", socket);
    refreshUi();
    return api;
  }

  function restoreSocket() {
    if (!socket) return api;
    if (messageListener) {
      try { socket.removeEventListener("message", messageListener); }
      catch (_) {}
    }
    if (closeListener) {
      try { socket.removeEventListener("close", closeListener); }
      catch (_) {}
    }
    if (errorListener) {
      try { socket.removeEventListener("error", errorListener); }
      catch (_) {}
    }
    if (originalSend) {
      try { socket.send = originalSend; }
      catch (_) {
        try {
          Object.defineProperty(socket, "send", {
            configurable: true,
            writable: true,
            value: originalSend
          });
        } catch (_) {}
      }
    }
    socket = null;
    originalSend = null;
    messageListener = null;
    closeListener = null;
    errorListener = null;
    refreshUi();
    return api;
  }

  function install() {
    const target = currentSocket();
    if (isWebSocketLike(target)) return hook(target);
    startPolling();
    refreshUi();
    return api;
  }

  function startPolling() {
    if (pollTimer) return api;
    pollTimer = setInterval(() => {
      const target = currentSocket();
      if (!isWebSocketLike(target) || target === socket) {
        refreshUi();
        return;
      }
      try { hook(target); }
      catch (error) { eventRecord("official-ws-hook-error", target, { message: error.message }); }
    }, options.pollMs);
    refreshUi();
    return api;
  }

  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    refreshUi();
    return api;
  }

  function restore() {
    stopPolling();
    removeUi();
    return restoreSocket();
  }

  function wait(timeoutMs = 30000) {
    const start = Date.now();
    install();
    return new Promise((resolve, reject) => {
      const timer = setInterval(() => {
        if (socket && originalSend) {
          clearInterval(timer);
          resolve(api);
          return;
        }
        if (Date.now() - start > timeoutMs) {
          clearInterval(timer);
          reject(new Error("Timed out waiting for window.tpgaClient.repsocket.websocket"));
        }
      }, options.pollMs);
    });
  }

  function startCapture() {
    if (!capturing) {
      capturing = true;
      eventRecord("official-ws-capture-started");
    }
    install();
    refreshUi();
    return api;
  }

  function stopCapture() {
    if (capturing) eventRecord("official-ws-capture-stopped");
    capturing = false;
    refreshUi();
    return api;
  }

  function toggleCapture() {
    return capturing ? stopCapture() : startCapture();
  }

  function dump(filter = {}) {
    const direction = filter.direction || null;
    return records
      .filter((record) => !direction || record.direction === direction)
      .map((record) => JSON.stringify(record))
      .join("\n") + (records.length ? "\n" : "");
  }

  function download(filename = null, filter = {}) {
    const name = filename || `official-ws-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`;
    const blob = new Blob([dump(filter)], { type: "application/x-ndjson" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.style.display = "none";
    document.documentElement.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return name;
  }

  async function copy(filter = {}) {
    const text = dump(filter);
    await navigator.clipboard.writeText(text);
    return text.length;
  }

  function sendBase64(base64) {
    if (!socket) hook();
    socket.send(base64ToBytes(base64));
    return api;
  }

  function sendText(text) {
    if (!socket) hook();
    socket.send(String(text));
    return api;
  }

  function clear() {
    records.length = 0;
    refreshUi();
    return api;
  }

  function summary() {
    const byEvent = {};
    const byDirection = {};
    for (const record of records) {
      byEvent[record.event] = (byEvent[record.event] || 0) + 1;
      if (record.direction) byDirection[record.direction] = (byDirection[record.direction] || 0) + 1;
    }
    return {
      version: VERSION,
      capturing,
      hooked: Boolean(socket && originalSend),
      polling: Boolean(pollTimer),
      socketId,
      url: socket?.url || null,
      readyState: socket?.readyState ?? null,
      records: records.length,
      byEvent,
      byDirection
    };
  }

  function readyStateName(value) {
    switch (value) {
      case 0: return "connecting";
      case 1: return "open";
      case 2: return "closing";
      case 3: return "closed";
      default: return "-";
    }
  }

  function showUi() {
    if (uiHost?.isConnected) {
      uiHost.style.display = "";
      refreshUi();
      return api;
    }

    uiHost = document.createElement("div");
    uiHost.id = "dredless-official-ws-capture";
    uiHost.style.position = "fixed";
    uiHost.style.right = "12px";
    uiHost.style.bottom = "12px";
    uiHost.style.zIndex = "2147483647";
    uiRoot = uiHost.attachShadow ? uiHost.attachShadow({ mode: "open" }) : uiHost;
    uiRoot.innerHTML = uiHtml();
    document.documentElement.append(uiHost);
    bindUi();
    uiTimer = setInterval(refreshUi, 500);
    refreshUi();
    return api;
  }

  function removeUi() {
    if (uiTimer) clearInterval(uiTimer);
    uiTimer = null;
    uiHost?.remove();
    uiHost = null;
    uiRoot = null;
    return api;
  }

  function refreshUiSoon() {
    if (!uiRoot) return;
    queueMicrotask(refreshUi);
  }

  function refreshUi() {
    if (!uiRoot) return;
    const state = summary();
    const panel = uiRoot.querySelector(".panel");
    const captureButton = uiRoot.querySelector("[data-action='capture']");
    const hookButton = uiRoot.querySelector("[data-action='hook']");
    const clearButton = uiRoot.querySelector("[data-action='clear']");
    const status = uiRoot.querySelector("[data-field='status']");
    const socketField = uiRoot.querySelector("[data-field='socket']");
    const recordsField = uiRoot.querySelector("[data-field='records']");
    const framesField = uiRoot.querySelector("[data-field='frames']");
    const body = uiRoot.querySelector(".body");
    const minimizedLabel = uiRoot.querySelector("[data-field='minimized-label']");

    panel?.classList.toggle("capturing", state.capturing);
    panel?.classList.toggle("hooked", state.hooked);
    panel?.classList.toggle("waiting", !state.hooked && state.polling);
    if (body) body.hidden = minimized;
    if (minimizedLabel) minimizedLabel.textContent = minimized ? "Show" : "Hide";
    if (captureButton) {
      const label = state.capturing ? "Stop" : "Start";
      captureButton.textContent = actionLabel("capture", label);
    }
    if (hookButton) hookButton.textContent = actionLabel("hook", "Hook");
    if (clearButton) clearButton.textContent = actionLabel("clear", "Clear");
    if (status) {
      status.textContent = pendingAction
        ? `${pendingActionLabel()} armed`
        : state.hooked
        ? `hooked / ${state.capturing ? "capturing" : "paused"}`
        : state.polling ? "waiting for socket" : "not hooked";
    }
    if (socketField) socketField.textContent = `${readyStateName(state.readyState)} #${state.socketId || "-"}`;
    if (recordsField) recordsField.textContent = String(state.records);
    if (framesField) framesField.textContent = `${state.byDirection.in || 0} in / ${state.byDirection.out || 0} out`;
  }

  function actionBaseLabel(action) {
    if (action === "capture") return capturing ? "Stop" : "Start";
    if (action === "hook") return "Hook";
    if (action === "clear") return "Clear";
    return action;
  }

  function actionLabel(action, fallback = actionBaseLabel(action)) {
    return pendingAction === action ? `${fallback} again` : fallback;
  }

  function pendingActionLabel() {
    return actionBaseLabel(pendingAction);
  }

  function clearPendingAction(shouldRefresh = true) {
    if (pendingActionTimer) clearTimeout(pendingActionTimer);
    pendingActionTimer = null;
    pendingAction = null;
    if (shouldRefresh) refreshUi();
  }

  function runConfirmedUiAction(action, callback) {
    if (pendingAction !== action) {
      clearPendingAction(false);
      pendingAction = action;
      pendingActionTimer = setTimeout(clearPendingAction, confirmClickMs);
      refreshUi();
      return api;
    }
    clearPendingAction(false);
    return runUiAction(callback);
  }

  function returnGameFocus() {
    setTimeout(() => {
      try { uiRoot?.activeElement?.blur?.(); }
      catch (_) {}
      try {
        if (document.activeElement === uiHost || uiHost?.contains(document.activeElement)) {
          document.activeElement?.blur?.();
        }
      } catch (_) {}

      const target = document.querySelector("canvas, #game, #game-container, #window-container") || document.body;
      if (!target || typeof target.focus !== "function") return;
      const hadTabIndex = target.hasAttribute("tabindex");
      if (!hadTabIndex) target.setAttribute("tabindex", "-1");
      try { target.focus({ preventScroll: true }); }
      catch (_) {
        try { target.focus(); }
        catch (__) {}
      }
      if (!hadTabIndex && target !== document.body) target.removeAttribute("tabindex");
    }, 0);
  }

  function runUiAction(action) {
    try {
      clearPendingAction(false);
      const result = action();
      if (result && typeof result.finally === "function") result.finally(returnGameFocus);
      else returnGameFocus();
      return result;
    } catch (error) {
      returnGameFocus();
      throw error;
    }
  }

  function bindUi() {
    for (const button of uiRoot.querySelectorAll("button")) {
      button.tabIndex = -1;
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      button.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
    }
    uiRoot.querySelector("[data-action='capture']")?.addEventListener("click", () => {
      if (capturing) runUiAction(() => stopCapture());
      else runConfirmedUiAction("capture", () => startCapture());
    });
    uiRoot.querySelector("[data-action='hook']")?.addEventListener("click", () => runConfirmedUiAction("hook", () => {
      try { install(); }
      catch (error) { eventRecord("official-ws-hook-error", currentSocket(), { message: error.message }); }
      refreshUi();
    }));
    uiRoot.querySelector("[data-action='download']")?.addEventListener("click", () => runUiAction(() => download()));
    uiRoot.querySelector("[data-action='copy']")?.addEventListener("click", () => runUiAction(async () => {
      try { await copy(); }
      catch (error) { eventRecord("official-ws-copy-error", socket, { message: error.message }); }
    }));
    uiRoot.querySelector("[data-action='clear']")?.addEventListener("click", () => runConfirmedUiAction("clear", () => clear()));
    uiRoot.querySelector("[data-action='minimize']")?.addEventListener("click", () => runUiAction(() => {
      minimized = !minimized;
      refreshUi();
    }));
    uiRoot.querySelector("[data-action='close']")?.addEventListener("click", () => runUiAction(() => {
      if (uiHost) uiHost.style.display = "none";
    }));
  }

  function uiHtml() {
    return `
      <style>
        :host {
          all: initial;
          color-scheme: light;
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
        }
        * { box-sizing: border-box; }
        .panel {
          width: 250px;
          border: 1px solid #1d2a31;
          border-radius: 10px;
          background: linear-gradient(145deg, #0c1519, #142229);
          color: #e8f3f2;
          box-shadow: 0 10px 28px rgba(0, 0, 0, 0.35);
          overflow: hidden;
          font-size: 12px;
          line-height: 1.35;
        }
        .panel.capturing .dot { background: #34d399; box-shadow: 0 0 10px rgba(52, 211, 153, 0.75); }
        .panel.waiting .dot { background: #f59e0b; box-shadow: 0 0 10px rgba(245, 158, 11, 0.75); }
        .panel:not(.hooked):not(.waiting) .dot { background: #ef4444; box-shadow: 0 0 10px rgba(239, 68, 68, 0.75); }
        .head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 9px;
          background: rgba(255, 255, 255, 0.05);
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }
        .title {
          display: flex;
          align-items: center;
          gap: 7px;
          font-weight: 700;
          letter-spacing: 0.02em;
        }
        .dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: #94a3b8;
        }
        .head-actions {
          display: flex;
          gap: 5px;
        }
        .body {
          padding: 9px;
        }
        .row {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          padding: 2px 0;
        }
        .key { color: #93a8ad; }
        .value {
          color: #f8fafc;
          text-align: right;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .buttons {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
          margin-top: 9px;
        }
        button {
          all: unset;
          cursor: pointer;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 7px;
          padding: 5px 7px;
          text-align: center;
          background: rgba(255, 255, 255, 0.08);
          color: #e8f3f2;
          font-weight: 650;
        }
        button:hover {
          background: rgba(255, 255, 255, 0.16);
        }
        button.primary {
          background: #0f766e;
          border-color: #14b8a6;
        }
        .panel.capturing button.primary {
          background: #9f1239;
          border-color: #fb7185;
        }
        .tiny {
          padding: 2px 5px;
          border-radius: 5px;
          font-size: 11px;
          color: #b9c9cc;
        }
      </style>
      <div class="panel">
        <div class="head">
          <div class="title"><span class="dot"></span><span>Dredless WS</span></div>
          <div class="head-actions">
            <button class="tiny" data-action="minimize"><span data-field="minimized-label">Hide</span></button>
            <button class="tiny" data-action="close">x</button>
          </div>
        </div>
        <div class="body">
          <div class="row"><span class="key">status</span><span class="value" data-field="status">starting</span></div>
          <div class="row"><span class="key">socket</span><span class="value" data-field="socket">-</span></div>
          <div class="row"><span class="key">records</span><span class="value" data-field="records">0</span></div>
          <div class="row"><span class="key">frames</span><span class="value" data-field="frames">0 in / 0 out</span></div>
          <div class="buttons">
            <button class="primary" data-action="capture">Stop</button>
            <button data-action="hook">Hook</button>
            <button data-action="download">Download</button>
            <button data-action="copy">Copy</button>
            <button data-action="clear">Clear</button>
          </div>
        </div>
      </div>
    `;
  }

  const api = {
    version: VERSION,
    records,
    options,
    currentSocket,
    hook,
    install,
    wait,
    restore,
    stop: restore,
    startPolling,
    stopPolling,
    startCapture,
    stopCapture,
    toggleCapture,
    sendBase64,
    sendText,
    clear,
    dump,
    download,
    copy,
    showUi,
    removeUi,
    summary
  };

  global[GLOBAL_KEY] = api;
  global[PUBLIC_KEY] = api;
  install();
  showUi();
  console.info("dredless official websocket userscript installed", summary());
  return api;
})();
