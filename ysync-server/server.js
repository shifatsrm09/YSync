const WebSocket = require("ws");
require("dotenv").config();

// Render gives dynamic port via ENV
const PORT = process.env.PORT || 3000;

const wss = new WebSocket.Server({ port: PORT });

const rooms = {};

wss.on("connection", ws => {

    ws.on("message", raw => {

        let msg;
        try {
            msg = JSON.parse(raw);
        } catch {
            return;
        }

        // CREATE ROOM
        if (msg.type === "CREATE_ROOM") {

            if (!rooms[msg.room]) {
                rooms[msg.room] = {
                    videoId: msg.videoId,
                    host: ws,
                    clients: []
                };
            }

            const room = rooms[msg.room];

            room.host = ws;
            room.clients.push(ws);

            ws.room = msg.room;
            ws.isHost = true;

            ws.send(JSON.stringify({
                type: "ROOM_CREATED",
                room: msg.room,
                videoId: msg.videoId
            }));

            console.log("Room created or reused:", msg.room);
            return;
        }

        // JOIN ROOM
        if (msg.type === "JOIN_ROOM") {

            const room = rooms[msg.room];

            if (!room) {
                ws.send(JSON.stringify({
                    type: "ERROR",
                    error: "Session not found"
                }));
                return;
            }

            if (room.videoId !== msg.videoId) {
                ws.send(JSON.stringify({
                    type: "ERROR",
                    error: "Video mismatch"
                }));
                return;
            }

            room.clients.push(ws);

            ws.room = msg.room;
            ws.isHost = false;

            ws.send(JSON.stringify({
                type: "JOINED",
                room: msg.room,
                videoId: room.videoId
            }));

            console.log("Client joined:", msg.room);
            return;
        }

        // RELAY ALL EVENTS (PLAY / PAUSE / SEEK / ALIVE)
        if (ws.room && rooms[ws.room]) {

            const room = rooms[ws.room];

            room.clients.forEach(client => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(msg));
                }
            });
        }
    });

    ws.on("close", () => {

        if (!ws.room || !rooms[ws.room]) return;

        const room = rooms[ws.room];

        room.clients = room.clients.filter(c => c !== ws);

        if (ws.isHost) {
            room.host = null;
            console.log("Host disconnected but room preserved:", ws.room);
        } else {
            console.log("Client disconnected from room:", ws.room);
        }
    });
});

console.log("✅ YSync server running on port", PORT);
