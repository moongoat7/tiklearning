export default async function handler(req, res) {
  try {
    // Parse body safely to support both edge/serverless
    const body = await (async () => {
      if (req.body && typeof req.body !== 'string') return req.body;
      return await new Promise((resolve) => {
        let data = '';
        req.on('data', (c) => { data += c; });
        req.on('end', () => {
          try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); }
        });
      });
    })();

    const { script, voice = 'en-US-JennyNeural' } = body || {};
    const apiKey = process.env.DID_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Missing DID_API_KEY' });
    }

    // Create a talk via D-ID API
    const talkResp = await fetch('https://api.d-id.com/talks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
      },
      body: JSON.stringify({
        script: {
          type: 'text',
          input: script,
          provider: { type: 'microsoft', voice_id: voice },
        },
        source_url: 'https://i.imgur.com/0Z8qZ8Z.png',
      }),
    });
    const talk = await talkResp.json();
    if (!talk.id) {
      return res.status(500).json({ error: 'create failed', detail: talk });
    }

    // Poll for result_url
    let resultUrl = null;
    for (let i = 0; i < 25; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const statusResp = await fetch(`https://api.d-id.com/talks/${talk.id}`, {
        headers: {
          Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
        },
      });
      const status = await statusResp.json();
      if (status.result_url) {
        resultUrl = status.result_url;
        break;
      }
      if (status.status === 'error') {
        return res.status(500).json(status);
      }
    }

    if (!resultUrl) {
      return res.status(504).json({ error: 'timeout' });
    }

    return res.status(200).json({ videoUrl: resultUrl });
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'Server error' });
  }
}
