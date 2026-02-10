console.log("[WATCH-PARTY] Background service worker started");

chrome.runtime.onMessage.addListener((message, sender) => {

    if (!sender.tab) return;

    const senderTabId = sender.tab.id;

    chrome.tabs.query({}, (tabs) => {

        tabs.forEach((tab) => {

            // Don't send message back to sender
            if (tab.id !== senderTabId) {
                chrome.tabs.sendMessage(tab.id, message);
            }

        });

    });

});
