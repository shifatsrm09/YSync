/* ---------- GLOBAL FIX ---------- */
* {
  box-sizing: border-box;
}

/* ---------- YSync Content Script ---------- */

console.log("[YSync] Content loaded");

let lastVideo = null;
let lastRemoteAction = 0;
let heartbeatTimer = null;
let inSession = false;

const SUPPRESSION_WINDOW = 250;
const VIDEO_WATCH_INTERVAL = 1000;
const HEARTBEAT_INTERVAL = 30000;

// ---------------- ERROR HANDLING WRAPPER ----------------
function safeSend(payload) {
    try {
        chrome.runtime.sendMessage(payload, () => {
            if (chrome.runtime.lastError) {
                console.log("[YSync] Send error:", chrome.runtime.lastError.message);
            }
        });
        return true;
    } catch (e) {
        console.log("[YSync] Exception in send:", e.message);
        return false;
    }
}

// ---------------- SESSION STATE TRACKING ----------------
function setSessionState(connected) {
    const wasInSession = inSession;
    inSession = connected;
    if (!wasInSession && inSession) {
        console.log("[YSync] Session confirmed → enabling sync send");
    } else if (wasInSession && !inSession) {
        console.log("[YSync] Session terminated → disabling sync send");
        stopHeartbeat();
    }
}

function stopHeartbeat() {
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    }
}

// ---------------- GET VIDEO ----------------
function getVideo() {
    return document.querySelector("video");
}

function getVideoId() {
    try {
        const url = new URL(location.href);
        return url.searchParams.get("v");
    } catch {
        return null;
    }
}

function shouldSuppress() {
    return Date.now() - lastRemoteAction < SUPPRESSION_WINDOW;
}

// ---------------- SAFE SEND WRAPPER ----------------
function sendIfSession(payload, label) {

    if (!inSession) {
        console.log(`[YSync] ${label} blocked (not in session)`);
        return;
    }

    if (!safeSend(payload)) {
        console.log(`[YSync] ${label} failed to send`);
        return;
    }

    console.log(`[YSync] ${label} sent`);
}

// ---------------- ATTACH LISTENERS ----------------
function attach(video) {

    if (video.__ysyncAttached) return;
    video.__ysyncAttached = true;

    console.log("[YSync] Listeners attached");

    video.addEventListener("play", () => {

        if (shouldSuppress()) return;

        sendIfSession({
            type: "PLAY",
            videoId: getVideoId(),
            time: video.currentTime
        }, "PLAY");
    });

    video.addEventListener("pause", () => {

        if (shouldSuppress()) return;

        sendIfSession({
            type: "PAUSE",
            videoId: getVideoId(),
            time: video.currentTime
        }, "PAUSE");
    });

    video.addEventListener("seeked", () => {

        if (shouldSuppress()) return;

        sendIfSession({
            type: "SEEK",
            videoId: getVideoId(),
            time: video.currentTime
        }, "SEEK");
    });

    // ---------------- HEARTBEAT (30s) ----------------
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {

        if (inSession) {
            sendIfSession({
                type: "ALIVE",
                videoId: getVideoId(),
                time: video.currentTime
            }, "ALIVE");
        }

    }, HEARTBEAT_INTERVAL);
}

// ---------------- WATCH VIDEO ----------------
function watchVideo() {

    setInterval(() => {

        const video = getVideo();
        if (!video) return;

        if (video !== lastVideo) {

            console.log("[YSync] Video changed → reattaching");

            if (lastVideo) {
                // Cleanup old video listeners
                const oldVideo = lastVideo;
                if (oldVideo.__ysyncAttached) {
                    delete oldVideo.__ysyncAttached;
                }
            }

            lastVideo = video;
            attach(video);
        }

    }, VIDEO_WATCH_INTERVAL);
}

// ---------------- MESSAGE HANDLER ----------------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

    const video = getVideo();
    if (!video) return false;

    // Validate videoId if present (prevents cross-video interference)
    const currentVideoId = getVideoId();
    if (msg.videoId && msg.videoId !== currentVideoId) {
        console.log("[YSync] Message ignored: videoId mismatch");
        return false;
    }

    // REQUEST SYNC SNAPSHOT
    if (msg.type === "REQUEST_SYNC_STATE") {

        if (!inSession) return false;

        console.log("[YSync] REQUEST_SYNC_STATE received → sending snapshot");

        chrome.runtime.sendMessage({
            type: "SYNC_STATE",
            videoId: currentVideoId,
            time: video.currentTime,
            paused: video.paused
        }, () => {
            if (chrome.runtime.lastError) {
                console.log("[YSync] Sync state send error:", chrome.runtime.lastError.message);
            }
        });

        return true; // Keep sendResponse valid
    }

    // APPLY SNAPSHOT
    if (msg.type === "SYNC_STATE") {

        console.log("[YSync] SYNC_STATE received");

        lastRemoteAction = Date.now();

        try {
            video.currentTime = msg.time;

            if (msg.paused) video.pause();
            else video.play();
        } catch (e) {
            console.log("[YSync] Error applying sync state:", e.message);
        }

        return true;
    }

    lastRemoteAction = Date.now();

    if (msg.type === "PLAY") {

        console.log("[YSync] PLAY received");

        try {
            video.currentTime = msg.time;
            video.play();
        } catch (e) {
            console.log("[YSync] Play error:", e.message);
        }
    }

    if (msg.type === "PAUSE") {

        console.log("[YSync] PAUSE received");

        try {
            video.currentTime = msg.time;
            video.pause();
        } catch (e) {
            console.log("[YSync] Pause error:", e.message);
        }
    }

    if (msg.type === "SEEK") {

        console.log("[YSync] SEEK received");

        try {
            video.currentTime = msg.time;
        } catch (e) {
            console.log("[YSync] Seek error:", e.message);
        }
    }

    if (msg.type === "ALIVE") {
        console.log("[YSync] ALIVE received");
    }

    return false;
});

// ---------------- SESSION STATE LISTENER ----------------
chrome.runtime.onMessage.addListener(msg => {

    if (msg.type === "SESSION_CONFIRMED") {
        setSessionState(true);
        // Reattach to current video if session just started
        const video = getVideo();
        if (video) attach(video);
    }

    if (msg.type === "SESSION_TERMINATED") {
        setSessionState(false);
    }

    if (msg.type === "SESSION_ERROR") {
        console.log("[YSync] Session error:", msg.error);
        setSessionState(false);
    }
});

// ---------------- INITIALIZATION ----------------
function initialize() {
    console.log("[YSync] Initializing...");
    watchVideo();
}

// Run on script load
initialize();
