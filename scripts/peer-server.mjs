import { PeerServer } from "peer";

const port = Number(process.env.PORT ?? process.env.PEER_PORT ?? 9000);

const server = PeerServer({
  port,
  path: "/",
  allow_discovery: true,
  proxied: process.env.PEER_PROXIED === "true",
});

server.on("connection", (client) => {
  console.log(`[peer] connected: ${client.getId()}`);
});

console.log(`[peer] signaling server listening on port ${port}`);
