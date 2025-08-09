// api/generate-video.js
// Vercel serverless function (Node.js runtime)
// דורש משתנה סביבה DID_API_KEY (ב-Vercel -> Settings -> Environment Variables)

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // קלט מהלקוח
    const { script, voice = "he-IL-AvriNeural" } = req.body || {};
    if (!script || typeof script !== "string") {
      return res.status(400).json({ error: "Missing 'script' (string)" });
    }

    const apiKey = process.env.DID_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing DID_API_KEY env var" });
    }

    // אם יש לך presenter_id מוכן בחשבון ה-D-ID שלך, אפשר להשתמש בו במקום source_url:
    // למשל: bodyToSend.presenter_id = "amy-white-shirt"
    const bodyToSend = {
      script: {
        type: "text",
        input: script,
        provider: { type: "microsoft", voice_id: voice }
      },
      // תמונת אווטר ציבורית (אפשר להחליף לתמונה שלך)
      source_url: "https://i.imgur.com/0Z8qZ8Z.png",
      // אפשרויות נוספות (לא חובה)
      config: { stitch: true }
    };

    // יצירת Talk
    const createResp = await fetch("https://api.d-id.com/talks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // חשוב: D-ID מצפה ל-Basic על בסיס api_key + נקודתיים (:)
        Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`
      },
      body: JSON.stringify(bodyToSend)
    });

    const createJson = await createResp.json();
    if (!createResp.ok || !createJson?.id) {
      return res.status(createResp.status || 500).json({
        error: "Talk creation failed",
        detail: createJson
      });
    }

    // Polling עד שהתוצאה מוכנה (עד ~60 שניות)
    const talkId = createJson.id;
    const started = Date.now();
    let videoUrl = null;
    let lastJson = null;

    while (Date.now() - started < 60000) {
      await wait(2000);
      const statusResp = await fetch(`https://api.d-id.com/talks/${talkId}`, {
        headers: {
          Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`
        }
      });
      const statusJson = await statusResp.json();
      lastJson = statusJson;

      if (statusJson?.result_url) {
        videoUrl = statusJson.result_url;
        break;
      }
      if (statusJson?.status === "error") {
        return res.status(502).json({ error: "D-ID returned error", detail: statusJson });
      }
    }

    if (!videoUrl) {
      return res.status(504).json({
        error: "Video generation timed out",
        detail: lastJson || null
      });
    }

    return res.status(200).json({ videoUrl });
  } catch (err) {
    return res.status(500).json({ error: err?.message || "Server error" });
  }
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
