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
exports.CreateS3MultipartUploader = CreateS3MultipartUploader;
const client_s3_1 = require("@aws-sdk/client-s3");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const PART_SIZE = 10 * 1024 * 1024;
const ACCESS_KEY_ID = String(process.env.S3_ACCESS_KEY_ID);
const SECRET_ACCESS_KEY = String(process.env.S3_SECRET_ACCESS_KEY);
const REGION = process.env.S3_REGION;
const ENDPOINT = process.env.S3_ENDPOINT;
function createS3Client() {
    return new client_s3_1.S3Client({
        region: REGION,
        endpoint: ENDPOINT,
        credentials: {
            accessKeyId: ACCESS_KEY_ID,
            secretAccessKey: SECRET_ACCESS_KEY,
        },
    });
}
function createUploadState(bucket, key) {
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
function initializeUpload(state) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            const response = yield state.s3Client.send(new client_s3_1.CreateMultipartUploadCommand({
                Bucket: state.bucket,
                Key: state.key,
            }));
            state.uploadId = (_a = response.UploadId) !== null && _a !== void 0 ? _a : null;
            console.log(`Multipart upload initialized with ID: ${state.uploadId}`);
        }
        catch (error) {
            console.error("Failed to initialize multipart upload:", error);
            throw error;
        }
    });
}
function uploadBufferedPart(state) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!state.uploadId || state.buffer.length === 0)
            return;
        const combinedBuffer = Buffer.concat(state.buffer);
        const partBuffer = combinedBuffer.slice(0, PART_SIZE);
        const remainingBuffer = combinedBuffer.slice(PART_SIZE);
        try {
            const response = yield state.s3Client.send(new client_s3_1.UploadPartCommand({
                Bucket: state.bucket,
                Key: state.key,
                PartNumber: state.partNumber,
                UploadId: state.uploadId,
                Body: partBuffer,
            }));
            state.parts.push({
                ETag: response.ETag,
                PartNumber: state.partNumber,
            });
            console.log(`Uploaded part ${state.partNumber}, Size: ${partBuffer.length} bytes`);
            state.partNumber++;
            state.buffer = [remainingBuffer];
            state.bufferSize = remainingBuffer.length;
        }
        catch (error) {
            console.error(`Failed to upload part ${state.partNumber}:`, error);
            throw error;
        }
    });
}
function addChunk(state, chunk) {
    return __awaiter(this, void 0, void 0, function* () {
        state.buffer.push(chunk);
        state.bufferSize += chunk.length;
        if (state.bufferSize >= PART_SIZE) {
            yield uploadBufferedPart(state);
        }
    });
}
function completeUpload(state) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!state.uploadId)
            return;
        if (state.bufferSize > 0) {
            const finalBuffer = Buffer.concat(state.buffer);
            try {
                const response = yield state.s3Client.send(new client_s3_1.UploadPartCommand({
                    Bucket: state.bucket,
                    Key: state.key,
                    PartNumber: state.partNumber,
                    UploadId: state.uploadId,
                    Body: finalBuffer,
                }));
                state.parts.push({
                    ETag: response.ETag,
                    PartNumber: state.partNumber,
                });
                console.log(`Uploaded final part ${state.partNumber}, Size: ${finalBuffer.length} bytes`);
            }
            catch (error) {
                console.error("Failed to upload final part:", error);
                throw error;
            }
        }
        try {
            yield state.s3Client.send(new client_s3_1.CompleteMultipartUploadCommand({
                Bucket: state.bucket,
                Key: state.key,
                UploadId: state.uploadId,
                MultipartUpload: {
                    Parts: state.parts,
                },
            }));
            console.log("Multipart upload completed successfully");
        }
        catch (error) {
            console.error("Failed to complete multipart upload:", error);
            throw error;
        }
    });
}
function abortUpload(state) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!state.uploadId)
            return;
        try {
            yield state.s3Client.send(new client_s3_1.AbortMultipartUploadCommand({
                Bucket: state.bucket,
                Key: state.key,
                UploadId: state.uploadId,
            }));
            console.log("Multipart upload aborted");
        }
        catch (error) {
            console.error("Failed to abort multipart upload:", error);
            throw error;
        }
    });
}
function CreateS3MultipartUploader(bucket, key) {
    const state = createUploadState(bucket, key);
    return {
        initializeUpload: () => initializeUpload(state),
        addChunk: (chunk) => addChunk(state, chunk),
        completeUpload: () => completeUpload(state),
        abortUpload: () => abortUpload(state),
    };
}
