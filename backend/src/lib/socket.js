import { Server } from "socket.io";
import http from "http";
import express from "express";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173"],
  },
});

const userSocketMap = new Map(); 

export function getReceiverSocketId(userId) {
  return userSocketMap.get(userId);
}

io.on("connection", (socket) => {
    console.log("A user connected", socket.id)
    const userId = socket.handshake.auth.userId;
    if (userId) {
        userSocketMap.set(userId, socket.id);
        console.log(`User ${userId} connected with socket ID: ${socket.id}`);
    }

    socket.on("disconnect", () => {
      console.log("A user disconnected", socket.id)
      delete userSocketMap[userId];
    })
})
export {io, app, server};