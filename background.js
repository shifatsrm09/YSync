importScripts("config.js");

let socket = null;
let activeSession = null;
let messageQueue = [];

chrome.storage.local.get("activeSession", data => {
    if (data.activeSession) {
        activeSession = data.activeSession;
    }
});

function flushQueue() {
    while (messageQueue.length > 0 &&
           socket &&
           socket.readyState === WebSocket.OPEN) {

        const payload = messageQueue.shift();
        socket.send(JSON.stringify(payload));
    }
}

function connect() {

    if (socket && socket.readyState === WebSocket.OPEN) return;

    socket = new WebSocket(YSYNC_SERVER);

    socket.onopen = () => {

        console.log("[YSync] Connected");
        flushQueue();

        if (activeSession) {
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

        chrome.tabs.query({ url: "*://*.youtube.com/*" }, tabs => {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, msg);
            });
        });
    };

    socket.onclose = () => {
        console.log("[YSync] Socket closed");
    };
}

function send(payload) {

    console.log("[YSync] Sending ->", payload.type);

    connect();

    if (!socket || socket.readyState !== WebSocket.OPEN) {
        messageQueue.push(payload);
        return;
    }

    socket.send(JSON.stringify(payload));
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

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

    if (msg.type === "JOIN_SESSION") {

        send({
            type: "JOIN_ROOM",
            room: msg.code,
            videoId: msg.videoId
        });

        return true;
    }

    if (msg.type === "LEAVE_SESSION") {

        activeSession = null;
        chrome.storage.local.remove("activeSession");

        if (socket) {
            socket.close();
            socket = null;
        }

        return;
    }

    if (
        activeSession &&
        ["PLAY", "PAUSE", "SEEK", "ALIVE"].includes(msg.type)
    ) {
        send(msg);
    }
});
