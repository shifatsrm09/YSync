const status = document.getElementById("status");

const createBtn = document.getElementById("create");
const joinBtn = document.getElementById("join");
const leaveBtn = document.getElementById("leave");

const joinPanel = document.getElementById("joinPanel");
const confirmJoin = document.getElementById("confirmJoin");
const cancelJoin = document.getElementById("cancelJoin");
const codeInput = document.getElementById("codeInput");

function setStatus(text, color = "#fff") {
    status.textContent = text;
    status.style.color = color;
}

function updateButtons(inSession, host) {

    createBtn.style.display = (!inSession) ? "block" : "none";
    joinBtn.style.display = (!inSession) ? "block" : "none";
    leaveBtn.style.display = (inSession) ? "block" : "none";
}

function showJoinPanel() {
    joinPanel.classList.remove("hidden");
    codeInput.focus();
}

function hideJoinPanel() {
    joinPanel.classList.add("hidden");
    codeInput.value = "";
}

function getVideoId(cb) {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        try {
            cb(new URL(tabs[0].url).searchParams.get("v"));
        } catch {
            cb(null);
        }
    });
}

chrome.runtime.sendMessage({ type: "GET_SESSION" }, session => {

    if (!session) {
        setStatus("Not in session");
        updateButtons(false);
        return;
    }

    setStatus("Session: " + session.code, "#4caf50");
    updateButtons(true);
});

createBtn.onclick = () => {

    hideJoinPanel();

    getVideoId(videoId => {

        chrome.runtime.sendMessage({
            type: "CREATE_SESSION",
            videoId
        }, res => {
            setStatus("Creating session " + res.code);
        });
    });
};

joinBtn.onclick = showJoinPanel;

confirmJoin.onclick = () => {

    const code = codeInput.value.trim();

    getVideoId(videoId => {

        chrome.runtime.sendMessage({
            type: "JOIN_SESSION",
            code,
            videoId
        });

        setStatus("Joining session...");
    });
};

cancelJoin.onclick = hideJoinPanel;

leaveBtn.onclick = () => {

    chrome.runtime.sendMessage({ type: "LEAVE_SESSION" });

    setStatus("Not in session");
    updateButtons(false);
};

chrome.runtime.onMessage.addListener(msg => {

    if (msg.type === "SESSION_CONFIRMED") {
        setStatus("Session: " + msg.code, "#4caf50");
        updateButtons(true, msg.isHost);
        hideJoinPanel();
    }

    if (msg.type === "SESSION_TERMINATED") {
        setStatus("Session ended", "#f44336");
        updateButtons(false);
        hideJoinPanel();
    }

    if (msg.type === "SESSION_ERROR") {
        setStatus(msg.error, "#f44336");
    }
});
