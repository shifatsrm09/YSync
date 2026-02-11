let socket = null;
let activeSession = null;

function connect() {

    if (socket && socket.readyState === WebSocket.OPEN) return;

    socket = new WebSocket("ws://localhost:3000");

    socket.onopen = () => {
        console.log("[YSync] Socket connected");
    };

    socket.onmessage = event => {

        const msg = JSON.parse(event.data);

        console.log("[YSync] Server ->", msg.type);

        // SESSION
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

            activeSession = null;

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

        // ⭐ Forward EVERYTHING else to tabs
        chrome.tabs.query({ url: "*://*.youtube.com/*" }, tabs => {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, msg);
            });
        });
    };
}

function send(payload) {
    connect();

    const trySend = () => {
        if (socket.readyState === WebSocket.OPEN) {
            console.log("[YSync] Sending ->", payload.type);
            socket.send(JSON.stringify(payload));
        } else {
            setTimeout(trySend, 100);
        }
    };

    trySend();
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

        sendResponse({ joining: true });
        return true;
    }

    if (msg.type === "GET_SESSION") {
        sendResponse(activeSession);
        return true;
    }

    // ✅ ADDED ALIVE HERE (same behavior as PLAY/PAUSE/SEEK)
    if (
        socket &&
        socket.readyState === WebSocket.OPEN &&
        activeSession &&
        ["PLAY", "PAUSE", "SEEK", "ALIVE"].includes(msg.type)
    ) {
        send(msg);
    }
});
