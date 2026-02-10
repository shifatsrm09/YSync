let socket = null;
let activeSession = null;
let isConnecting = false;


// Restore session if extension reloads
chrome.storage.local.get("activeSession", data => {
    if (data.activeSession) {
        activeSession = data.activeSession;
        connect();
    }
});


function connect() {

    if (socket && socket.readyState === WebSocket.OPEN) return;
    if (isConnecting) return;

    isConnecting = true;

    socket = new WebSocket("ws://localhost:3000");

    socket.onopen = () => {
        isConnecting = false;
        console.log("[YSync] WebSocket connected");
    };

    socket.onclose = () => {
        isConnecting = false;
        console.log("[YSync] WebSocket closed");
    };

    socket.onerror = () => {
        isConnecting = false;
        console.log("[YSync] WebSocket error");
    };


    socket.onmessage = event => {

        const msg = JSON.parse(event.data);

        // ---------- SESSION CONFIRMED ----------
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

            return; // 🔥 IMPORTANT
        }

        // ---------- SESSION ERROR ----------
        if (msg.type === "ERROR") {

            chrome.runtime.sendMessage({
                type: "SESSION_ERROR",
                error: msg.error
            });

            return; // 🔥 IMPORTANT
        }

        // ---------- SYNC EVENTS ----------
        chrome.tabs.query({ url: "*://*.youtube.com/*" }, tabs => {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, msg, () => {});
            });
        });
    };
}


// Wait until socket is OPEN before sending
function sendWhenReady(payload) {

    connect();

    const send = () => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(payload));
        } else {
            setTimeout(send, 100);
        }
    };

    send();
}


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

    // ---------- CREATE ----------
    if (message.type === "CREATE_SESSION") {

        const room = Math.floor(1000 + Math.random() * 9000).toString();

        sendWhenReady({
            type: "CREATE_ROOM",
            room,
            videoId: message.videoId
        });

        sendResponse({ code: room });
        return true;
    }


    // ---------- JOIN ----------
    if (message.type === "JOIN_SESSION") {

        sendWhenReady({
            type: "JOIN_ROOM",
            room: message.code,
            videoId: message.videoId
        });

        sendResponse({ joining: true });
        return true;
    }


    // ---------- GET SESSION ----------
    if (message.type === "GET_SESSION") {
        sendResponse(activeSession);
        return true;
    }


    // ---------- SYNC EVENTS ----------
    if (
        socket &&
        socket.readyState === WebSocket.OPEN &&
        activeSession
    ) {
        socket.send(JSON.stringify(message));
    }

});
