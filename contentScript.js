let isRemote = false;

function getVideo() {
    return document.querySelector("video");
}

function getVideoId() {
    return new URL(location.href).searchParams.get("v");
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

chrome.runtime.onMessage.addListener(msg => {

    const video = getVideo();
    if (!video) return;

    if (msg.videoId !== getVideoId()) return;

    isRemote = true;

    if (msg.type === "PLAY") video.play();
    if (msg.type === "PAUSE") video.pause();
    if (msg.type === "SEEK") video.currentTime = msg.time;

    setTimeout(() => isRemote = false, 150);
});

setInterval(() => {
    const video = getVideo();
    if (video) attach(video);
}, 1000);
