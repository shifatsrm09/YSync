console.log("[YSync] Content script loaded");

let isRemote = false;
let attached = false;

function getVideo() {
    return document.querySelector("video");
}

function getVideoId() {
    return new URL(location.href).searchParams.get("v");
}

function attach(video) {

    if (attached) return;
    attached = true;

    video.addEventListener("play", () => {
        if (isRemote) return;

        console.log("[YSync] PLAY sent");

        chrome.runtime.sendMessage({
            type: "PLAY",
            videoId: getVideoId()
        });
    });

    video.addEventListener("pause", () => {
        if (isRemote) return;

        console.log("[YSync] PAUSE sent");

        chrome.runtime.sendMessage({
            type: "PAUSE",
            videoId: getVideoId()
        });
    });

    video.addEventListener("seeked", () => {
        if (isRemote) return;

        console.log("[YSync] SEEK sent");

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

    console.log("[YSync] Received", msg.type);

    isRemote = true;

    if (msg.type === "PLAY") video.play();
    if (msg.type === "PAUSE") video.pause();
    if (msg.type === "SEEK") video.currentTime = msg.time;

    setTimeout(() => isRemote = false, 200);
});


const observer = setInterval(() => {
    const video = getVideo();
    if (video) {
        attach(video);
        clearInterval(observer);
    }
}, 1000);
