const WebSocket = require("ws");

const wss = new WebSocket.Server({ port: 3000 });

const rooms = {};

wss.on("connection", ws => {

    ws.on("message", raw => {

        const msg = JSON.parse(raw);

        // CREATE
        if (msg.type === "CREATE_ROOM") {

            rooms[msg.room] = {
                videoId: msg.videoId,
                host: ws,
                clients: [ws]
            };

            ws.room = msg.room;
            ws.isHost = true;

            ws.send(JSON.stringify({
                type: "ROOM_CREATED",
                room: msg.room,
                videoId: msg.videoId
            }));

            console.log("Room created:", msg.room);
            return;
        }

        // JOIN
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

        // RELAY SYNC
        if (ws.room && rooms[ws.room]) {

            rooms[ws.room].clients.forEach(client => {

                if (client !== ws && client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(msg));
                }
            });
        }
    });

    ws.on("close", () => {

        if (!ws.room || !rooms[ws.room]) return;

        const room = rooms[ws.room];

        // Remove socket from clients
        room.clients = room.clients.filter(c => c !== ws);

        // If host disconnects → just mark host null
        if (ws.isHost) {
            room.host = null;
            console.log("Host disconnected but room kept:", ws.room);
        }

        console.log("Client disconnected from room:", ws.room);
    });
});

console.log("✅ YSync server running ws://localhost:3000");
