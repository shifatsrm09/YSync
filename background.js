importScripts("config.js");

let socket = null;
let activeSession = null;
let messageQueue = [];
let sessionLoaded = false;

let reconnectTimer = null;
let lastAliveReceived = Date.now();


// ---------------- LOAD STORED SESSION ----------------
chrome.storage.local.get("activeSession", data => {

    if (data.activeSession) {
        activeSession = data.activeSession;
        console.log("[YSync] Loaded stored session:", activeSession.code);
    }

    sessionLoaded = true;
});


// ---------------- WATCHDOG ----------------
setInterval(() => {

    if (!socket) return;
    if (socket.readyState !== WebSocket.OPEN) return;

    if (Date.now() - lastAliveReceived > 65000) { // Safe vs 30s heartbeat
        console.log("[YSync] Heartbeat timeout → reconnecting");
        socket.close();
    }

}, 5000);


// ---------------- QUEUE ----------------
function flushQueue() {

    while (
        messageQueue.length > 0 &&
        socket &&
        socket.readyState === WebSocket.OPEN
    ) {
        socket.send(JSON.stringify(messageQueue.shift()));
    }
}


// ---------------- RECONNECT ----------------
function scheduleReconnect() {

    if (reconnectTimer) return;

    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
    }, 2000);
}


// ---------------- CONNECT ----------------
function connect() {

    if (socket && socket.readyState === WebSocket.OPEN) return;

    console.log("[YSync] Connecting...");

    socket = new WebSocket(YSYNC_SERVER);

    socket.onopen = () => {

        console.log("[YSync] Socket connected");

        lastAliveReceived = Date.now();
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

        if (msg.type === "ALIVE") {
            lastAliveReceived = Date.now();
        }

        // ---------------- SESSION CONFIRMED ----------------
        if (msg.type === "ROOM_CREATED" || msg.type === "JOINED") {

            activeSession = {
                code: msg.room,
                videoId: msg.videoId
            };

            chrome.storage.local.set({ activeSession });

            // Notify popup
            chrome.runtime.sendMessage({
                type: "SESSION_CONFIRMED",
                code: msg.room
            });

            // 🔥 Notify ALL content scripts
            chrome.tabs.query({ url: "*://*.youtube.com/*" }, tabs => {
                tabs.forEach(tab => {
                    chrome.tabs.sendMessage(tab.id, { type: "SESSION_CONFIRMED" });
                });
            });

            // 🔥 Request sync snapshot
            chrome.tabs.query({ url: "*://*.youtube.com/*" }, tabs => {
                tabs.forEach(tab => {
                    chrome.tabs.sendMessage(tab.id, { type: "REQUEST_SYNC_STATE" });
                });
            });

            return;
        }


        // ---------------- SESSION TERMINATED ----------------
        if (msg.type === "SESSION_TERMINATED") {

            activeSession = null;
            chrome.storage.local.remove("activeSession");

            chrome.runtime.sendMessage({
                type: "SESSION_TERMINATED"
            });

            // 🔥 Notify content scripts
            chrome.tabs.query({ url: "*://*.youtube.com/*" }, tabs => {
                tabs.forEach(tab => {
                    chrome.tabs.sendMessage(tab.id, { type: "SESSION_TERMINATED" });
                });
            });

            return;
        }


        // ---------------- RELAY SYNC EVENTS ----------------
        chrome.tabs.query({ url: "*://*.youtube.com/*" }, tabs => {
            tabs.forEach(tab => chrome.tabs.sendMessage(tab.id, msg));
        });
    };

    socket.onclose = () => {
        console.log("[YSync] Socket closed");
        scheduleReconnect();
    };

    socket.onerror = () => {
        console.log("[YSync] Socket error");
        socket.close();
    };
}


// ---------------- SEND ----------------
function send(payload) {

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

        // 🔥 Notify content scripts
        chrome.tabs.query({ url: "*://*.youtube.com/*" }, tabs => {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, { type: "SESSION_TERMINATED" });
            });
        });

        return;
    }

    // GET SESSION
    if (msg.type === "GET_SESSION") {

        const wait = () => {
            if (sessionLoaded) sendResponse(activeSession);
            else setTimeout(wait, 50);
        };

        wait();
        return true;
    }

    // RELAY EVENTS
    if (
        activeSession &&
        ["PLAY", "PAUSE", "SEEK", "ALIVE", "SYNC_STATE"].includes(msg.type)
    ) {
        send(msg);
    }
});
