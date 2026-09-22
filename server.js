import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(__dirname));

// Lazy initialization of Gemini client
let aiClient = null;
function getAiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY belum dikonfigurasi. Pastikan API key telah diatur di Settings.');
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

// Endpoint generate kata-kata kartu ucapan via Gemini AI (Murni Kecerdasan AI)
app.post('/api/generate-message', async (req, res) => {
  const { to, from, panggilan, theme, tone, occasion, points } = req.body || {};

  try {
    const ai = getAiClient();

    const systemInstruction = `Kamu adalah seorang penulis kartu ucapan profesional yang sangat kreatif, hangat, puitis, dan menyentuh hati dalam Bahasa Indonesia.
Tugasmu adalah merangkai kata-kata kartu ucapan dan doa yang sangat berkesan berdasarkan poin-poin ide yang ingin disampaikan pengguna.
Pedoman penulisan:
1. Hasilkan HANYA isi teks kartu ucapan yang langsung siap disalin (lengkap dengan salam pembuka, isi yang tulus, dan penutup).
2. DILARANG menambahkan kalimat pembuka atau penutup AI seperti "Tentu, ini hasil ucapannya:" atau "Semoga berkenan!".
3. Gunakan emotikon yang estetis dan pas dengan nada suasana.
4. Sesuaikan panggilan dan gaya bahasa dengan nama penerima, panggilan sayang/sapaan khusus, nama pengirim, dan tone yang diminta.
5. Panjang teks berkisar 2-4 paragraf yang enak dibaca dan menyentuh kalbu.`;

    const userPrompt = `Buatkan pesan kartu ucapan dengan informasi berikut:
- Nama Penerima: ${to || 'Sahabatku'}
- Panggilan Khusus / Sapaan: ${panggilan || to || 'Kamu'}
- Nama Pengirim: ${from || 'Aku'}
- Tema Kartu: ${theme || 'Klasik'}
- Suasana / Nada (Tone): ${tone || 'Hangat, tulus, dan menyentuh'}
- Momen / Acara: ${occasion || 'Ulang Tahun / Momen Spesial'}
- Hal / Poin yang ingin disampaikan: ${points || 'Ungkapan rasa terima kasih sudah hadir di hidupku, doa keselamatan, kebahagiaan, dan sukses selalu.'}

Rangkai kata-katanya dengan indah dan mendalam!`;

    // Prioritas model super cepat & stabil untuk mencegah spike 503
    const candidateModels = ['gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-flash-latest'];
    let generatedText = '';
    let lastError = null;

    for (const model of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: userPrompt,
          config: {
            systemInstruction,
            temperature: 0.85,
          },
        });

        if (response && response.text) {
          generatedText = response.text.trim();
          if (generatedText) {
            break;
          }
        }
      } catch (err) {
        lastError = err;
        console.warn(`Model ${model} gagal (${err.status || err.message}). Mencoba kandidat cadangan berikutnya...`);
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }

    if (!generatedText) {
      throw lastError || new Error('Tidak ada model Gemini yang dapat merespons saat ini. Silakan coba sesaat lagi.');
    }

    return res.json({
      success: true,
      message: generatedText,
    });
  } catch (error) {
    console.error('Error generating card message with AI:', error);
    const isApiKeyError = error.message && error.message.includes('GEMINI_API_KEY');
    return res.status(isApiKeyError ? 503 : 500).json({
      success: false,
      error: error.message || 'Gagal merangkai kata-kata dengan AI. Silakan coba sesaat lagi.',
    });
  }
});

// Fallback to index.html for client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});

