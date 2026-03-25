/* ---------- YSync Popup Script ---------- */
const status = document.getElementById("status");

const createBtn = document.getElementById("create");
const joinBtn = document.getElementById("join");
const leaveBtn = document.getElementById("leave");

const joinPanel = document.getElementById("joinPanel");
const confirmJoin = document.getElementById("confirmJoin");
const cancelJoin = document.getElementById("cancelJoin");
const codeInput = document.getElementById("codeInput");

let inSession = false;
let sessionCode = null;

function setStatus(text, color = "#fff") {
    status.textContent = text;
    status.style.color = color;
}

function updateButtons() {
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
        if (!tabs || tabs.length === 0) {
            cb(null);
            return;
        }
        try {
            const url = new URL(tabs[0].url);
            cb(url.searchParams.get("v"));
        } catch {
            cb(null);
        }
    });
}

// ---------------- SAFE SESSION CHECK ----------------
function checkSession() {

    chrome.runtime.sendMessage({ type: "GET_SESSION" }, session => {

        // Handle null/undefined response gracefully
        if (!session || !session.code) {
            setStatus("Not in session");
            inSession = false;
            sessionCode = null;
            updateButtons();
            return;
        }

        inSession = true;
        sessionCode = session.code;
        setStatus("Session: " + session.code, "#4caf50");
        updateButtons();
    });
}

// Initial check with multiple attempts to handle async storage load
checkSession();
let checks = 0;
const maxChecks = 5;
const checkInterval = setInterval(() => {
    checks++;
    checkSession();
    if (checks >= maxChecks) {
        clearInterval(checkInterval);
    }
}, 300);

// Fallback timeout
setTimeout(() => {
    if (!inSession) {
        console.log("[YSync] Initial session check timed out");
    }
}, 2000);


createBtn.onclick = () => {

    hideJoinPanel();

    getVideoId(videoId => {

        if (!videoId) {
            setStatus("No video found on current page", "#f44336");
            setTimeout(() => setStatus("Not in session"), 2000);
            return;
        }

        chrome.runtime.sendMessage({
            type: "CREATE_SESSION",
            videoId
        }, res => {
            if (res && res.code) {
                setStatus("Creating session " + res.code, "#4caf50");
            } else {
                setStatus("Failed to create session", "#f44336");
                setTimeout(() => setStatus("Not in session"), 2000);
            }
        });
    });
};

joinBtn.onclick = showJoinPanel;

confirmJoin.onclick = () => {

    const code = codeInput.value.trim();

    // Validate 4-digit code
    if (!/^\d{4}$/.test(code)) {
        setStatus("Invalid code format (must be 4 digits)", "#f44336");
        setTimeout(() => setStatus("Join Session"), 2000);
        return;
    }

    getVideoId(videoId => {

        if (!videoId) {
            setStatus("No video found on current page", "#f44336");
            setTimeout(() => setStatus("Join Session"), 2000);
            return;
        }

        chrome.runtime.sendMessage({
            type: "JOIN_SESSION",
            code,
            videoId
        }, () => {
            setStatus("Joining session...");
        });
    });
};

cancelJoin.onclick = () => {
    hideJoinPanel();
    setStatus("Not in session");
};

leaveBtn.onclick = () => {

    chrome.runtime.sendMessage({ type: "LEAVE_SESSION" }, () => {
        // Handle response if needed
    });

    setStatus("Leaving session...");
    inSession = false;
    sessionCode = null;
    updateButtons();
};

// Message listener for real-time session updates
let messageListenerAdded = false;
function addMessageListener() {
    if (messageListenerAdded) return;
    messageListenerAdded = true;

    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

        if (msg.type === "SESSION_CONFIRMED") {
            setStatus("Session: " + msg.code, "#4caf50");
            inSession = true;
            sessionCode = msg.code;
            updateButtons();
            hideJoinPanel();
        }

        if (msg.type === "SESSION_TERMINATED") {
            setStatus("Session ended", "#f44336");
            inSession = false;
            sessionCode = null;
            updateButtons();
            hideJoinPanel();
        }

        if (msg.type === "SESSION_ERROR") {
            setStatus(msg.error || "Session error", "#f44336");
            inSession = false;
            updateButtons();
            setTimeout(() => setStatus("Not in session"), 2000);
        }

        return false; // Async response not needed
    });
}

addMessageListener();

// Cleanup on popup close
window.addEventListener("beforeunload", () => {
    console.log("[YSync] Popup closing");
});
