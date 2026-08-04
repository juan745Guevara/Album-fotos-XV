import QRCode from 'qrcode';

const LOGO_SRC = '/cinderella-qr-logo.png';

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Genera un QR PNG (data URL) con el emblema de Cenicienta al centro.
 */
export async function generarQrConLogo(texto, width = 360) {
  const canvas = document.createElement('canvas');
  await QRCode.toCanvas(canvas, texto, {
    width,
    margin: 2,
    errorCorrectionLevel: 'H',
    color: { dark: '#1e3a4c', light: '#ffffff' },
  });

  const ctx = canvas.getContext('2d');
  const logo = await loadImage(LOGO_SRC);

  // Silueta vertical: un poco más alta que ancha, con fondo blanco
  const logoH = Math.round(width * 0.3);
  const logoW = Math.round(logoH * 0.78);
  const x = (canvas.width - logoW) / 2;
  const y = (canvas.height - logoH) / 2;
  const padX = Math.round(logoW * 0.18);
  const padY = Math.round(logoH * 0.1);

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(
    x - padX,
    y - padY,
    logoW + padX * 2,
    logoH + padY * 2,
    Math.round(logoW * 0.35)
  );
  ctx.fill();

  ctx.drawImage(logo, x, y, logoW, logoH);

  return canvas.toDataURL('image/png');
}
