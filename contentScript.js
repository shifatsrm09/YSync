console.log("[WATCH-PARTY] Content script loaded");

let videoFound = false;
let isRemoteAction = false;

function getVideo() {
    return document.querySelector("video");
}

function waitForVideo() {
    const interval = setInterval(() => {

        const video = getVideo();

        if (video && !videoFound) {
            videoFound = true;
            console.log("[WATCH-PARTY] Video detected");
            attachVideoListeners(video);
            clearInterval(interval);
        }

    }, 1000);
}

function attachVideoListeners(video) {

    video.addEventListener("play", () => {
        if (isRemoteAction) return;

        console.log("[WATCH-PARTY] PLAY detected (local)");
        chrome.runtime.sendMessage({ type: "PLAY" });
    });

    video.addEventListener("pause", () => {
        if (isRemoteAction) return;

        console.log("[WATCH-PARTY] PAUSE detected (local)");
        chrome.runtime.sendMessage({ type: "PAUSE" });
    });

    // SEEK detection
    video.addEventListener("seeked", () => {
        if (isRemoteAction) return;

        console.log("[WATCH-PARTY] SEEK detected (local)", video.currentTime);

        chrome.runtime.sendMessage({
            type: "SEEK",
            time: video.currentTime
        });
    });
}

// Receive messages from background
chrome.runtime.onMessage.addListener((message) => {

    const video = getVideo();
    if (!video) return;

    isRemoteAction = true;

    if (message.type === "PLAY") {
        console.log("[WATCH-PARTY] PLAY applied (remote)");
        video.play();
    }

    if (message.type === "PAUSE") {
        console.log("[WATCH-PARTY] PAUSE applied (remote)");
        video.pause();
    }

    if (message.type === "SEEK") {
        console.log("[WATCH-PARTY] SEEK applied (remote)", message.time);
        video.currentTime = message.time;
    }

    setTimeout(() => {
        isRemoteAction = false;
    }, 150);
});

waitForVideo();
