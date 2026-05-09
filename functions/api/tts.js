/**
 * Cloudflare Pages Function — POST /api/tts
 *
 * Proxies a blurb to ElevenLabs text-to-speech and streams back MP3 audio,
 * keeping the API key server-side. Cloudflare auto-routes this file because
 * it lives under /functions. The static Astro build in /dist is unaffected.
 *
 * Requires the `ELEVENLABS_API_KEY` secret to be set in the Pages project's
 * Variables and Secrets. If it isn't set, this returns 503 and the client
 * falls back to the browser's speechSynthesis voice.
 *
 * Quota note: the ElevenLabs free tier is ~10k credits/month. We use the
 * cheap `eleven_flash_v2_5` model (~0.5 credits/char), hard-cap text length,
 * and tell Cloudflare to cache identical text for a day. When the quota runs
 * out the upstream call fails and the client falls back gracefully.
 */

const MAX_CHARS = 900;

// A small allowlist of ElevenLabs preset voice IDs. The client may request one
// of these by key; anything else falls back to the default.
const VOICES = {
  rachel: "21m00Tcm4TlvDq8ikWAM",   // calm, measured female narrator (default)
  adam: "pNInz6obpgDQGcFmaJgB",     // deep male
  antoni: "ErXwobaYiN019PkySvjV",   // warm male
  bella: "EXAVITQu4vr4xnSDxMaL",    // soft female
  arnold: "VR6AewLTigWG4xSOukaG",   // gravelly male — "mission control" energy
};
const DEFAULT_VOICE = VOICES.arnold;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function handleTts(context) {
  const { request, env } = context;
  const key = env.ELEVENLABS_API_KEY;
  if (!key) return json({ error: "not_configured" }, 503);

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  let text = String(payload?.text ?? "").replace(/\s+/g, " ").trim();
  if (!text) return json({ error: "no_text" }, 400);
  if (text.length > MAX_CHARS) {
    // cut at a sentence/word boundary so it doesn't end mid-word
    const slice = text.slice(0, MAX_CHARS);
    const lastStop = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf(" "));
    text = (lastStop > MAX_CHARS * 0.6 ? slice.slice(0, lastStop) : slice).trim() + "…";
  }

  const voiceKey = String(payload?.voice ?? "").toLowerCase();
  const voiceId = VOICES[voiceKey] || DEFAULT_VOICE;

  let upstream;
  try {
    upstream = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": key,
        "content-type": "application/json",
        accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_flash_v2_5",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true,
        },
      }),
    });
  } catch (e) {
    return json({ error: "fetch_failed", detail: String(e).slice(0, 200) }, 502);
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    // 401 means our key is bad — don't leak that to the client as a 401
    // (which the browser might interpret as needing auth); collapse to 502.
    const status = upstream.status === 401 ? 502 : upstream.status;
    return json({ error: "upstream", upstreamStatus: upstream.status, detail: detail.slice(0, 300) }, status);
  }

  const audio = await upstream.arrayBuffer();
  return new Response(audio, {
    status: 200,
    headers: {
      "content-type": "audio/mpeg",
      "cache-control": "public, max-age=86400, immutable",
    },
  });
}

export async function onRequest(context) {
  const m = context.request.method;
  if (m === "POST") return handleTts(context);
  if (m === "OPTIONS") return new Response(null, { status: 204 });
  return new Response("Method Not Allowed", { status: 405, headers: { allow: "POST" } });
}
