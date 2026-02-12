console.log("[YSync] Content loaded");

let lastVideo = null;
let lastRemoteAction = 0;

const SUPPRESSION_WINDOW = 250;   // keep stable


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


// ---------------- ATTACH LISTENERS ----------------
function attach(video) {

    if (video.__ysyncAttached) return;
    video.__ysyncAttached = true;

    console.log("[YSync] Listeners attached");

    video.addEventListener("play", () => {

        if (shouldSuppress()) return;

        console.log("[YSync] PLAY sent");

        chrome.runtime.sendMessage({
            type: "PLAY",
            videoId: getVideoId(),
            time: video.currentTime
        });
    });

    video.addEventListener("pause", () => {

        if (shouldSuppress()) return;

        console.log("[YSync] PAUSE sent");

        chrome.runtime.sendMessage({
            type: "PAUSE",
            videoId: getVideoId(),
            time: video.currentTime
        });
    });

    video.addEventListener("seeked", () => {

        if (shouldSuppress()) return;

        console.log("[YSync] SEEK sent");

        chrome.runtime.sendMessage({
            type: "SEEK",
            videoId: getVideoId(),
            time: video.currentTime
        });
    });

    // ---------------- HEARTBEAT (30 seconds) ----------------
    setInterval(() => {

        console.log("[YSync] ALIVE sent");

        chrome.runtime.sendMessage({
            type: "ALIVE",
            videoId: getVideoId(),
            time: video.currentTime
        });

    }, 30000);  // 🔥 30 seconds
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

        if (msg.paused) {
            video.pause();
        } else {
            video.play();
        }

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
