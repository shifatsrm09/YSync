importScripts("config.js");

let socket = null;
let activeSession = null;
let messageQueue = [];

// 🔥 NEW: prevents popup race condition
let sessionLoaded = false;


// ---------------- LOAD STORED SESSION ----------------
chrome.storage.local.get("activeSession", data => {

    if (data.activeSession) {
        activeSession = data.activeSession;
        console.log("[YSync] Loaded stored session:", activeSession.code);
    }

    sessionLoaded = true;
});


// ---------------- QUEUE FLUSH ----------------
function flushQueue() {

    while (
        messageQueue.length > 0 &&
        socket &&
        socket.readyState === WebSocket.OPEN
    ) {
        const payload = messageQueue.shift();
        socket.send(JSON.stringify(payload));
    }
}


// ---------------- CONNECT ----------------
function connect() {

    if (socket && socket.readyState === WebSocket.OPEN) return;

    console.log("[YSync] Connecting to server...");

    socket = new WebSocket(YSYNC_SERVER);

    socket.onopen = () => {

        console.log("[YSync] Connected");

        flushQueue();

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

        if (msg.type === "SESSION_TERMINATED") {

            console.log("[YSync] Session terminated");

            activeSession = null;
            chrome.storage.local.remove("activeSession");

            chrome.runtime.sendMessage({
                type: "SESSION_TERMINATED"
            });

            return;
        }

        if (msg.type === "ERROR") {

            chrome.runtime.sendMessage({
                type: "SESSION_ERROR",
                error: msg.error
            });

            return;
        }

        // Relay sync events
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

    if (!socket || socket.readyState !== WebSocket.OPEN) {
        messageQueue.push(payload);
        return;
    }

    socket.send(JSON.stringify(payload));
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

    // LEAVE SESSION
    if (msg.type === "LEAVE_SESSION") {

        console.log("[YSync] Leaving session");

        activeSession = null;
        chrome.storage.local.remove("activeSession");

        if (socket) {
            socket.close();
            socket = null;
        }

        return;
    }

    // 🔥 FIXED GET_SESSION
    if (msg.type === "GET_SESSION") {

        const waitForSession = () => {

            if (sessionLoaded) {
                sendResponse(activeSession);
            } else {
                setTimeout(waitForSession, 50);
            }
        };

        waitForSession();
        return true;
    }

    // RELAY SYNC EVENTS
    if (
        activeSession &&
        ["PLAY", "PAUSE", "SEEK", "ALIVE"].includes(msg.type)
    ) {
        send(msg);
    }
});
