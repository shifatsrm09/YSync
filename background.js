console.log("[YSync] Background started");

function generateCode() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

    (async () => {

        let { sessions = {}, activeSession = null } =
            await chrome.storage.local.get(["sessions", "activeSession"]);

        // ---------- CREATE SESSION ----------
        if (message.type === "CREATE_SESSION") {

            const code = generateCode();

            sessions[code] = { videoId: message.videoId };

            activeSession = {
                code,
                videoId: message.videoId
            };

            await chrome.storage.local.set({ sessions, activeSession });

            sendResponse({ code });
            return;
        }

        // ---------- JOIN SESSION ----------
        if (message.type === "JOIN_SESSION") {

            const session = sessions[message.code];

            if (!session) {
                sendResponse({ error: "Session not found" });
                return;
            }

            if (session.videoId !== message.videoId) {
                sendResponse({ error: "Video mismatch" });
                return;
            }

            activeSession = {
                code: message.code,
                videoId: message.videoId
            };

            await chrome.storage.local.set({ activeSession });

            sendResponse({ joined: true });
            return;
        }

        // ---------- LEAVE SESSION ----------
        if (message.type === "LEAVE_SESSION") {

            await chrome.storage.local.remove("activeSession");

            sendResponse({ left: true });
            return;
        }

        // ---------- GET SESSION ----------
        if (message.type === "GET_SESSION") {
            sendResponse(activeSession);
            return;
        }

        // ---------- SYNC EVENTS ----------
        if (!activeSession) return;
        if (!sender.tab) return;

        // Only allow sender if video matches session video
        if (message.videoId !== activeSession.videoId) return;

        chrome.tabs.query({}, tabs => {

            tabs.forEach(tab => {

                if (tab.id === sender.tab.id) return;

                chrome.tabs.sendMessage(
                    tab.id,
                    { type: "YSYNC_PING" },
                    response => {

                        if (!response) return;

                        if (response.videoId === activeSession.videoId) {
                            chrome.tabs.sendMessage(tab.id, message);
                        }

                    }
                );

            });

        });

    })();

    return true;
});
