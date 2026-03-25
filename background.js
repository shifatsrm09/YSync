/* ---------- YSync Background Script ---------- */
importScripts("config.js");

let socket = null;
let activeSession = null;
let messageQueue = [];
let sessionLoaded = false;
let heartbeatTimer = null;

// Reconnection state
let reconnectAttempts = 0;
let reconnectTimer = null;

// ---------------- LOAD STORED SESSION ----------------
chrome.storage.local.get("activeSession", data => {

    if (data.activeSession) {
        activeSession = data.activeSession;
        console.log("[YSync] Loaded stored session:", activeSession.code);
    }

    sessionLoaded = true;
});


// ---------------- WATCHDOG (HEARTBEAT CHECK) ----------------
function startHeartbeatWatchdog() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);

    heartbeatTimer = setInterval(() => {

        if (!socket || socket.readyState !== WebSocket.OPEN) return;

        if (Date.now() - lastAliveReceived > WS_HEARTBEAT_TIMEOUT) {
            console.log("[YSync] Heartbeat timeout → reconnecting");
            socket.close();
        }

    }, 5000); // Check every 5 seconds
}


// ---------------- QUEUE ----------------
function flushQueue() {

    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    while (messageQueue.length > 0) {
        // Limit queue size to prevent memory issues
        if (messageQueue.length > WS_MAX_QUEUE_SIZE) {
            console.log("[YSync] Message queue full, dropping oldest");
            messageQueue.shift();
            continue;
        }

        const msg = messageQueue.shift();
        try {
            socket.send(JSON.stringify(msg));
        } catch (e) {
            console.log("[YSync] Queue send error:", e.message);
            messageQueue.unshift(msg); // Put back for retry
            break;
        }
    }
}


// ---------------- RECONNECT WITH EXPONENTIAL BACKOFF ----------------
function calculateBackoffDelay() {
    const delay = WS_RECONNECT_MIN_DELAY * Math.pow(WS_RECONNECT_BACKOFF, reconnectAttempts);
    return Math.min(delay, WS_RECONNECT_MAX_DELAY);
}

function scheduleReconnect() {
    if (reconnectTimer) return;

    const delay = calculateBackoffDelay();
    reconnectAttempts++;

    console.log(`[YSync] Scheduling reconnection in ${delay}ms (attempt ${reconnectAttempts})`);

    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
    }, delay);
}


// ---------------- CONNECT ----------------
let lastAliveReceived = Date.now();

function connect() {

    // Don't reconnect if socket is already open
    if (socket && socket.readyState === WebSocket.OPEN) return;

    // Clear any existing reconnect timer
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }

    console.log("[YSync] Connecting...");

    try {
        socket = new WebSocket(YSYNC_SERVER);

        // Set connection timeout
        const connectTimeout = setTimeout(() => {
            if (socket && socket.readyState === WebSocket.CONNECTING) {
                console.log("[YSync] Connection timeout");
                socket.close();
            }
        }, WS_CONNECT_TIMEOUT);

        socket.onopen = () => {
            clearTimeout(connectTimeout);
            reconnectAttempts = 0; // Reset on successful connection

            console.log("[YSync] Socket connected");

            lastAliveReceived = Date.now();
            flushQueue();
            startHeartbeatWatchdog();

            if (activeSession) {
                console.log("[YSync] Rejoining session:", activeSession.code);

                try {
                    socket.send(JSON.stringify({
                        type: "JOIN_ROOM",
                        room: activeSession.code,
                        videoId: activeSession.videoId
                    }));
                } catch (e) {
                    console.log("[YSync] Rejoin send error:", e.message);
                }
            }
        };

        socket.onmessage = event => {

            let msg;
            try {
                msg = JSON.parse(event.data);
            } catch (e) {
                console.log("[YSync] Invalid message received");
                return;
            }

            console.log("[YSync] Server ->", msg.type);

            if (msg.type === "ALIVE") {
                lastAliveReceived = Date.now();
                // Send pong response
                try {
                    socket.send(JSON.stringify({ type: "ALIVE" }));
                } catch (e) {
                    console.log("[YSync] Pong send error:", e.message);
                }
            }

            // ---------------- SESSION CONFIRMED ----------------
            if (msg.type === "ROOM_CREATED" || msg.type === "JOINED") {

                activeSession = {
                    code: msg.room,
                    videoId: msg.videoId
                };

                chrome.storage.local.set({ activeSession }, () => {
                    if (chrome.runtime.lastError) {
                        console.log("[YSync] Storage error:", chrome.runtime.lastError.message);
                    }
                });

                chrome.runtime.sendMessage({
                    type: "SESSION_CONFIRMED",
                    code: msg.room
                }, () => {});

                chrome.tabs.query({ url: "*://*.youtube.com/*" }, tabs => {
                    tabs.forEach(tab => {
                        try {
                            chrome.tabs.sendMessage(tab.id, { type: "SESSION_CONFIRMED" });
                        } catch (e) {}
                    });
                });

                chrome.tabs.query({ url: "*://*.youtube.com/*" }, tabs => {
                    tabs.forEach(tab => {
                        try {
                            chrome.tabs.sendMessage(tab.id, { type: "REQUEST_SYNC_STATE" });
                        } catch (e) {}
                    });
                });

                return;
            }

            // ---------------- SESSION TERMINATED ----------------
            if (msg.type === "SESSION_TERMINATED" || msg.type === "ROOM_DESTROYED") {

                activeSession = null;
                chrome.storage.local.remove("activeSession");

                chrome.runtime.sendMessage({
                    type: "SESSION_TERMINATED"
                }, () => {});

                chrome.tabs.query({ url: "*://*.youtube.com/*" }, tabs => {
                    tabs.forEach(tab => {
                        try {
                            chrome.tabs.sendMessage(tab.id, { type: "SESSION_TERMINATED" });
                        } catch (e) {}
                    });
                });

                return;
            }

            // ---------------- RELAY SYNC EVENTS ----------------
            try {
                chrome.tabs.query({ url: "*://*.youtube.com/*" }, tabs => {
                    tabs.forEach(tab => {
                        try {
                            chrome.tabs.sendMessage(tab.id, msg);
                        } catch (e) {}
                    });
                });
            } catch (e) {
                console.log("[YSync] Relay error:", e.message);
            }
        };

        socket.onclose = event => {
            clearTimeout(connectTimeout);
            console.log(`[YSync] Socket closed (code: ${event.code})`);
            scheduleReconnect();
        };

        socket.onerror = error => {
            clearTimeout(connectTimeout);
            console.log("[YSync] Socket error:", error.message);
            socket.close();
        };

    } catch (e) {
        console.log("[YSync] Connect exception:", e.message);
        scheduleReconnect();
    }
}


// ---------------- SEND ----------------
function send(payload) {

    connect();

    if (!socket || socket.readyState !== WebSocket.OPEN) {
        // Check queue size before adding
        if (messageQueue.length >= WS_MAX_QUEUE_SIZE) {
            console.log("[YSync] Message queue full, dropping message");
            return;
        }
        messageQueue.push(payload);
        return;
    }

    try {
        socket.send(JSON.stringify(payload));
    } catch (e) {
        console.log("[YSync] Send exception:", e.message);
        messageQueue.push(payload);
    }
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

        // Validate session code
        if (!isValidSessionCode(msg.code)) {
            sendResponse({ error: "Invalid session code format" });
            return true;
        }

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

        if (socket && socket.readyState === WebSocket.OPEN) {
            send({
                type: "LEAVE_ROOM",
                room: activeSession ? activeSession.code : null
            });
        }

        activeSession = null;
        chrome.storage.local.remove("activeSession");

        if (socket) {
            socket.close();
            socket = null;
        }

        chrome.tabs.query({ url: "*://*.youtube.com/*" }, tabs => {
            tabs.forEach(tab => {
                try {
                    chrome.tabs.sendMessage(tab.id, { type: "SESSION_TERMINATED" });
                } catch (e) {}
            });
        });

        return;
    }

    // GET SESSION
    if (msg.type === "GET_SESSION") {

        const wait = () => {
            if (sessionLoaded) {
                sendResponse(activeSession);
            } else {
                setTimeout(wait, 100);
            }
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

// ---------------- CLEANUP ON UNLOAD ----------------
chrome.runtime.onStartup.addListener(() => {
    console.log("[YSync] Browser started, initializing...");
    connect();
});

chrome.runtime.onSuspend.addListener(() => {
    console.log("[YSync] Browser suspended, cleaning up...");
    if (socket) {
        socket.close();
        socket = null;
    }
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (reconnectTimer) clearTimeout(reconnectTimer);
});
