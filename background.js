importScripts("config.js");

let socket = null;
let activeSession = null;

// ---------------- LOAD STORED SESSION ----------------
chrome.storage.local.get("activeSession", data => {
    if (data.activeSession) {
        activeSession = data.activeSession;
        console.log("[YSync] Loaded stored session:", activeSession.code);
    }
});

// ---------------- CONNECT ----------------
function connect() {

    if (socket && socket.readyState === WebSocket.OPEN) return;

    console.log("[YSync] Connecting to server...");

    socket = new WebSocket(YSYNC_SERVER);

    socket.onopen = () => {
        console.log("[YSync] Socket connected");

        // Rejoin session if stored
        if (activeSession) {

            console.log("[YSync] Rejoining session:", activeSession.code);

            socket.send(JSON.stringify({
                type: "JOIN_ROOM",
                room: activeSession.code,
                videoId: activeSession.videoId
            }));
        }
    };

    socket.onmessage = event => {

        const msg = JSON.parse(event.data);

        console.log("[YSync] Server ->", msg.type);

        // SESSION CREATED / JOINED
        if (msg.type === "ROOM_CREATED" || msg.type === "JOINED") {

            activeSession = {
                code: msg.room,
                videoId: msg.videoId
            };

            chrome.storage.local.set({ activeSession });

            chrome.runtime.sendMessage({
                type: "SESSION_CONFIRMED",
                code: msg.room
            });

            return;
        }

        // SESSION TERMINATED
        if (msg.type === "SESSION_TERMINATED") {

            console.log("[YSync] Session terminated by server");

            activeSession = null;
            chrome.storage.local.remove("activeSession");

            chrome.runtime.sendMessage({
                type: "SESSION_TERMINATED"
            });

            return;
        }

        // ERROR HANDLING
        if (msg.type === "ERROR") {

            console.log("[YSync] Server error:", msg.error);

            chrome.runtime.sendMessage({
                type: "SESSION_ERROR",
                error: msg.error
            });

            return;
        }

        // RELAY SYNC + HEARTBEAT EVENTS
        chrome.tabs.query({ url: "*://*.youtube.com/*" }, tabs => {

            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, msg);
            });

        });
    };

    socket.onclose = () => {
        console.log("[YSync] Socket closed");
    };

    socket.onerror = err => {
        console.log("[YSync] Socket error", err);
    };
}

// ---------------- SEND ----------------
function send(payload) {

    console.log("[YSync] Sending ->", payload.type);

    connect();

    const trySend = () => {

        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(payload));
        } else {
            setTimeout(trySend, 100);
        }
    };

    trySend();
}

// ---------------- MESSAGE HANDLER ----------------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

    // CREATE SESSION
    if (msg.type === "CREATE_SESSION") {

        const room = Math.floor(1000 + Math.random() * 9000).toString();

        send({
            type: "CREATE_ROOM",
            room,
            videoId: msg.videoId
        });

        sendResponse({ code: room });
        return true;
    }

    // JOIN SESSION
    if (msg.type === "JOIN_SESSION") {

        send({
            type: "JOIN_ROOM",
            room: msg.code,
            videoId: msg.videoId
        });

        return true;
    }

    // LEAVE SESSION  🔥 FIXED
    if (msg.type === "LEAVE_SESSION") {

        console.log("[YSync] Leaving session");

        activeSession = null;

        // Remove stored session (fixes auto reconnect bug)
        chrome.storage.local.remove("activeSession");

        if (socket) {
            socket.close();
            socket = null;
        }

        return;
    }

    // GET SESSION
    if (msg.type === "GET_SESSION") {
        sendResponse(activeSession);
        return true;
    }

    // SYNC + HEARTBEAT RELAY
    if (
        socket &&
        socket.readyState === WebSocket.OPEN &&
        activeSession &&
        ["PLAY", "PAUSE", "SEEK", "ALIVE"].includes(msg.type)
    ) {
        send(msg);
    }
});
