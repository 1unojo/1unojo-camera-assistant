export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { image, camera, preferences, metrics, metadata } = req.body;

    if (!image) {
      return res.status(400).json({ error: "No image provided" });
    }

    const prompt = `
Analiza esta imagen como director de fotografía profesional.

No respondas como chat.
Devuelve SOLO JSON válido.

La app se llama 1UnOjo Camera Assistant.

Cámara seleccionada:
${JSON.stringify(camera, null, 2)}

Preferencias del usuario:
${JSON.stringify(preferences, null, 2)}

Métricas locales:
${JSON.stringify(metrics, null, 2)}

Contexto de fecha, hora y ubicación:
${JSON.stringify(metadata, null, 2)}

Reglas:
- Prioriza mantener ISO nativo si es posible.
- Recomienda ND antes que cerrar demasiado el lente.
- Para RED, prefiere Log3G10 / REDWideGamutRGB cuando aplique.
- Si hay altas luces fuertes, advierte posible clipping.
- Si hay piel visible, estima si está bien expuesta.
- Usa la fecha, hora local, zona horaria y ubicación para inferir si puede ser amanecer, mediodía, golden hour, blue hour o noche.
- Si no hay ubicación disponible, usa solo la imagen y la hora local.
- Sé breve y técnico.

Devuelve este formato exacto:

{
  "scene": "",
  "confidence": 0,
  "icon": "",
  "scene_note": "",
  "iso": "",
  "aperture": "",
  "shutter": "",
  "wb": "",
  "wb_label": "",
  "codec": "",
  "gamma": "",
  "color_space": "",
  "nd": "",
  "stops": "",
  "nd_a": "",
  "nd_b": "",
  "nd_note": "",
  "visual": "",
  "target": "",
  "tip": "",
  "reason": "",
  "warnings": []
}
`;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: prompt
              },
              {
                type: "input_image",
                image_url: image
              }
            ]
          }
        ]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || "OpenAI API error"
      });
    }

    const text =
      data.output?.[0]?.content?.[0]?.text ||
      data.output_text ||
      "";

    let clean = text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    let parsed;

    try {
      parsed = JSON.parse(clean);
    } catch {
      parsed = {
        scene: "Análisis IA",
        confidence: 70,
        icon: "◉",
        reason: clean || "La IA respondió, pero no devolvió JSON válido.",
        warnings: ["Respuesta no estructurada."]
      };
    }

    return res.status(200).json(parsed);
  } catch (error) {
    return res.status(500).json({
      error: error.message || "Server error"
    });
  }
}