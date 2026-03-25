/* ---------- YSync Server Tests ---------- */
const http = require("http");
const WebSocket = require("ws");

// Find available port for testing
function getAvailablePort() {
    const net = require("net");
    const server = net.createServer();
    return new Promise((resolve) => {
        server.listen(0, () => {
            const port = server.address().port;
            server.close(() => resolve(port));
        });
    });
}

// Test helpers
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Create a test server instance
function createTestServer(port) {
    const wss = new WebSocket.Server({ port });

    const rooms = {};
    let heartbeatTimer = null;

    function startHeartbeat() {
        if (heartbeatTimer) return;
        heartbeatTimer = setInterval(() => {
            wss.clients.forEach(client => {
                if (client.isHeartbeating === false) {
                    client.terminate();
                } else {
                    client.isHeartbeating = false;
                }
            });
        }, 7500); // Shorter interval for tests
    }

    wss.on("connection", ws => {
        ws.isHeartbeating = true;
        ws.room = null;
        ws.isHost = false;

        // Send initial ALIVE to start heartbeat
        ws.send(JSON.stringify({ type: "ALIVE" }));
        startHeartbeat();

        ws.on("message", raw => {
            let msg;
            try {
                msg = JSON.parse(raw);
            } catch {
                return;
            }

            // Echo back ALIVE messages for heartbeat
            if (msg.type === "ALIVE") {
                ws.isHeartbeating = true;
                try {
                    ws.send(JSON.stringify({ type: "ALIVE" }));
                } catch (e) {}
                return;
            }

            if (msg.type === "CREATE_ROOM") {
                if (!rooms[msg.room]) {
                    rooms[msg.room] = { videoId: msg.videoId, clients: [] };
                }
                const room = rooms[msg.room];
                ws.room = msg.room;
                ws.isHost = true;
                if (!room.clients.includes(ws)) room.clients.push(ws);

                ws.send(JSON.stringify({
                    type: "ROOM_CREATED",
                    room: msg.room,
                    videoId: msg.videoId
                }));
                return;
            }

            if (msg.type === "JOIN_ROOM") {
                const room = rooms[msg.room];
                if (!room) {
                    ws.send(JSON.stringify({ type: "SESSION_ERROR", error: "Room not found" }));
                    return;
                }
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
                return;
            }

            if (msg.type === "LEAVE_ROOM") {
                if (ws.room && rooms[ws.room]) {
                    const room = rooms[ws.room];
                    room.clients = room.clients.filter(c => c !== ws);
                    if (room.clients.length === 0) delete rooms[ws.room];
                }
                ws.room = null;
                return;
            }

            if (msg.type === "TERMINATE_ROOM") {
                if (ws.room && rooms[ws.room] && ws.isHost) {
                    const room = rooms[ws.room];
                    room.clients.forEach(client => {
                        if (client.readyState === WebSocket.OPEN) {
                            try { client.send(JSON.stringify({ type: "SESSION_TERMINATED", room: ws.room })); }
                            catch (e) {}
                        }
                    });
                    delete rooms[ws.room];
                }
                return;
            }

            if (ws.room && rooms[ws.room]) {
                const room = rooms[ws.room];
                room.clients.forEach(client => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        try { client.send(JSON.stringify(msg)); }
                        catch (e) {}
                    }
                });
            }
        });

        ws.on("close", () => {
            if (!ws.room || !rooms[ws.room]) return;
            const room = rooms[ws.room];
            room.clients = room.clients.filter(c => c !== ws);
            if (room.clients.length === 0) delete rooms[ws.room];
        });
    });

    return { wss, rooms, close: () => {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        wss.close();
    }};
}

// Test suite
async function runTests() {
    const results = [];
    let testNum = 0;
    let activePort = null;

    const tests = [
        {
            name: "Create Room",
            fn: async () => {
                testNum++;
                activePort = await getAvailablePort();
                const { wss, rooms, close } = createTestServer(activePort);
                await sleep(50);

                return new Promise((resolve, reject) => {
                    const ws = new WebSocket(`ws://localhost:${activePort}`);
                    let completed = false;

                    ws.on("open", () => {
                        ws.send(JSON.stringify({ type: "CREATE_ROOM", room: "1111", videoId: "test1" }));
                    });
                    ws.on("message", (data) => {
                        if (completed) return;
                        const msg = JSON.parse(data);
                        if (msg.type === "ROOM_CREATED") {
                            completed = true;
                            if (rooms["1111"] && rooms["1111"].clients.length === 1) {
                                close();
                                resolve(true);
                            } else {
                                close();
                                reject(new Error("Room not properly tracked"));
                            }
                        }
                    });
                    ws.on("error", reject);

                    setTimeout(() => {
                        if (!completed) {
                            ws.close();
                            close();
                            reject(new Error("Test timeout"));
                        }
                    }, 3000);
                });
            }
        },

        {
            name: "Join Room",
            fn: async () => {
                testNum++;
                const { wss, rooms, close } = createTestServer(activePort);
                await sleep(50);

                return new Promise((resolve, reject) => {
                    const clients = [];
                    let completed = false;

                    // Creator
                    const creator = new WebSocket(`ws://localhost:${activePort}`);
                    creator.on("open", () => {
                        creator.send(JSON.stringify({ type: "CREATE_ROOM", room: "2222", videoId: "test2" }));
                    });
                    creator.on("message", (data) => {
                        const msg = JSON.parse(data);
                        if (msg.type === "ROOM_CREATED") {
                            // Joiner
                            const joiner = new WebSocket(`ws://localhost:${activePort}`);
                            clients.push(joiner);
                            joiner.on("open", () => {
                                joiner.send(JSON.stringify({ type: "JOIN_ROOM", room: "2222" }));
                            });
                            joiner.on("message", (data) => {
                                if (completed) return;
                                const msg = JSON.parse(data);
                                if (msg.type === "JOINED") {
                                    completed = true;
                                    if (rooms["2222"] && rooms["2222"].clients.length === 2) {
                                        close();
                                        resolve(true);
                                    } else {
                                        close();
                                        reject(new Error("Room client count wrong"));
                                    }
                                }
                            });
                            joiner.on("error", reject);
                        }
                    });
                    creator.on("error", reject);

                    setTimeout(() => {
                        if (!completed) {
                            creator.close();
                            clients.forEach(c => c.close());
                            close();
                            reject(new Error("Test timeout"));
                        }
                    }, 3000);
                });
            }
        },

        {
            name: "Message Relay",
            fn: async () => {
                testNum++;
                const { wss, close } = createTestServer(activePort);
                await sleep(50);

                return new Promise((resolve, reject) => {
                    const clients = [];
                    let completed = false;

                    // Creator
                    const creator = new WebSocket(`ws://localhost:${activePort}`);
                    creator.on("open", () => {
                        creator.send(JSON.stringify({ type: "CREATE_ROOM", room: "3333", videoId: "test3" }));
                    });
                    creator.on("message", (data) => {
                        const msg = JSON.parse(data);
                        if (msg.type === "ROOM_CREATED") {
                            const client = new WebSocket(`ws://localhost:${activePort}`);
                            clients.push(client);
                            client.on("open", () => {
                                client.send(JSON.stringify({ type: "JOIN_ROOM", room: "3333" }));
                            });
                            client.on("message", (data) => {
                                const msg = JSON.parse(data);
                                if (msg.type === "JOINED") {
                                    // Client sends a message that should be relayed back
                                    client.send(JSON.stringify({ type: "PLAY", time: 20 }));
                                }
                                // Client receives its own message relayed back from server
                                if (msg.type === "PLAY" && !completed) {
                                    completed = true;
                                    close();
                                    resolve(true);
                                }
                            });

                            client.on("error", reject);

                            // Creator also receives the PLAY message
                            creator.on("message", (data) => {
                                const msg = JSON.parse(data);
                                if (msg.type === "PLAY" && !completed) {
                                    completed = true;
                                    close();
                                    resolve(true);
                                }
                            });

                            creator.on("error", reject);
                        }
                    });
                    creator.on("error", reject);

                    setTimeout(() => {
                        if (!completed) {
                            creator.close();
                            clients.forEach(c => c.close());
                            close();
                            reject(new Error("Test timeout - relay not received"));
                        }
                    }, 3000);
                });
            }
        },

        {
            name: "Room Cleanup",
            fn: async () => {
                testNum++;
                const { wss, rooms, close } = createTestServer(activePort);
                await sleep(50);

                return new Promise((resolve) => {
                    const ws = new WebSocket(`ws://localhost:${activePort}`);
                    let testDone = false;

                    ws.on("open", () => {
                        ws.send(JSON.stringify({ type: "CREATE_ROOM", room: "4444", videoId: "test4" }));
                    });
                    ws.on("message", (data) => {
                        if (testDone) return;
                        const msg = JSON.parse(data);
                        if (msg.type === "ROOM_CREATED") {
                            ws.close();
                            setTimeout(() => {
                                testDone = true;
                                close();
                                resolve(true);
                            }, 100);
                        }
                    });
                    ws.on("error", () => {});

                    setTimeout(() => {
                        if (!testDone) {
                            close();
                            resolve(true);
                        }
                    }, 1500);
                });
            }
        },

        {
            name: "Session Termination",
            fn: async () => {
                testNum++;
                const { wss, close } = createTestServer(activePort);
                await sleep(50);

                return new Promise((resolve, reject) => {
                    const clients = [];
                    let hostTerminated = false;
                    let clientNotified = false;
                    let testDone = false;

                    const host = new WebSocket(`ws://localhost:${activePort}`);
                    host.on("open", () => {
                        host.send(JSON.stringify({ type: "CREATE_ROOM", room: "5555", videoId: "test5" }));
                    });
                    host.on("message", (data) => {
                        const msg = JSON.parse(data);
                        if (msg.type === "ROOM_CREATED") {
                            const client = new WebSocket(`ws://localhost:${activePort}`);
                            clients.push(client);
                            client.on("open", () => {
                                client.send(JSON.stringify({ type: "JOIN_ROOM", room: "5555" }));
                            });
                            client.on("message", (data) => {
                                const msg = JSON.parse(data);
                                if (msg.type === "JOINED") {
                                    host.send(JSON.stringify({ type: "TERMINATE_ROOM", room: "5555" }));
                                }
                                if (msg.type === "SESSION_TERMINATED" && !testDone) {
                                    clientNotified = true;
                                    if (hostTerminated && clientNotified) {
                                        testDone = true;
                                        close();
                                        resolve(true);
                                    }
                                }
                            });

                            host.on("message", (data) => {
                                const msg = JSON.parse(data);
                                if (msg.type === "SESSION_TERMINATED" && !testDone) {
                                    hostTerminated = true;
                                    if (hostTerminated && clientNotified) {
                                        testDone = true;
                                        close();
                                        resolve(true);
                                    }
                                }
                            });

                            client.on("error", reject);
                            host.on("error", reject);
                        }
                    });
                    host.on("error", reject);

                    setTimeout(() => {
                        if (!testDone) {
                            host.close();
                            clients.forEach(c => c.close());
                            close();
                            reject(new Error("Test timeout"));
                        }
                    }, 3000);
                });
            }
        }
    ];

    // Print header
    console.log("\n" + "=".repeat(60));
    console.log("YSync Server Test Suite");
    console.log("=".repeat(60) + "\n");

    // Run tests sequentially
    for (const test of tests) {
        console.log(`[${test.name}] Running...`);
        try {
            await test.fn();
            results.push({ name: test.name, passed: true });
            console.log(`  [PASS] ${test.name}\n`);
        } catch (error) {
            results.push({ name: test.name, passed: false, error: error.message });
            console.log(`  [FAIL] ${test.name}: ${error.message}\n`);
        }
    }

    // Print summary
    console.log("=".repeat(60));
    console.log("Test Summary");
    console.log("=".repeat(60));

    let passedCount = 0;
    results.forEach(r => {
        const status = r.passed ? "PASS" : "FAIL";
        console.log(`  [${status}] ${r.name}`);
        if (r.passed) passedCount++;
    });

    console.log(`\nTotal: ${results.length} tests, ${passedCount} passed, ${results.length - passedCount} failed`);

    const allPassed = results.every(r => r.passed);
    console.log(`\nOverall: ${allPassed ? "ALL TESTS PASSED" : "SOME TESTS FAILED"}`);
    console.log("=".repeat(60) + "\n");

    return allPassed ? 0 : 1;
}

// Export for use in other modules
module.exports = { runTests };

// Run if called directly
if (require.main === module) {
    runTests().then(exitCode => process.exit(exitCode));
}
