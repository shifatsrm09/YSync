console.log("[YSync] Content loaded");

let videoFound = false;
let isRemote = false;

function getVideo() {
    return document.querySelector("video");
}

function getVideoId() {
    const url = new URL(location.href);
    return url.searchParams.get("v");
}

function attach(video) {

    video.addEventListener("play", () => {
        if (isRemote) return;

        chrome.runtime.sendMessage({
            type: "PLAY",
            videoId: getVideoId()
        });
    });

    video.addEventListener("pause", () => {
        if (isRemote) return;

        chrome.runtime.sendMessage({
            type: "PAUSE",
            videoId: getVideoId()
        });
    });

    video.addEventListener("seeked", () => {
        if (isRemote) return;

        chrome.runtime.sendMessage({
            type: "SEEK",
            time: video.currentTime,
            videoId: getVideoId()
        });
    });
}

chrome.runtime.onMessage.addListener(message => {

    const video = getVideo();
    if (!video) return;

    if (message.videoId !== getVideoId()) return;

    isRemote = true;

    if (message.type === "PLAY") video.play();
    if (message.type === "PAUSE") video.pause();
    if (message.type === "SEEK") video.currentTime = message.time;

    setTimeout(() => isRemote = false, 150);
});

const wait = setInterval(() => {
    const v = getVideo();
    if (v && !videoFound) {
        videoFound = true;
        attach(v);
        clearInterval(wait);
    }
}, 1000);
