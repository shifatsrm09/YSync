/* ---------- YSync Configuration ---------- */

// LOCAL DEVELOPMENT (Uncomment for local testing)
// const YSYNC_SERVER = "ws://localhost:3000";

// PRODUCTION (Default)
const YSYNC_SERVER = "wss://ysync-server.onrender.com";

/* ---------- WebSocket Connection Configuration ---------- */

// Connection timeout in milliseconds
const WS_CONNECT_TIMEOUT = 10000;

// Reconnection settings
const WS_RECONNECT_MIN_DELAY = 1000;  // Minimum delay before reconnection
const WS_RECONNECT_MAX_DELAY = 10000; // Maximum delay (capped)
const WS_RECONNECT_BACKOFF = 1.5;     // Exponential backoff multiplier

// Message queue settings
const WS_MAX_QUEUE_SIZE = 100; // Maximum messages to queue when disconnected

// Heartbeat settings (matching server)
const WS_HEARTBEAT_INTERVAL = 30000;    // Send heartbeat every 30s
const WS_HEARTBEAT_TIMEOUT = 65000;     // Timeout for pong response

// Validation function for session codes
function isValidSessionCode(code) {
    return typeof code === "string" && /^\d{4}$/.test(code);
}

// Validation function for video IDs (YouTube video IDs are 11 chars)
function isValidVideoId(id) {
    return typeof id === "string" && id.length === 11 && /^[a-zA-Z0-9_-]+$/.test(id);
}

// Safe URL parsing
function parseServerUrl(url) {
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") {
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

// Check if server is reachable
function checkServerConnectivity() {
    return new Promise((resolve) => {
        // Simple connectivity check using fetch
        // This won't actually connect to WebSocket, just check if host is reachable
        const headUrl = YSYNC_SERVER.replace(/^ws/, "http");
        fetch(headUrl + "favicon.ico", { method: "HEAD", mode: "no-cors" })
            .then(() => resolve(true))
            .catch(() => resolve(false));
    });
}

// Export for use in other modules (if needed)
if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        YSYNC_SERVER,
        WS_CONNECT_TIMEOUT,
        WS_RECONNECT_MIN_DELAY,
        WS_RECONNECT_MAX_DELAY,
        WS_RECONNECT_BACKOFF,
        WS_MAX_QUEUE_SIZE,
        WS_HEARTBEAT_INTERVAL,
        WS_HEARTBEAT_TIMEOUT,
        isValidSessionCode,
        isValidVideoId,
        parseServerUrl
    };
}
