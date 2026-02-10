const status = document.getElementById("status");

const createBtn = document.getElementById("create");
const joinBtn = document.getElementById("join");
const leaveBtn = document.getElementById("leave");

const joinPanel = document.getElementById("joinPanel");
const confirmJoin = document.getElementById("confirmJoin");
const cancelJoin = document.getElementById("cancelJoin");
const codeInput = document.getElementById("codeInput");


// ---------- UTIL ----------
function setStatus(text, color = "#fff") {
    status.textContent = text;
    status.style.color = color;
}

function showJoinPanel() {
    joinPanel.classList.remove("hidden");
    codeInput.focus();
}

function hideJoinPanel() {
    joinPanel.classList.add("hidden");
    codeInput.value = "";
}

// Get YouTube video ID from active tab
function getVideoId(callback) {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        try {
            const url = new URL(tabs[0].url);
            callback(url.searchParams.get("v"));
        } catch {
            callback(null);
        }
    });
}


// ---------- LOAD SESSION ----------
chrome.runtime.sendMessage({ type: "GET_SESSION" }, session => {

    if (!session) {
        setStatus("Not in session");
        return;
    }

    setStatus("Session: " + session.code, "#4caf50");
});


// ---------- CREATE SESSION ----------
createBtn.onclick = () => {

    hideJoinPanel();

    getVideoId(videoId => {

        if (!videoId) {
            setStatus("Open a YouTube video first", "#f44336");
            return;
        }

        chrome.runtime.sendMessage(
            {
                type: "CREATE_SESSION",
                videoId
            },
            res => {

                if (!res?.code) {
                    setStatus("Failed to create session", "#f44336");
                    return;
                }

                setStatus("Creating session " + res.code);
            }
        );

    });
};


// ---------- OPEN JOIN PANEL ----------
joinBtn.onclick = () => {
    showJoinPanel();
};


// ---------- CONFIRM JOIN ----------
confirmJoin.onclick = () => {

    const code = codeInput.value.trim();

    if (!/^\d{4}$/.test(code)) {
        setStatus("Enter valid 4-digit code", "#f44336");
        return;
    }

    getVideoId(videoId => {

        if (!videoId) {
            setStatus("Open the same YouTube video", "#f44336");
            return;
        }

        chrome.runtime.sendMessage(
            {
                type: "JOIN_SESSION",
                code,
                videoId
            },
            () => {
                setStatus("Joining session...");
            }
        );

    });
};


// ---------- CANCEL JOIN ----------
cancelJoin.onclick = () => {
    hideJoinPanel();
};


// ---------- LEAVE SESSION ----------
leaveBtn.onclick = () => {

    chrome.runtime.sendMessage({ type: "LEAVE_SESSION" }, () => {
        setStatus("Not in session");
        hideJoinPanel();
    });
};


// ---------- BACKGROUND / SERVER EVENTS ----------
chrome.runtime.onMessage.addListener(msg => {

    if (msg.type === "SESSION_CONFIRMED") {
        setStatus("Session: " + msg.code, "#4caf50");
        hideJoinPanel();
    }

    if (msg.type === "SESSION_ERROR") {
        setStatus(msg.error, "#f44336");
    }

    if (msg.type === "SESSION_TERMINATED") {
        setStatus("Session ended", "#f44336");
        hideJoinPanel();
    }
});
