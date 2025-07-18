import express from "express"
import dotenv from "dotenv";
import swaggerJsDoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import cookieParser from "cookie-parser";
import cors from "cors";

import { connectDB } from "./lib/db.js";

import authRoutes from "./routes/auth.route.js";
import messageRoutes from "./routes/message.route.js";
import sessionRoutes from "./routes/session.route.js";
import { app, server } from "./lib/socket.js";

const options = {
    definition: {
        openapi: "3.0.0",
        info: {
            title: "COMP6841 Messager API",
            version: "1.0.0",
            description: "API for Messager, a e2ee chatting app for Alex's COMP6841 project",
        },
        servers: [
            {
                url: "http://localhost:5001/api",
            },
        ],
    },
    apis: [
        "./src/routes/auth.route.js", 
        "./src/routes/message.route.js",
        "./src/routes/session.route.js",
    ],
};

const swaggerSpec = swaggerJsDoc(options);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

dotenv.config();

const PORT = process.env.PORT;

app.use(express.json());
app.use(cookieParser());
app.use(cors({
    origin: "http://localhost:5173",
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use("/api/auth", authRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/session", sessionRoutes);

server.listen(PORT, () => {
  console.log('Server is running on PORT: ' + PORT);
  connectDB();
});