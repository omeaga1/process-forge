/**
 * Turns an SVG document into a PNG, in the browser: drawn as an image onto a
 * canvas. Used to show a model the drawing it made (preview_unit_drawing).
 * The SVG is our own markup (drawingToStandaloneSvg) with no external
 * references, so the canvas stays readable.
 */
export async function rasterizeSvg(svg: string, maxWidth = 900): Promise<string> {
  if (typeof document === 'undefined') throw new Error('No document to render in.');
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('The drawing could not be rendered as an image.'));
    img.src = url;
  });
  const width = Math.min(maxWidth, img.naturalWidth || 560);
  const height = Math.round(((img.naturalHeight || width) * width) / (img.naturalWidth || width));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D canvas to render in.');
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
}
