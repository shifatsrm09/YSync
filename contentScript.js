console.log("[YSync] Content script loaded");

let videoFound = false;
let isRemoteAction = false;

function getVideo() {
    return document.querySelector("video");
}

function getYouTubeVideoId() {
    const url = new URL(window.location.href);
    return url.searchParams.get("v");
}

function waitForVideo() {

    const interval = setInterval(() => {

        const video = getVideo();

        if (video && !videoFound) {
            videoFound = true;

            console.log("[YSync] Video detected");

            attachVideoListeners(video);
            clearInterval(interval);
        }

    }, 1000);
}

function attachVideoListeners(video) {

    video.addEventListener("play", () => {
        if (isRemoteAction) return;

        chrome.runtime.sendMessage({
            type: "PLAY",
            videoId: getYouTubeVideoId()
        });
    });

    video.addEventListener("pause", () => {
        if (isRemoteAction) return;

        chrome.runtime.sendMessage({
            type: "PAUSE",
            videoId: getYouTubeVideoId()
        });
    });

    video.addEventListener("seeked", () => {
        if (isRemoteAction) return;

        chrome.runtime.sendMessage({
            type: "SEEK",
            time: video.currentTime,
            videoId: getYouTubeVideoId()
        });
    });
}


// Receive remote commands
chrome.runtime.onMessage.addListener((message) => {

    const video = getVideo();
    if (!video) return;

    // Ignore if video mismatch
    if (message.videoId !== getYouTubeVideoId()) {
        console.log("[YSync] Video mismatch. Ignoring sync.");
        return;
    }

    isRemoteAction = true;

    if (message.type === "PLAY") video.play();

    if (message.type === "PAUSE") video.pause();

    if (message.type === "SEEK") video.currentTime = message.time;

    setTimeout(() => {
        isRemoteAction = false;
    }, 150);
});

waitForVideo();
