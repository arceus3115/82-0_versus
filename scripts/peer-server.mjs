import { PeerServer } from "peer";

const port = Number(process.env.PEER_PORT ?? 9000);

const server = PeerServer({
  port,
  path: "/",
  allow_discovery: true,
});

server.on("connection", (client) => {
  console.log(`[peer] connected: ${client.getId()}`);
});

console.log(`[peer] signaling server on http://localhost:${port}`);
