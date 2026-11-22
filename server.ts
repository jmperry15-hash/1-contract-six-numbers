import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const app = express();

app.use(express.json({ limit: '15mb' }));

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Open Settings > Secrets to attach a Gemini API key.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function formatGeminiError(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes('GEMINI_API_KEY is not configured')) {
    return { status: 500, message: raw };
  }
  if (raw.includes('PERMISSION_DENIED') || raw.includes('403')) {
    return {
      status: 403,
      message:
        'Gemini API access was denied (403). Please verify your API key in Settings > Secrets, or attach a billing-enabled key for paid models.',
    };
  }
  if (raw.includes('API_KEY_INVALID') || raw.includes('400')) {
    return {
      status: 400,
      message: `Gemini API rejected the request (400): ${raw}`,
    };
  }
  if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('429')) {
    return {
      status: 429,
      message:
        'Gemini API quota exceeded (429). Paid-tier models require a billing-enabled API key in Settings > Secrets, or switch the chat model to gemini-4-hydrogen / gemini-3.1-flash-lite.',
    };
  }
  if (raw.includes('NOT_FOUND') || raw.includes('404')) {
    return {
      status: 404,
      message: `Requested Gemini model was not found (404): ${raw}`,
    };
  }
  return { status: 500, message: raw || 'Unexpected Gemini API error.' };
}

const ALLOWED_CHAT_MODELS = new Set([
  'gemini-4-hydrogen',
  'gemini-3.1-flash-lite',
  'gemini-4-neon',
  'gemini-4-carbon',
]);

// 1. Multi-turn SaaS FP&A Chatbot
app.post('/api/ai/chat', async (req: Request, res: Response) => {
  try {
    const {
      messages,
      model = 'gemini-4-hydrogen',
      modelContext,
    } = req.body as {
      messages: Array<{ role: 'user' | 'model'; text: string }>;
      model?: string;
      modelContext?: Record<string, unknown>;
    };

    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: 'Messages array is required.' });
      return;
    }

    const selectedModel = ALLOWED_CHAT_MODELS.has(model) ? model : 'gemini-4-hydrogen';
    const ai = getGeminiClient();

    const systemInstruction = `You are an expert SaaS FP&A Modeling Assistant specializing in ASC 606 revenue recognition, SaaS metrics, and the "1 Contract, 6 Numbers" lifecycle (Bookings, ARR, Billings, Cash Collections, GAAP Revenue, and Deferred Revenue).

Current Live Contract Model Context:
${JSON.stringify(modelContext ?? {}, null, 2)}

Guidelines:
- Give concise, CFO-grade financial answers grounded in the exact numbers from the Current Live Contract Model Context above.
- Explain timing gaps (e.g., Billings vs Cash lag from Net payment terms, Billings vs GAAP Revenue creating Deferred Revenue or Unbilled Contract Assets).
- Keep responses scannable with short paragraphs and exact dollar figures.
- IMPORTANT: If the user asks you to model, simulate, or test a specific contract scenario (e.g., "Model a 24-month $180k deal with 10% escalator, quarterly billing, Net 60"), include a single fenced JSON block at the very end of your response using EXACTLY these delimiters so the user can apply it with one click:
<<<SCENARIO_JSON
{
  "scenarioName": "Short descriptive title",
  "startMonth": "YYYY-MM",
  "termMonths": 12 | 24 | 36,
  "year1Acv": 120000,
  "escalatorPct": 0,
  "useCustomRamp": false,
  "customAnnualAcvs": [120000, 120000, 120000],
  "billingCadence": "monthly" | "quarterly" | "semi-annual" | "annual" | "multi-year",
  "paymentTermsDays": 0 | 30 | 60 | 90,
  "revRecMethod": "equal" | "exact-days",
  "bookingsMode": "tcv" | "annual"
}
SCENARIO_JSON>>>
Only include the <<<SCENARIO_JSON ... SCENARIO_JSON>>> block when proposing a concrete new scenario or parameter change.`;

    const priorHistory = messages.slice(0, -1).map((m) => ({
      role: m.role,
      parts: [{ text: m.text }],
    }));
    const latestMessage = messages[messages.length - 1];

    const chat = ai.chats.create({
      model: selectedModel,
      history: priorHistory,
      config: {
        systemInstruction,
      },
    });

    const response = await chat.sendMessage({
      message: latestMessage.text,
    });

    const rawText = response.text ?? '';
    let cleanText = rawText;
    let proposedScenario: Record<string, unknown> | undefined;

    const match = /<<<SCENARIO_JSON\s*([\s\S]*?)\s*SCENARIO_JSON>>>/.exec(rawText);
    if (match) {
      cleanText = rawText.replace(match[0], '').trim();
      try {
        proposedScenario = JSON.parse(match[1]);
      } catch {
        // Leave proposedScenario undefined if JSON couldn't be parsed
      }
    }

    res.json({
      text: cleanText,
      modelUsed: selectedModel,
      proposedScenario,
    });
  } catch (err) {
    const formatted = formatGeminiError(err);
    res.status(formatted.status).json({ error: formatted.message });
  }
});

// 2. Contract / Order Form Image Understanding (gemini-4-neon)
app.post('/api/ai/analyze-image', async (req: Request, res: Response) => {
  try {
    const { imageBase64, mimeType, notes } = req.body as {
      imageBase64?: string;
      mimeType?: string;
      notes?: string;
    };

    if (!imageBase64 || !mimeType) {
      res.status(400).json({ error: 'imageBase64 and mimeType are required.' });
      return;
    }

    const ai = getGeminiClient();

    const prompt = `Analyze this uploaded image (such as a SaaS Order Form, quote, pricing schedule, SOW, or whiteboard sketch) as an expert SaaS FP&A analyst.
Extract the SaaS contract parameters so they can be loaded into our "1 Contract, 6 Numbers" lifecycle model.
If a field is not explicitly stated in the image, make a reasonable standard SaaS default assumption and explicitly note it in accountingNotes.
Map termMonths to the closest supported value (12, 24, or 36), billingCadence to one of ("monthly", "quarterly", "semi-annual", "annual", "multi-year"), paymentTermsDays to one of (0, 30, 60, 90), and revRecMethod to ("equal" or "exact-days").
${notes ? `Additional user context: ${notes}` : ''}`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-neon',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: imageBase64,
            },
          },
          { text: prompt },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            customerName: {
              type: Type.STRING,
              description: 'Customer or contract title extracted from the image.',
            },
            contractSummary: {
              type: Type.STRING,
              description: 'Concise 2-3 sentence FP&A summary of the contract terms found.',
            },
            startMonth: {
              type: Type.STRING,
              description: 'Start month in YYYY-MM format (e.g. 2026-01).',
            },
            termMonths: {
              type: Type.INTEGER,
              description: 'Contract term in months: must be 12, 24, or 36.',
            },
            year1Acv: {
              type: Type.NUMBER,
              description: 'Year 1 Annual Contract Value in US dollars.',
            },
            escalatorPct: {
              type: Type.NUMBER,
              description: 'Annual price escalator percentage (0-50).',
            },
            useCustomRamp: {
              type: Type.BOOLEAN,
              description: 'True if distinct explicit year-by-year ACV figures are shown.',
            },
            customAnnualAcvs: {
              type: Type.ARRAY,
              items: { type: Type.NUMBER },
              description: 'Three numbers representing Year 1, Year 2, Year 3 ACV in USD.',
            },
            billingCadence: {
              type: Type.STRING,
              description: 'One of: monthly, quarterly, semi-annual, annual, multi-year.',
            },
            paymentTermsDays: {
              type: Type.INTEGER,
              description: 'Net payment terms in days: 0, 30, 60, or 90.',
            },
            revRecMethod: {
              type: Type.STRING,
              description: 'Either equal or exact-days.',
            },
            keyClauses: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Up to 4 key commercial or billing clauses observed in the image.',
            },
            accountingNotes: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'ASC 606 revenue recognition, cash flow, or assumption notes.',
            },
          },
          required: [
            'customerName',
            'contractSummary',
            'startMonth',
            'termMonths',
            'year1Acv',
            'escalatorPct',
            'useCustomRamp',
            'customAnnualAcvs',
            'billingCadence',
            'paymentTermsDays',
            'revRecMethod',
            'keyClauses',
            'accountingNotes',
          ],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    res.json({ analysis: parsed, modelUsed: 'gemini-4-neon' });
  } catch (err) {
    const formatted = formatGeminiError(err);
    res.status(formatted.status).json({ error: formatted.message });
  }
});

// 3. Text-to-Speech Executive Briefing (gemini-3.8-flash-tts)
app.post('/api/ai/tts', async (req: Request, res: Response) => {
  try {
    const {
      mode = 'single',
      parts,
      voiceName = 'Kore',
    } = req.body as {
      mode?: 'single' | 'dialogue';
      parts: Array<{ text: string; speaker?: string; style?: string }>;
      voiceName?: string;
    };

    if (!Array.isArray(parts) || parts.length === 0) {
      res.status(400).json({ error: 'Audio parts are required.' });
      return;
    }

    const ai = getGeminiClient();

    const speechConfig =
      mode === 'dialogue'
        ? {
            multiSpeakerVoiceConfig: {
              speakerVoiceConfigs: [
                {
                  speaker: 'Alex',
                  voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: 'Puck' },
                  },
                },
                {
                  speaker: 'Sam',
                  voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: 'Kore' },
                  },
                },
              ],
            },
          }
        : {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          };

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash-tts',
      contents: [
        {
          role: 'user',
          parts: parts.map((p) => ({
            text: p.text,
            speechMetadata: {
              ...(p.speaker ? { speaker: p.speaker } : {}),
              style: p.style || 'Clear, professional finance executive',
            },
          })),
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig,
      },
    });

    const base64Audio =
      response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (!base64Audio) {
      res.status(502).json({
        error: 'No audio data returned from gemini-3.8-flash-tts.',
      });
      return;
    }

    // Unary response from Gemini 3.8 TTS is already a complete WAV file (audio/wav)
    res.json({
      audioBase64: base64Audio,
      mimeType: 'audio/wav',
      modelUsed: 'gemini-3.8-flash-tts',
    });
  } catch (err) {
    const formatted = formatGeminiError(err);
    res.status(formatted.status).json({ error: formatted.message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Ledgerline server listening on http://localhost:${PORT}`);
  });
}

startServer();
