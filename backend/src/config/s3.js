const { randomUUID } = require('crypto');
const path = require('path');
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} = require('@aws-sdk/client-s3');
require('dotenv').config();

const region = process.env.AWS_REGION || 'us-east-1';
const bucket = process.env.AWS_S3_BUCKET;

const s3 = new S3Client({
  region,
  ...(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      }
    : {}),
});

const MIME_EXT = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'image/heif': '.heif',
};

function resolveExtension(mimetype, originalname) {
  if (mimetype && MIME_EXT[mimetype]) {
    return MIME_EXT[mimetype];
  }

  const fromName = path.extname(originalname || '').toLowerCase();
  if (fromName && /^\.(jpe?g|png|webp|heic|heif)$/.test(fromName)) {
    return fromName === '.jpeg' ? '.jpg' : fromName;
  }

  return '.jpg';
}

function buildPublicUrl(key) {
  if (process.env.AWS_S3_PUBLIC_URL) {
    return `${process.env.AWS_S3_PUBLIC_URL.replace(/\/$/, '')}/${key}`;
  }

  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

function assertConfigured() {
  if (!bucket) {
    const error = new Error('AWS_S3_BUCKET no está configurado en backend/.env');
    error.code = 'S3_NOT_CONFIGURED';
    throw error;
  }
}

async function uploadBuffer(buffer, mesaId, mimetype, originalname) {
  assertConfigured();

  const ext = resolveExtension(mimetype, originalname);
  const key = `album-evento/mesa-${mesaId}/${randomUUID()}${ext}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: mimetype || 'application/octet-stream',
    })
  );

  return {
    url: buildPublicUrl(key),
    key,
  };
}

async function deleteObject(key) {
  assertConfigured();

  await s3.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );
}

async function getObjectBuffer(key) {
  assertConfigured();

  const response = await s3.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );

  const chunks = [];
  for await (const chunk of response.Body) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

module.exports = {
  uploadBuffer,
  deleteObject,
  getObjectBuffer,
  buildPublicUrl,
};
