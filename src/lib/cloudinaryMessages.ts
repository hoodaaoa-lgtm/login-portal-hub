/**
 * Cloudinary — conta DEDICADA às mensagens (chat).
 *
 * A Hooda usa uma conta Cloudinary por área (feed, mensagens, perfil,
 * livros) para multiplicar o espaço grátis disponível — cada conta
 * Cloudinary free tem o seu próprio limite, então em vez de todas as
 * áreas partilharem uma única conta, cada uma tem a sua.
 *
 * Esta é a conta usada SÓ pelo chat (imagens, áudios, vídeos e
 * ficheiros enviados nas mensagens). O resto do site (feed, perfil,
 * livros) continua a usar a conta em src/lib/cloudinary.ts.
 */

const MESSAGES_CLOUD_NAME = "y6o2rjcp";
const MESSAGES_UPLOAD_PRESET = "mida mensgem"; // preset unsigned, criado no dashboard desta conta

/**
 * Upload de imagem para a conta de mensagens (unsigned preset).
 */
export function uploadMessageImage(
  file: File,
  folder: string,
  onProgress?: (pct: number) => void,
): Promise<{ url: string; publicId: string }> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", MESSAGES_UPLOAD_PRESET);
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

    xhr.open("POST", `https://api.cloudinary.com/v1_1/${MESSAGES_CLOUD_NAME}/image/upload`);
    xhr.send(formData);
  });
}

/**
 * Upload de áudio/vídeo/ficheiro para a conta de mensagens (unsigned
 * preset). "video" cobre vídeo e áudio; "raw" é o tipo correto do
 * Cloudinary para ficheiros genéricos (pdf, zip, docs, etc.) — o endpoint
 * de vídeo rejeita esses formatos.
 */
export function uploadMessageMedia(
  file: File,
  resourceType: "image" | "video" | "raw",
  folder: string,
  onProgress?: (pct: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("upload_preset", MESSAGES_UPLOAD_PRESET);
    fd.append("folder", folder);
    fd.append("resource_type", resourceType);
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener("progress", e => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText).secure_url); }
        catch { reject(new Error("Cloudinary: resposta inválida")); }
      } else {
        let msg = `Cloudinary erro ${xhr.status}`;
        try { msg = JSON.parse(xhr.responseText)?.error?.message ?? msg; } catch {}
        reject(new Error(msg));
      }
    });
    xhr.addEventListener("error", () => reject(new Error("Falha de rede no upload.")));
    xhr.addEventListener("abort", () => reject(new Error("Upload cancelado.")));
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${MESSAGES_CLOUD_NAME}/${resourceType}/upload`);
    xhr.send(fd);
  });
}
