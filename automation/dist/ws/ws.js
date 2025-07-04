"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CloseServer = CloseServer;
exports.InitializeWebSocketServer = InitializeWebSocketServer;
const ws_1 = require("ws");
const dotenv_1 = __importDefault(require("dotenv"));
const multipart_1 = require("../multipart");
dotenv_1.default.config();
function handleClientConnection(ws, clients, bucketName) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("New client connected");
        clients.add(ws);
        const filename = `test-videos/test-${Date.now()}.webm`;
        const uploader = (0, multipart_1.CreateS3MultipartUploader)(bucketName, filename);
        try {
            yield uploader.initializeUpload();
            ws.on("message", (data) => __awaiter(this, void 0, void 0, function* () {
                if (Buffer.isBuffer(data)) {
                    console.log(`Received blob of size: ${data.length} bytes`);
                    try {
                        yield uploader.addChunk(data);
                    }
                    catch (error) {
                        console.error("Error uploading chunk:", error);
                        yield uploader.abortUpload();
                    }
                }
                else {
                    console.warn("Received non-blob data, ignoring");
                }
            }));
            ws.on("close", () => __awaiter(this, void 0, void 0, function* () {
                console.log("Client disconnected");
                try {
                    yield uploader.completeUpload();
                }
                catch (error) {
                    console.error("Error completing upload:", error);
                    yield uploader.abortUpload();
                }
                clients.delete(ws);
            }));
            ws.on("error", (error) => __awaiter(this, void 0, void 0, function* () {
                console.error("WebSocket error:", error);
                try {
                    yield uploader.abortUpload();
                }
                catch (abortError) {
                    console.error("Error aborting upload:", abortError);
                }
                clients.delete(ws);
            }));
        }
        catch (error) {
            console.error("Error initializing upload:", error);
            ws.close();
        }
    });
}
function createWebSocketServer(port) {
    const wss = new ws_1.WebSocketServer({ port });
    const clients = new Set();
    const bucketName = "ghostai-automation-1";
    wss.on("connection", (ws) => {
        handleClientConnection(ws, clients, bucketName);
        console.log(`Total clients connected: ${clients.size}`);
    });
    wss.on("error", (error) => {
        console.error("WebSocket server error:", error);
    });
    return { wss, clients };
}
function CloseServer(serverState) {
    serverState.wss.close(() => {
        console.log("Server closed");
    });
}
function InitializeWebSocketServer(port) {
    const serverState = createWebSocketServer(port);
    return {
        close: () => CloseServer(serverState),
        getClients: () => serverState.clients,
        getServer: () => serverState.wss,
    };
}
