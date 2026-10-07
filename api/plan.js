const MODEL = 'gemini-3.8-flash';

function parsePlan(text) {
  const cleaned = String(text || '').trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```$/, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Gemini did not return a project plan.');
  return JSON.parse(cleaned.slice(start, end + 1));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Use POST.' });
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'Gemini is not configured.' });

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const name = String(body.name || '').trim().slice(0, 80);
  const about = String(body.about || '').trim().slice(0, 2000);
  const weeks = Number(body.weeks);
  if (!name || !about) return res.status(400).json({ error: 'Add a project name and what the project is about.' });
  if (![1, 2, 3, 4].includes(weeks)) return res.status(400).json({ error: 'Choose a timeline of 1 to 4 weeks.' });

  const max = weeks * 5;
  const prompt = `Create a practical delivery plan as JSON only. Project name: ${name}. Timeline: ${weeks} week(s), ${max} working days numbered 1 to ${max}. About: ${about}. Return {"summary":"one sentence","team":[{"name":"","role":""}],"tasks":[{"title":"","owner":"","start":1,"end":2,"priority":"High","deliverable":"","notes":"","dependsOn":""}]}. Use 2 to 4 team members and 6 to 12 tasks. Cover the timeline from the first days through the last days. owner must exactly match a team name. dependsOn is another task title or empty. priority is High, Medium, or Low. At most two tasks may omit start and end.`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, responseMimeType: 'application/json' }
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data.error?.message || `Gemini request failed (${response.status}).`;
      return res.status(502).json({ error: message });
    }
    const text = (data.candidates?.[0]?.content?.parts || []).map((part) => part.text || '').join('');
    return res.status(200).json(parsePlan(text));
  } catch (error) {
    return res.status(502).json({ error: error.message || 'Could not reach Gemini.' });
  }
}
