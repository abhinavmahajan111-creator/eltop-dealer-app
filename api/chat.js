export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GROQ_API_KEY not configured' });
  }

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: req.body.system },
          ...req.body.messages,
        ],
        max_tokens: 1000,
      }),
    });

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || 'No response';
    res.status(200).json({ content: [{ type: 'text', text: reply }] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
