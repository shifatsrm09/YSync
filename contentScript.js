console.log("[YSync] Content loaded");

let videoFound = false;
let isRemoteAction = false;

function getVideo() {
    return document.querySelector("video");
}

function getVideoId() {
    const url = new URL(location.href);
    return url.searchParams.get("v");
}

function attach(video) {

    video.addEventListener("play", () => {
        if (isRemoteAction) return;

        chrome.runtime.sendMessage({
            type: "PLAY",
            videoId: getVideoId()
        });
    });

    video.addEventListener("pause", () => {
        if (isRemoteAction) return;

        chrome.runtime.sendMessage({
            type: "PAUSE",
            videoId: getVideoId()
        });
    });

    video.addEventListener("seeked", () => {
        if (isRemoteAction) return;

        chrome.runtime.sendMessage({
            type: "SEEK",
            time: video.currentTime,
            videoId: getVideoId()
        });
    });
}


// ---------- MESSAGE HANDLING ----------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

    // Used by background to check video match
    if (message.type === "YSYNC_PING") {
        sendResponse({ videoId: getVideoId() });
        return;
    }

    const video = getVideo();
    if (!video) return;

    if (message.videoId !== getVideoId()) return;

    isRemoteAction = true;

    if (message.type === "PLAY") video.play();
    if (message.type === "PAUSE") video.pause();
    if (message.type === "SEEK") video.currentTime = message.time;

    setTimeout(() => isRemoteAction = false, 150);
});


// ---------- VIDEO DETECTION ----------
const wait = setInterval(() => {
    const v = getVideo();
    if (v && !videoFound) {
        videoFound = true;
        attach(v);
        clearInterval(wait);
    }
}, 1000);
