const status = document.getElementById("status");

const createBtn = document.getElementById("create");
const joinBtn = document.getElementById("join");
const leaveBtn = document.getElementById("leave");

const joinPanel = document.getElementById("joinPanel");
const confirmJoin = document.getElementById("confirmJoin");
const cancelJoin = document.getElementById("cancelJoin");
const codeInput = document.getElementById("codeInput");


// ---------- UTIL ----------
function setStatus(text, color = "#e6e6e6") {
    status.textContent = text;
    status.style.color = color;
}

function disableCreate(disabled) {
    createBtn.disabled = disabled;
}

function hideJoinPanel() {
    joinPanel.classList.add("hidden");
    codeInput.value = "";
}

function showJoinPanel() {
    joinPanel.classList.remove("hidden");
    codeInput.focus();
}

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
        disableCreate(false);
        return;
    }

    setStatus(`Session: ${session.code}`, "#4caf50");
    disableCreate(true);
});


// ---------- CREATE ----------
createBtn.onclick = () => {

    getVideoId(videoId => {

        if (!videoId) {
            setStatus("Open a YouTube video first", "#f44336");
            return;
        }

        chrome.runtime.sendMessage(
            { type: "CREATE_SESSION", videoId },
            res => {

                if (!res?.code) return;

                setStatus(`Session Created: ${res.code}`, "#4caf50");
                disableCreate(true);
            }
        );

    });
};


// ---------- OPEN JOIN ----------
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
            setStatus("Open a YouTube video first", "#f44336");
            return;
        }

        chrome.runtime.sendMessage(
            {
                type: "JOIN_SESSION",
                code,
                videoId
            },
            res => {

                if (res?.error) {
                    setStatus(res.error, "#f44336");
                    return;
                }

                setStatus(`Joined: ${code}`, "#4caf50");
                disableCreate(true);
                hideJoinPanel();
            }
        );

    });
};


// ---------- CANCEL JOIN ----------
cancelJoin.onclick = () => {
    hideJoinPanel();
};


// ---------- LEAVE ----------
leaveBtn.onclick = () => {

    chrome.runtime.sendMessage({ type: "LEAVE_SESSION" }, () => {

        setStatus("Not in session");
        disableCreate(false);
        hideJoinPanel();

    });

};


// ---------- INPUT UX ----------
codeInput.addEventListener("input", () => {
    codeInput.value = codeInput.value.replace(/\D/g, "");
});

codeInput.addEventListener("keypress", e => {
    if (e.key === "Enter") confirmJoin.click();
});
