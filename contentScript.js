console.log("[YSync] Content loaded");

let lastVideo = null;
let lastRemoteAction = 0;
const SUPPRESSION_WINDOW = 250;

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


// ---------------- ATTACH ----------------
function attach(video) {

    if (video.__ysyncAttached) return;
    video.__ysyncAttached = true;

    console.log("[YSync] Listeners attached");

    video.addEventListener("play", () => {

        if (shouldSuppress()) return;

        chrome.runtime.sendMessage({
            type: "PLAY",
            videoId: getVideoId(),
            time: video.currentTime
        });
    });

    video.addEventListener("pause", () => {

        if (shouldSuppress()) return;

        chrome.runtime.sendMessage({
            type: "PAUSE",
            videoId: getVideoId(),
            time: video.currentTime
        });
    });

    video.addEventListener("seeked", () => {

        if (shouldSuppress()) return;

        chrome.runtime.sendMessage({
            type: "SEEK",
            videoId: getVideoId(),
            time: video.currentTime
        });
    });

    // Heartbeat
    setInterval(() => {

        chrome.runtime.sendMessage({
            type: "ALIVE",
            videoId: getVideoId(),
            time: video.currentTime
        });

    }, 15000);
}


// ---------------- VIDEO WATCH ----------------
function watchVideo() {

    setInterval(() => {

        const video = getVideo();
        if (!video) return;

        if (video !== lastVideo) {
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
        video.currentTime = msg.time;
        video.play();
    }

    if (msg.type === "PAUSE") {
        video.currentTime = msg.time;
        video.pause();
    }

    if (msg.type === "SEEK") {
        video.currentTime = msg.time;
    }
});

watchVideo();
