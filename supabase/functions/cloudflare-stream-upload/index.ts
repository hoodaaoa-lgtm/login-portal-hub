import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CF_ACCOUNT_ID   = Deno.env.get("CF_ACCOUNT_ID")!;
const CF_STREAM_TOKEN = Deno.env.get("CF_STREAM_TOKEN")!;
const CF_STREAM_DOMAIN = Deno.env.get("CF_STREAM_DOMAIN")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, upload-length, upload-metadata, tus-resumable",
  "Access-Control-Expose-Headers": "Location, Upload-Offset, Upload-Length, Tus-Resumable",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    // Cria um URL de upload TUS no Cloudflare Stream
    // O browser depois faz o upload directo para esse URL (sem passar pelo servidor)
    const uploadLength = req.headers.get("Upload-Length");
    const uploadMetadata = req.headers.get("Upload-Metadata");

    const cfRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/stream?direct_user=true`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${CF_STREAM_TOKEN}`,
          "Tus-Resumable": "1.0.0",
          "Upload-Length": uploadLength ?? "0",
          ...(uploadMetadata ? { "Upload-Metadata": uploadMetadata } : {}),
        },
      }
    );

    if (!cfRes.ok) {
      const err = await cfRes.text();
      return new Response(JSON.stringify({ error: err }), {
        status: 502,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const location = cfRes.headers.get("Location") ?? "";
    const streamUrl = cfRes.headers.get("Stream-Media-Id") ?? location.split("/").pop() ?? "";

    return new Response(
      JSON.stringify({
        uploadUrl: location,
        uid: streamUrl,
        domain: CF_STREAM_DOMAIN,
      }),
      {
        status: 200,
        headers: { ...CORS, "Content-Type": "application/json" },
      }
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
