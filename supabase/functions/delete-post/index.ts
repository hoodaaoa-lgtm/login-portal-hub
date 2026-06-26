import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CLOUD_NAME   = Deno.env.get("CLOUDINARY_CLOUD_NAME")!;
const API_KEY      = Deno.env.get("CLOUDINARY_API_KEY")!;
const API_SECRET   = Deno.env.get("CLOUDINARY_API_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Extrai o public_id de uma URL do Cloudinary */
function extractPublicId(url: string): string | null {
  try {
    // Ex: https://res.cloudinary.com/dy7o7tgmk/image/upload/v123/hooda/posts/userid/filename.jpg
    const match = url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[^.]+)?$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/** Apaga um ficheiro do Cloudinary usando a API signed */
async function deleteFromCloudinary(publicId: string, resourceType: "image" | "video") {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const str = `public_id=${publicId}&timestamp=${timestamp}${API_SECRET}`;

  // SHA-1 signature
  const msgBuffer = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-1", msgBuffer);
  const hashArray  = Array.from(new Uint8Array(hashBuffer));
  const signature  = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

  const body = new URLSearchParams({
    public_id: publicId,
    timestamp,
    api_key: API_KEY,
    signature,
  });

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/destroy`,
    { method: "POST", body },
  );
  return res.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    // Verificar auth do utilizador
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: CORS });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Verificar token do utilizador
    const userClient = createClient(SUPABASE_URL, authHeader.replace("Bearer ", ""));
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Sessão inválida" }), { status: 401, headers: CORS });

    const { postId } = await req.json();
    if (!postId) return new Response(JSON.stringify({ error: "postId obrigatório" }), { status: 400, headers: CORS });

    // Buscar o post para obter os URLs de media
    const { data: post, error: fetchErr } = await supabase
      .from("posts")
      .select("id, author_id, photo_url, video_url")
      .eq("id", postId)
      .maybeSingle();

    if (fetchErr || !post) {
      return new Response(JSON.stringify({ error: "Post não encontrado" }), { status: 404, headers: CORS });
    }

    // Só o autor pode eliminar
    if (post.author_id !== user.id) {
      return new Response(JSON.stringify({ error: "Sem permissão" }), { status: 403, headers: CORS });
    }

    // Apagar ficheiros do Cloudinary
    const cloudinaryResults: Record<string, any> = {};

    if (post.photo_url) {
      const publicId = extractPublicId(post.photo_url);
      if (publicId) {
        cloudinaryResults.photo = await deleteFromCloudinary(publicId, "image");
      }
    }

    if (post.video_url) {
      const publicId = extractPublicId(post.video_url);
      if (publicId) {
        cloudinaryResults.video = await deleteFromCloudinary(publicId, "video");
      }
    }

    // Apagar da DB
    const { error: deleteErr } = await supabase
      .from("posts")
      .delete()
      .eq("id", postId)
      .eq("author_id", user.id);

    if (deleteErr) {
      return new Response(JSON.stringify({ error: deleteErr.message }), { status: 500, headers: CORS });
    }

    return new Response(
      JSON.stringify({ success: true, cloudinary: cloudinaryResults }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
    );

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message ?? "Erro interno" }),
      { status: 500, headers: CORS },
    );
  }
});
