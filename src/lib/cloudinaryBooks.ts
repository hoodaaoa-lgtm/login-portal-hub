/**
 * Cloudinary — conta DEDICADA aos livros (capas + ficheiros raw
 * PDF/EPUB/DOCX). Ver nota em cloudinaryMessages.ts sobre porque cada
 * área da Snapper usa a sua própria conta Cloudinary.
 */

const BOOKS_CLOUD_NAME = "cfve4eo1";
const BOOKS_UPLOAD_PRESET = "livros"; // preset unsigned, criado no dashboard desta conta

/**
 * Upload da capa do livro (imagem) para a conta de livros.
 */
export function uploadBookCover(
  file: File,
  folder: string,
  onProgress?: (pct: number) => void,
): Promise<{ url: string; publicId: string }> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", BOOKS_UPLOAD_PRESET);
    formData.append("folder", folder);
    formData.append("resource_type", "image");

    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve({ url: data.secure_url, publicId: data.public_id });
        } catch {
          reject(new Error("Cloudinary devolveu resposta inválida."));
        }
      } else {
        let msg = `Cloudinary erro ${xhr.status}`;
        try { msg = JSON.parse(xhr.responseText)?.error?.message ?? msg; } catch {}
        reject(new Error(msg));
      }
    });

    xhr.addEventListener("error", () => reject(new Error("Falha de rede.")));
    xhr.addEventListener("abort", () => reject(new Error("Upload cancelado.")));

    xhr.open("POST", `https://api.cloudinary.com/v1_1/${BOOKS_CLOUD_NAME}/image/upload`);
    xhr.send(formData);
  });
}

/**
 * Upload do ficheiro do livro (PDF/EPUB/DOCX — resource_type=raw) para
 * a conta de livros.
 */
export function uploadBookFile(
  file: File,
  userId: string,
  onProgress: (pct: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("upload_preset", BOOKS_UPLOAD_PRESET);
    fd.append("folder", `hooda/books/${userId}`);
    fd.append("resource_type", "raw");
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener("progress", e => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText).secure_url); }
        catch { reject(new Error("Resposta inválida do Cloudinary.")); }
      } else {
        let msg = `Erro ${xhr.status}`;
        try { msg = JSON.parse(xhr.responseText)?.error?.message ?? msg; } catch {}
        reject(new Error(msg));
      }
    });
    xhr.addEventListener("error", () => reject(new Error("Falha de rede.")));
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${BOOKS_CLOUD_NAME}/raw/upload`);
    xhr.send(fd);
  });
}
