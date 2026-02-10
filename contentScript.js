console.log("[YSync] Content loaded");

let lastRemoteAction = 0;
const SUPPRESSION_WINDOW = 500; // ms

function getVideo() {
    return document.querySelector("video");
}

function getVideoId() {
    return new URL(location.href).searchParams.get("v");
}

function shouldSuppress() {
    return Date.now() - lastRemoteAction < SUPPRESSION_WINDOW;
}

function attach(video) {

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
}


// ---------- REMOTE EVENTS ----------
chrome.runtime.onMessage.addListener(msg => {

    const video = getVideo();
    if (!video) return;

    if (msg.videoId !== getVideoId()) return;

    console.log("[YSync] Received", msg.type);

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


// ---------- VIDEO DETECTOR ----------
const observer = setInterval(() => {
    const video = getVideo();
    if (video) {
        attach(video);
        clearInterval(observer);
    }
}, 1000);
