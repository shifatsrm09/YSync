let socket = null;
let activeSession = null;


// Restore session
chrome.storage.local.get("activeSession", data => {
    if (data.activeSession) {
        activeSession = data.activeSession;
        connect();
    }
});

function clearSession() {
    activeSession = null;
    chrome.storage.local.remove("activeSession");

    chrome.runtime.sendMessage({
        type: "SESSION_TERMINATED"
    });
}

function connect() {

    if (socket && socket.readyState === WebSocket.OPEN) return;

    socket = new WebSocket("ws://localhost:3000");

    socket.onmessage = event => {

        const msg = JSON.parse(event.data);

        if (msg.type === "ROOM_CREATED" || msg.type === "JOINED") {

            activeSession = { code: msg.room };
            chrome.storage.local.set({ activeSession });

            chrome.runtime.sendMessage({
                type: "SESSION_CONFIRMED",
                code: msg.room
            });
        }

        if (msg.type === "ROOM_CLOSED") {
            clearSession();
        }

        if (msg.type === "ERROR") {

            chrome.runtime.sendMessage({
                type: "SESSION_ERROR",
                error: msg.error
            });
        }
    };
}


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

    // CREATE
    if (message.type === "CREATE_SESSION") {

        connect();

        const room = Math.floor(1000 + Math.random() * 9000).toString();

        socket.addEventListener("open", () => {
            socket.send(JSON.stringify({
                type: "CREATE_ROOM",
                room
            }));
        }, { once: true });

        sendResponse({ code: room });
        return true;
    }


    // JOIN
    if (message.type === "JOIN_SESSION") {

        connect();

        socket.addEventListener("open", () => {
            socket.send(JSON.stringify({
                type: "JOIN_ROOM",
                room: message.code
            }));
        }, { once: true });

        sendResponse({ joining: true });
        return true;
    }


    // LEAVE
    if (message.type === "LEAVE_SESSION") {

        if (socket) socket.close();

        socket = null;
        clearSession();

        sendResponse({ left: true });
        return true;
    }


    // GET SESSION
    if (message.type === "GET_SESSION") {
        sendResponse(activeSession);
        return true;
    }
});
