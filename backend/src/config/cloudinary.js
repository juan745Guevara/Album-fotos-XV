const { v2: cloudinary } = require('cloudinary');
require('dotenv').config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

/**
 * Sube un buffer a Cloudinary en la carpeta de la mesa.
 */
function uploadBuffer(buffer, mesaId) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `album-evento/mesa-${mesaId}`,
        resource_type: 'image',
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    stream.end(buffer);
  });
}

function destroyImage(publicId) {
  return cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
}

module.exports = {
  cloudinary,
  uploadBuffer,
  destroyImage,
};
