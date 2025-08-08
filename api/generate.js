export default async function handler(req, res) {
  try {
    // read body
    const body = await (async () => {
      if (req.body && typeof req.body !== "string") return req.body;
      return await new Promise((resolve) => {
        let data = "";
        req.on("data", (c) => (data += c));
        req.on("end", () => {
          try { resolve(JSON.parse(data || "{}")); }
          catch { resolve({}); }
        });
      });
    })();

    const { topic = "מבוא לפייתון", level = "basic", duration = 15 } = body || {};

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Missing OPENAI_API_KEY" });

    const prompt = `
אתה מחולל תכן לימודי. צור אובייקט JSON בלבד ( בלי הסברים מסביב ):
{
  "script": "טקסט הסבר קצר בעברית, 3–5 משפטים על הנושא: ${topic} (רמה: ${level}, משך משוער: ${duration} שניות)",
  "quiz": {
    "prompt": "שאלה אמריקאית אחת על התוכן",
    "choices": [" תשובה 1", "תשובה 2", "תשובה 3", "תשובה 4"],
    "correctIndex": 0,
    "explain": "הסבר קצר למה הבחירה הנכונה נכונה"
  }
}
וודא שזו תשובת JSON תקפה.
`.trim();

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        response_format: { type: "json_object" },
      }),
    });

    const data = await resp.json();
    if (!resp.ok) return res.status(resp.status).json(data);

    const content = data?.choices?.[0]?.message?.content || "{}";
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = {};
    }

    return res.status(200).json({
      script: parsed.script || "סקריפט חסר.",
      quiz: parsed.quiz || {
        prompt: "שאלה לדוגמה",
        choices: ["1", "2", "3", "4"],
        correctIndex: 0,
        explain: "הסבר לדוגמה",
      },
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Server error" });
  }
}
