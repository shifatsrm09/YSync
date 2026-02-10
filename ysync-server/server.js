const WebSocket = require("ws");

const wss = new WebSocket.Server({ port: 3000 });

const rooms = {};

// ⭐ 10 minutes
const ROOM_TIMEOUT = 10 * 60 * 1000;


wss.on("connection", ws => {

    ws.on("message", raw => {

        const msg = JSON.parse(raw);

        // ---------- CREATE ROOM ----------
        if (msg.type === "CREATE_ROOM") {

            if (rooms[msg.room]) return;

            rooms[msg.room] = {
                clients: [ws],
                timeout: null
            };

            ws.room = msg.room;

            ws.send(JSON.stringify({
                type: "ROOM_CREATED",
                room: msg.room
            }));

            console.log("Room created:", msg.room);
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

            // Cancel scheduled deletion
            if (room.timeout) {
                clearTimeout(room.timeout);
                room.timeout = null;
            }

            room.clients.push(ws);
            ws.room = msg.room;

            ws.send(JSON.stringify({
                type: "JOINED",
                room: msg.room
            }));

            console.log("Client joined:", msg.room);
        }
    });


    ws.on("close", () => {

        if (!ws.room || !rooms[ws.room]) return;

        const room = rooms[ws.room];

        room.clients = room.clients.filter(c => c !== ws);

        // ⭐ If empty → start 10 minute countdown
        if (room.clients.length === 0) {

            console.log("Room empty, starting 10 minute timer:", ws.room);

            room.timeout = setTimeout(() => {

                delete rooms[ws.room];
                console.log("Room deleted after timeout:", ws.room);

            }, ROOM_TIMEOUT);

        }
    });
});


console.log("Session server running ws://localhost:3000");
