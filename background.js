importScripts("config.js");

let socket = null;
let activeSession = null;

function connect() {

    if (socket && socket.readyState === WebSocket.OPEN) return;

    socket = new WebSocket(YSYNC_SERVER);

    socket.onopen = () => {
        console.log("[YSync] Socket connected");
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
            activeSession = null;
            return;
        }

        if (msg.type === "ERROR") {
            return;
        }

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

        return true;
    }

    if (msg.type === "GET_SESSION") {
        sendResponse(activeSession);
        return true;
    }

    if (
        socket &&
        socket.readyState === WebSocket.OPEN &&
        activeSession &&
        ["PLAY", "PAUSE", "SEEK", "ALIVE"].includes(msg.type)
    ) {
        send(msg);
    }
});
