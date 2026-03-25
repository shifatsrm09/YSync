const WebSocket = require("ws");
require("dotenv").config();

const PORT = process.env.PORT || 3000;
const wss = new WebSocket.Server({ port: PORT });

const rooms = {};
const HEARTBEAT_INTERVAL = 30000;
const HEARTBEAT_TIMEOUT = 65000;

// Heartbeat timer
let heartbeatTimer = null;

function startHeartbeat() {
    if (heartbeatTimer) return;
    heartbeatTimer = setInterval(() => {
        const now = Date.now();
        wss.clients.forEach(client => {
            if (client.isHeartbeating === false) {
                // No pong response - close connection
                console.log("Heartbeat timeout for client");
                client.terminate();
            } else {
                client.isHeartbeating = false;
            }
        });
    }, HEARTBEAT_TIMEOUT + 10000); // Check interval
}

wss.on("connection", ws => {

    ws.isHeartbeating = true;

    // Send initial heartbeat request
    ws.send(JSON.stringify({ type: "ALIVE" }));

    // Start heartbeat if not already running
    startHeartbeat();

    ws.on("message", raw => {

        let msg;
        try {
            msg = JSON.parse(raw);
        } catch {
            console.log("Invalid JSON received");
            return;
        }

        // Handle heartbeat responses
        if (msg.type === "ALIVE") {
            ws.isHeartbeating = true;
            // Send pong back
            try {
                ws.send(JSON.stringify({ type: "ALIVE" }));
            } catch (e) {
                console.log("Pong send error:", e.message);
            }
            return;
        }

        // CREATE ROOM
        if (msg.type === "CREATE_ROOM") {

            // Atomic room creation
            if (!rooms[msg.room]) {
                rooms[msg.room] = {
                    videoId: msg.videoId,
                    clients: []
                };
            }

            const room = rooms[msg.room];

            ws.room = msg.room;
            ws.isHost = true;

            if (!room.clients.includes(ws)) {
                room.clients.push(ws);
            }

            ws.send(JSON.stringify({
                type: "ROOM_CREATED",
                room: msg.room,
                videoId: msg.videoId
            }));

            console.log("Room created:", msg.room);
            return;
        }

        // JOIN ROOM
        if (msg.type === "JOIN_ROOM") {

            const room = rooms[msg.room];
            if (!room) {
                ws.send(JSON.stringify({ type: "SESSION_ERROR", error: "Room not found" }));
                return;
            }

            // Check if already in room
            if (room.clients.includes(ws)) {
                ws.send(JSON.stringify({ type: "JOINED", room: msg.room, videoId: room.videoId }));
                return;
            }

            ws.room = msg.room;
            ws.isHost = false;

            room.clients.push(ws);

            ws.send(JSON.stringify({
                type: "JOINED",
                room: msg.room,
                videoId: room.videoId
            }));

            // Notify all clients in room about new member
            room.clients.forEach(client => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({
                        type: "MEMBER_JOINED",
                        room: msg.room
                    }));
                }
            });

            console.log("Client joined:", msg.room);
            return;
        }

        // LEAVE ROOM
        if (msg.type === "LEAVE_ROOM") {
            if (ws.room && rooms[ws.room]) {
                const room = rooms[ws.room];
                room.clients = room.clients.filter(c => c !== ws);
                console.log("Client left:", ws.room);

                // Check if room is empty and delete it
                if (room.clients.length === 0) {
                    delete rooms[msg.room];
                    console.log("Room deleted (empty):", msg.room);
                }
            }
            ws.room = null;
            return;
        }

        // HOST TERMINATE ROOM
        if (msg.type === "TERMINATE_ROOM") {
            if (ws.room && rooms[ws.room] && ws.isHost) {
                const room = rooms[ws.room];
                const errorMsg = JSON.stringify({
                    type: "SESSION_TERMINATED",
                    room: ws.room
                });

                // Notify all clients
                room.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        try {
                            client.send(errorMsg);
                        } catch (e) {
                            console.log("Send error:", e.message);
                        }
                    }
                });

                // Clean up room
                delete rooms[ws.room];
                console.log("Room terminated by host:", ws.room);
            }
            return;
        }

        // RELAY
        if (ws.room && rooms[ws.room]) {

            const room = rooms[ws.room];

            room.clients.forEach(client => {

                if (client !== ws &&
                    client.readyState === WebSocket.OPEN) {

                    try {
                        client.send(JSON.stringify(msg));
                    } catch (e) {
                        console.log("Send failed:", e.message);
                    }
                }

            });
        }
    });

    ws.on("close", () => {
        if (!ws.room || !rooms[ws.room]) return;

        const room = rooms[ws.room];
        room.clients = room.clients.filter(c => c !== ws);

        console.log("Client disconnected:", ws.room);

        // Clean up empty room
        if (room.clients.length === 0) {
            delete rooms[ws.room];
            console.log("Room deleted (empty):", ws.room);
        }
    });

    ws.on("error", error => {
        console.log("WebSocket error:", error.message);
    });
});

// Graceful shutdown
process.on("SIGTERM", () => {
    console.log("SIGTERM received, shutting down gracefully");
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    wss.close();
    process.exit(0);
});

console.log("YSync server running on port", PORT);
