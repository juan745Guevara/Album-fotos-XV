require('dotenv').config();
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const PDFDocument = require('pdfkit');
const { Jimp } = require('jimp');

const TOTAL_MESAS = 10;
const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(
  /\/$/,
  ''
);
const OUT_DIR = path.join(__dirname, '../../qr-generados');
const LOGO_PATH = path.join(__dirname, '../../assets/cinderella-qr-logo.png');

async function generarQrConLogo(url, filePath, width = 600) {
  const qrBuffer = await QRCode.toBuffer(url, {
    type: 'png',
    width,
    margin: 2,
    errorCorrectionLevel: 'H',
    color: { dark: '#1e3a4c', light: '#ffffff' },
  });

  const qr = await Jimp.read(qrBuffer);
  const logo = await Jimp.read(LOGO_PATH);

  const logoH = Math.round(width * 0.3);
  const logoW = Math.round(logoH * 0.78);
  logo.resize({ w: logoW, h: logoH });

  const x = Math.round((qr.bitmap.width - logoW) / 2);
  const y = Math.round((qr.bitmap.height - logoH) / 2);
  const padX = Math.round(logoW * 0.18);
  const padY = Math.round(logoH * 0.1);
  const bgW = logoW + padX * 2;
  const bgH = logoH + padY * 2;

  const background = new Jimp({
    width: bgW,
    height: bgH,
    color: 0xffffffff,
  });

  qr.composite(background, x - padX, y - padY);
  qr.composite(logo, x, y);

  await qr.write(filePath);
}

async function generarPngs() {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  if (!fs.existsSync(LOGO_PATH)) {
    throw new Error(`No se encontró el logo: ${LOGO_PATH}`);
  }

  const archivos = [];

  for (let i = 1; i <= TOTAL_MESAS; i += 1) {
    const url = `${FRONTEND_URL}/mesa/${i}`;
    const filePath = path.join(OUT_DIR, `mesa-${i}.png`);

    await generarQrConLogo(url, filePath);
    archivos.push({ mesa: i, url, filePath });
    console.log(`QR Mesa ${i}: ${url}`);
  }

  return archivos;
}

function generarPdf(archivos) {
  return new Promise((resolve, reject) => {
    const pdfPath = path.join(OUT_DIR, 'qrs-mesas.pdf');
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = fs.createWriteStream(pdfPath);

    doc.pipe(stream);

    archivos.forEach((item, index) => {
      if (index > 0) doc.addPage();

      doc
        .fontSize(28)
        .fillColor('#1e3a4c')
        .text(`Mesa ${item.mesa}`, { align: 'center' });

      doc.moveDown(0.5);
      doc
        .fontSize(12)
        .fillColor('#5a7a8f')
        .text('Escanea para subir fotos de esta mesa', { align: 'center' });

      doc.moveDown(1.5);

      const qrSize = 320;
      const x = (doc.page.width - qrSize) / 2;
      doc.image(item.filePath, x, doc.y, { width: qrSize });

      doc.moveDown(22);
      doc
        .fontSize(10)
        .fillColor('#888888')
        .text(item.url, { align: 'center' });
    });

    doc.end();
    stream.on('finish', () => resolve(pdfPath));
    stream.on('error', reject);
  });
}

async function main() {
  console.log(`Generando QR con logo Cenicienta → ${FRONTEND_URL}`);
  const archivos = await generarPngs();
  const pdfPath = await generarPdf(archivos);
  console.log(`\nListo.`);
  console.log(`PNG: ${OUT_DIR}`);
  console.log(`PDF: ${pdfPath}`);
}

main().catch((err) => {
  console.error('Error generando QR:', err);
  process.exit(1);
});
