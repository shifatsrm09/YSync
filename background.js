console.log("[YSync] Background started");

let sessionVideoId = null;

chrome.runtime.onMessage.addListener((message, sender) => {

    if (!sender.tab) return;

    const senderTabId = sender.tab.id;

    // Initialize session video
    if (!sessionVideoId) {
        sessionVideoId = message.videoId;
        console.log("[YSync] Session video set:", sessionVideoId);
    }

    // Reject mismatched videos
    if (message.videoId !== sessionVideoId) {
        console.log("[YSync] Ignored event from mismatched video");
        return;
    }

    chrome.tabs.query({}, (tabs) => {

        tabs.forEach(tab => {

            if (tab.id !== senderTabId) {

                chrome.tabs.sendMessage(tab.id, message);

            }

        });

    });

});
