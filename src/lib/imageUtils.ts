// Hooda Image Utils — compressão WebP e miniaturas sem libs externas
  const MAX_DIM = 1200;
  const THUMB_DIM = 400;
  const WEBP_Q = 0.82;
  const THUMB_Q = 0.70;

  export async function compressToWebP(file: File, opts: { maxDim?: number; quality?: number } = {}): Promise<File> {
    const maxDim = opts.maxDim ?? MAX_DIM;
    const quality = opts.quality ?? WEBP_Q;
    const bitmap = await createImageBitmap(file);
    let { width, height } = bitmap;
    if (width > maxDim || height > maxDim) {
      if (width >= height) { height = Math.round((height / width) * maxDim); width = maxDim; }
      else { width = Math.round((width / height) * maxDim); height = maxDim; }
    }
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    return new Promise<File>((resolve, reject) => {
      canvas.toBlob(blob => {
        if (!blob) { reject(new Error("toBlob falhou")); return; }
        resolve(new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", { type: "image/webp" }));
      }, "image/webp", quality);
    });
  }

  export function generateThumb(file: File): Promise<File> {
    return compressToWebP(file, { maxDim: THUMB_DIM, quality: THUMB_Q });
  }

  export async function prepareForUpload(file: File): Promise<File> {
    if (!file.type.startsWith("image/") || file.type === "image/svg+xml") return file;
    try { return await compressToWebP(file); }
    catch { return file; }
  }

  export function formatBytes(bytes: number): string {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  }
  