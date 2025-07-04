import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import dotenv from "dotenv";

dotenv.config();

interface UploadState {
  s3Client: S3Client;
  buffer: Buffer[];
  bufferSize: number;
  parts: { ETag: string; PartNumber: number }[];
  uploadId: string | null;
  partNumber: number;
  bucket: string;
  key: string;
}

const PART_SIZE: number = 10 * 1024 * 1024;

const ACCESS_KEY_ID = String(process.env.S3_ACCESS_KEY_ID);
const SECRET_ACCESS_KEY = String(process.env.S3_SECRET_ACCESS_KEY);
const REGION = process.env.S3_REGION;
const ENDPOINT = process.env.S3_ENDPOINT;

function createS3Client(): S3Client {
  return new S3Client({
    region: REGION,
    endpoint: ENDPOINT,
    credentials: {
      accessKeyId: ACCESS_KEY_ID,
      secretAccessKey: SECRET_ACCESS_KEY,
    },
  });
}

function createUploadState(bucket: string, key: string): UploadState {
  return {
    s3Client: createS3Client(),
    buffer: [],
    bufferSize: 0,
    parts: [],
    uploadId: null,
    partNumber: 1,
    bucket,
    key,
  };
}

async function initializeUpload(state: UploadState): Promise<void> {
  try {
    const response = await state.s3Client.send(
      new CreateMultipartUploadCommand({
        Bucket: state.bucket,
        Key: state.key,
      })
    );
    state.uploadId = response.UploadId ?? null;
    console.log(`Multipart upload initialized with ID: ${state.uploadId}`);
  } catch (error) {
    console.error("Failed to initialize multipart upload:", error);
    throw error;
  }
}

async function uploadBufferedPart(state: UploadState): Promise<void> {
  if (!state.uploadId || state.buffer.length === 0) return;

  const combinedBuffer = Buffer.concat(state.buffer);
  const partBuffer = combinedBuffer.slice(0, PART_SIZE);
  const remainingBuffer = combinedBuffer.slice(PART_SIZE);

  try {
    const response = await state.s3Client.send(
      new UploadPartCommand({
        Bucket: state.bucket,
        Key: state.key,
        PartNumber: state.partNumber,
        UploadId: state.uploadId,
        Body: partBuffer,
      })
    );

    state.parts.push({
      ETag: response.ETag!,
      PartNumber: state.partNumber,
    });

    console.log(
      `Uploaded part ${state.partNumber}, Size: ${partBuffer.length} bytes`
    );
    state.partNumber++;

    state.buffer = [remainingBuffer];
    state.bufferSize = remainingBuffer.length;
  } catch (error) {
    console.error(`Failed to upload part ${state.partNumber}:`, error);
    throw error;
  }
}

async function addChunk(state: UploadState, chunk: Buffer): Promise<void> {
  state.buffer.push(chunk);
  state.bufferSize += chunk.length;

  if (state.bufferSize >= PART_SIZE) {
    await uploadBufferedPart(state);
  }
}

async function completeUpload(state: UploadState): Promise<void> {
  if (!state.uploadId) return;

  if (state.bufferSize > 0) {
    const finalBuffer = Buffer.concat(state.buffer);
    try {
      const response = await state.s3Client.send(
        new UploadPartCommand({
          Bucket: state.bucket,
          Key: state.key,
          PartNumber: state.partNumber,
          UploadId: state.uploadId,
          Body: finalBuffer,
        })
      );

      state.parts.push({
        ETag: response.ETag!,
        PartNumber: state.partNumber,
      });

      console.log(
        `Uploaded final part ${state.partNumber}, Size: ${finalBuffer.length} bytes`
      );
    } catch (error) {
      console.error("Failed to upload final part:", error);
      throw error;
    }
  }

  try {
    await state.s3Client.send(
      new CompleteMultipartUploadCommand({
        Bucket: state.bucket,
        Key: state.key,
        UploadId: state.uploadId,
        MultipartUpload: {
          Parts: state.parts,
        },
      })
    );
    console.log("Multipart upload completed successfully");
  } catch (error) {
    console.error("Failed to complete multipart upload:", error);
    throw error;
  }
}

async function abortUpload(state: UploadState): Promise<void> {
  if (!state.uploadId) return;

  try {
    await state.s3Client.send(
      new AbortMultipartUploadCommand({
        Bucket: state.bucket,
        Key: state.key,
        UploadId: state.uploadId,
      })
    );
    console.log("Multipart upload aborted");
  } catch (error) {
    console.error("Failed to abort multipart upload:", error);
    throw error;
  }
}

export function CreateS3MultipartUploader(bucket: string, key: string) {
  const state = createUploadState(bucket, key);

  return {
    initializeUpload: () => initializeUpload(state),
    addChunk: (chunk: Buffer) => addChunk(state, chunk),
    completeUpload: () => completeUpload(state),
    abortUpload: () => abortUpload(state),
  };
}
