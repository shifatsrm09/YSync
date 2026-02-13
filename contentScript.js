console.log("[YSync] Content loaded");

let lastVideo = null;
let lastRemoteAction = 0;

const SUPPRESSION_WINDOW = 250;

let inSession = false;   // 🔥 NEW SESSION FLAG


// ---------------- SESSION STATE TRACKING ----------------
chrome.runtime.onMessage.addListener(msg => {

    if (msg.type === "SESSION_CONFIRMED") {
        console.log("[YSync] Session confirmed → enabling sync send");
        inSession = true;
        return;
    }

    if (msg.type === "SESSION_TERMINATED") {
        console.log("[YSync] Session terminated → disabling sync send");
        inSession = false;
        return;
    }
});


// ---------------- GET VIDEO ----------------
function getVideo() {
    return document.querySelector("video");
}

function getVideoId() {
    try {
        return new URL(location.href).searchParams.get("v");
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

    console.log(`[YSync] ${label} sent`);

    chrome.runtime.sendMessage(payload);
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
    setInterval(() => {

        sendIfSession({
            type: "ALIVE",
            videoId: getVideoId(),
            time: video.currentTime
        }, "ALIVE");

    }, 30000);
}


// ---------------- WATCH VIDEO ----------------
function watchVideo() {

    setInterval(() => {

        const video = getVideo();
        if (!video) return;

        if (video !== lastVideo) {

            console.log("[YSync] Video changed → reattaching");

            lastVideo = video;
            attach(video);
        }

    }, 1000);
}


// ---------------- MESSAGE HANDLER ----------------
chrome.runtime.onMessage.addListener(msg => {

    const video = getVideo();
    if (!video) return;

    if (msg.videoId && msg.videoId !== getVideoId()) return;

    // REQUEST SYNC SNAPSHOT
    if (msg.type === "REQUEST_SYNC_STATE") {

        if (!inSession) return;

        console.log("[YSync] REQUEST_SYNC_STATE received → sending snapshot");

        chrome.runtime.sendMessage({
            type: "SYNC_STATE",
            videoId: getVideoId(),
            time: video.currentTime,
            paused: video.paused
        });

        return;
    }

    // APPLY SNAPSHOT
    if (msg.type === "SYNC_STATE") {

        console.log("[YSync] SYNC_STATE received");

        lastRemoteAction = Date.now();

        video.currentTime = msg.time;

        if (msg.paused) video.pause();
        else video.play();

        return;
    }

    lastRemoteAction = Date.now();

    if (msg.type === "PLAY") {

        console.log("[YSync] PLAY received");

        video.currentTime = msg.time;
        video.play();
    }

    if (msg.type === "PAUSE") {

        console.log("[YSync] PAUSE received");

        video.currentTime = msg.time;
        video.pause();
    }

    if (msg.type === "SEEK") {

        console.log("[YSync] SEEK received");

        video.currentTime = msg.time;
    }

    if (msg.type === "ALIVE") {
        console.log("[YSync] ALIVE received");
    }
});


watchVideo();
