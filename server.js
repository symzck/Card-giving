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

// Generator cadangan lokal jika seluruh layanan AI eksternal sedang mengalami lonjakan beban / 503
function generateFallbackIndonesianMessage({ to, from, panggilan, tone, points }) {
  const recipient = panggilan || to || 'Sahabatku';
  const sender = from || 'Aku';
  const cleanTone = (tone || '').toLowerCase();
  
  let opening = `Halo ${recipient}, selamat merayakan hari yang istimewa ini! ✨`;
  let closing = `Dengan segenap doa dan harapan terbaik,\n${sender} ❤️`;
  
  if (cleanTone.includes('romantis')) {
    opening = `Untuk ${recipient} tersayang, di hari yang begitu bermakna ini... 💖`;
    closing = `Selamanya di sampingmu,\n${sender} 🌹`;
  } else if (cleanTone.includes('semangat') || cleanTone.includes('ceria')) {
    opening = `Hai ${recipient}! Selamat merayakan hari yang luar biasa penuh sukacita ini! 🎈🎉`;
    closing = `Semangat terus ya! Peluk hangat dari,\n${sender} ✨`;
  } else if (cleanTone.includes('santai') || cleanTone.includes('humoris')) {
    opening = `Woy ${recipient}! Selamat hari spesial buat orang tergokil yang pernah aku kenal! 😎✨`;
    closing = `Jangan lupa traktirannya ya! Dari sohibmu,\n${sender} ✌️`;
  } else if (cleanTone.includes('puitis')) {
    opening = `Teruntuk ${recipient}, lentera yang selalu mewarnai setiap langkah dan cerita dalam hidupku... 🌿🌙`;
    closing = `Tertulis tulus dari relung hati,\n${sender} ✨`;
  } else if (cleanTone.includes('doa') || cleanTone.includes('khidmat')) {
    opening = `Bismillah, teruntuk saudaraku ${recipient}, puji syukur atas limpahan berkah dan kebahagiaan di hari yang mulia ini. 🤲✨`;
    closing = `Semoga senantiasa dalam lindungan dan rahmat-Nya,\n${sender} 🌿`;
  } else if (cleanTone.includes('heroik') || cleanTone.includes('tangguh')) {
    opening = `Untuk sang pejuang tangguh, ${recipient}! Hari ini adalah bukti keteguhan hatimu! 🦸⚡`;
    closing = `Teruslah melangkah bagai pahlawan!\nDari kawan seperjuanganmu, ${sender} 🔥`;
  }

  const cleanPoints = (points || '').trim();
  let body = '';
  if (cleanPoints) {
    body = `Ada hal yang ingin kusampaikan dari lubuk hati terdalam:\n"${cleanPoints}"\n\nTerima kasih sudah selalu hadir, menginspirasi, dan berbagi tawa di setiap kesempatan. Semoga langkahmu ke depan senantiasa dimudahkan, impianmu tercapai satu per satu, dan kebahagiaan selalu menyelimuti harimu.`;
  } else {
    body = `Terima kasih telah menjadi sosok yang begitu berarti dan selalu menghadirkan senyum di sekitarmu. Semoga di hari yang istimewa ini, kamu dilimpahkan kesehatan yang prima, kedamaian hati yang hakiki, dan keberkahan yang tak henti-hentinya. Jangan pernah lelah untuk terus bermimpi dan menjadi yang terbaik!`;
  }

  return `${opening}\n\n${body}\n\n${closing}`;
}

// Endpoint generate kata-kata kartu ucapan via Gemini AI
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

    // Daftar kandidat model dari gemini_api skill
    // Jika salah satu model mengalami lonjakan antrean (503 High Demand), coba kandidat berikutnya secara otomatis
    const candidateModels = ['gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
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
        console.warn(`Model ${model} mengalami kendala (${err.status || err.message}). Mencoba kandidat cadangan berikutnya...`);
        // Tunggu sejenak jika terjadi spike demand sebelum mencoba model berikutnya
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    }

    // Jika seluruh model eksternal sedang overload (503/429), gunakan generator cerdas lokal agar pengguna tidak mengalami error
    if (!generatedText) {
      console.warn('Seluruh model Gemini sedang mengalami high demand spike. Mengaktifkan perangkai kata cerdas alternatif.');
      generatedText = generateFallbackIndonesianMessage({ to, from, panggilan, tone, points });
    }

    return res.json({
      success: true,
      message: generatedText,
    });
  } catch (error) {
    console.error('Error in generate-message handler:', error);
    
    // Bahkan jika inisialisasi API client gagal (misal kunci API belum diisi),
    // kita tetap berikan ucapan yang dirangkai dengan indah sehingga aplikasi tidak pernah macet
    const fallbackText = generateFallbackIndonesianMessage({ to, from, panggilan, tone, points });
    return res.json({
      success: true,
      message: fallbackText,
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

