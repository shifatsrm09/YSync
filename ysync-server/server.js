const WebSocket = require("ws");

const wss = new WebSocket.Server({ port: 3000 });

const rooms = {};
const ROOM_TIMEOUT = 10 * 60 * 1000;

wss.on("connection", ws => {

    ws.on("message", raw => {

        const msg = JSON.parse(raw);

        // ---------- CREATE ROOM ----------
        if (msg.type === "CREATE_ROOM") {

            rooms[msg.room] = {
                videoId: msg.videoId,
                clients: [ws],
                timeout: null
            };

            ws.room = msg.room;

            ws.send(JSON.stringify({
                type: "ROOM_CREATED",
                room: msg.room,
                videoId: msg.videoId
            }));

            console.log("Room created:", msg.room, msg.videoId);
            return;
        }

        // ---------- JOIN ROOM ----------
        if (msg.type === "JOIN_ROOM") {

            const room = rooms[msg.room];

            if (!room) {
                ws.send(JSON.stringify({
                    type: "ERROR",
                    error: "Session not found"
                }));
                return;
            }

            // ⭐ VIDEO CHECK
            if (room.videoId !== msg.videoId) {
                ws.send(JSON.stringify({
                    type: "ERROR",
                    error: "Video mismatch"
                }));
                return;
            }

            if (room.timeout) {
                clearTimeout(room.timeout);
                room.timeout = null;
            }

            room.clients.push(ws);
            ws.room = msg.room;

            ws.send(JSON.stringify({
                type: "JOINED",
                room: msg.room,
                videoId: room.videoId
            }));

            console.log("Client joined:", msg.room);
        }

        // ---------- SYNC EVENTS ----------
        if (!ws.room || !rooms[ws.room]) return;

        rooms[ws.room].clients.forEach(client => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(msg));
            }
        });
    });

    ws.on("close", () => {

        if (!ws.room || !rooms[ws.room]) return;

        const room = rooms[ws.room];

        room.clients = room.clients.filter(c => c !== ws);

        if (room.clients.length === 0) {

            room.timeout = setTimeout(() => {
                delete rooms[ws.room];
                console.log("Room deleted:", ws.room);
            }, ROOM_TIMEOUT);
        }
    });
});

console.log("YSync server running ✅ on ws://localhost:3000");
