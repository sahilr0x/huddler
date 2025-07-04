import WebSocket, { WebSocketServer } from "ws";
import dotenv from "dotenv";
import { CreateS3MultipartUploader } from "../multipart";

dotenv.config();

interface ServerState {
  wss: WebSocketServer;
  clients: Set<WebSocket>;
}

async function handleClientConnection(
  ws: WebSocket,
  clients: Set<WebSocket>,
  bucketName: string
): Promise<void> {
  console.log("New client connected");
  clients.add(ws);

  const filename = `test-videos/test-${Date.now()}.webm`;
  const uploader = CreateS3MultipartUploader(bucketName, filename);

  try {
    await uploader.initializeUpload();

    ws.on("message", async (data: Buffer) => {
      if (Buffer.isBuffer(data)) {
        console.log(`Received blob of size: ${data.length} bytes`);
        try {
          await uploader.addChunk(data);
        } catch (error) {
          console.error("Error uploading chunk:", error);
          await uploader.abortUpload();
        }
      } else {
        console.warn("Received non-blob data, ignoring");
      }
    });

    ws.on("close", async () => {
      console.log("Client disconnected");
      try {
        await uploader.completeUpload();
      } catch (error) {
        console.error("Error completing upload:", error);
        await uploader.abortUpload();
      }
      clients.delete(ws);
    });

    ws.on("error", async (error: Error) => {
      console.error("WebSocket error:", error);
      try {
        await uploader.abortUpload();
      } catch (abortError) {
        console.error("Error aborting upload:", abortError);
      }
      clients.delete(ws);
    });
  } catch (error) {
    console.error("Error initializing upload:", error);
    ws.close();
  }
}

function createWebSocketServer(port: number): ServerState {
  const wss = new WebSocketServer({ port });
  const clients = new Set<WebSocket>();
  const bucketName = "ghostai-automation-1";

  wss.on("connection", (ws: WebSocket) => {
    handleClientConnection(ws, clients, bucketName);
    console.log(`Total clients connected: ${clients.size}`);
  });

  wss.on("error", (error: Error) => {
    console.error("WebSocket server error:", error);
  });

  return { wss, clients };
}

export function CloseServer(serverState: ServerState): void {
  serverState.wss.close(() => {
    console.log("Server closed");
  });
}

export function InitializeWebSocketServer(port: number) {
  const serverState = createWebSocketServer(port);

  return {
    close: () => CloseServer(serverState),
    getClients: () => serverState.clients,
    getServer: () => serverState.wss,
  };
}
