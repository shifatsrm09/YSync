const WebSocket = require("ws");
require("dotenv").config();

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
            if (!room) return;

            ws.room = msg.room;
            ws.isHost = false;

            if (!room.clients.includes(ws)) {
                room.clients.push(ws);
            }

            ws.send(JSON.stringify({
                type: "JOINED",
                room: msg.room,
                videoId: room.videoId
            }));

            console.log("Client joined:", msg.room);
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
                    } catch {
                        console.log("Send failed");
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
    });
});

console.log("YSync server running on port", PORT);
