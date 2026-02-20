require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { moderate } = require('./contentModerator');

// Crash protection - prevent server from dying on errors
process.on('uncaughtException', (err) => {
    console.error('⚠️ Uncaught Exception:', err.message);
});
process.on('unhandledRejection', (reason) => {
    console.error('⚠️ Unhandled Rejection:', reason);
});
process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received, staying alive...');
});
process.stdin.resume(); // Keep process alive

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;

// Uploads klasörünü oluştur
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Data klasörünü oluştur
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const dataFile = path.join(dataDir, 'wishes.json');

// JSON dosyasından dilekleri yükle
function loadWishes() {
    try {
        if (fs.existsSync(dataFile)) {
            const data = fs.readFileSync(dataFile, 'utf8');
            return JSON.parse(data);
        }
    } catch (err) {
        console.error('Veri yükleme hatası:', err.message);
    }
    return [];
}

// Dilekleri JSON dosyasına kaydet
function saveWishes() {
    try {
        fs.writeFileSync(dataFile, JSON.stringify(wishes, null, 2), 'utf8');
    } catch (err) {
        console.error('Veri kaydetme hatası:', err.message);
    }
}

// Multer konfigürasyonu
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `dilek_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`;
        cb(null, uniqueName);
    }
});

const upload = multer({ storage });

// Static dosyalar
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));
app.use(express.json());

// Dilekleri dosyadan yükle
let wishes = loadWishes();
console.log(`📂 ${wishes.length} dilek yüklendi.`);

// AI Moderasyon ayarlari
let moderationSettings = {
    enabled: true,
    checkText: true,
    checkImage: true,
    model: 'gemini-3-flash',
    strictness: 'normal' // 'strict' | 'normal' | 'lenient'
};

// Ana sayfa
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'display.html'));
});

// Clean URLs - .html uzantısız erişim
app.get('/display', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'display.html'));
});
app.get('/upload', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'upload.html'));
});
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Dilek yukleme endpoint'i
app.post('/api/upload', upload.single('photo'), async (req, res) => {
    try {
        const { childName } = req.body;

        if (!req.file) {
            return res.status(400).json({ error: 'Fotograf gerekli' });
        }
        if (!childName || childName.trim().length < 2) {
            return res.status(400).json({ error: 'Isim gerekli (en az 2 karakter)' });
        }

        // 🤖 AI İçerik Moderasyonu
        const filePath = path.join(uploadsDir, req.file.filename);
        if (moderationSettings.enabled) {
            const modResult = await moderate(childName.trim(), filePath, moderationSettings);
            if (!modResult.allowed) {
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                console.log(`🚫 İçerik reddedildi: ${childName} — ${modResult.reason}`);
                return res.status(400).json({
                    error: 'İçerik uygunsuz bulundu',
                    reason: modResult.reason
                });
            }
        } else {
            console.log(`⏭️ Moderasyon devre dışı — ${childName} direkt geçirildi`);
        }

        // 🔍 Fotodaki metni oku (OCR)
        let wishText = '';
        try {
            const imageData = fs.readFileSync(filePath);
            const base64Image = imageData.toString('base64');
            const ext = req.file.originalname.split('.').pop().toLowerCase();
            const mimeType = (ext === 'png') ? 'image/png' : 'image/jpeg';

            const OpenAI = require('openai');
            const client = new OpenAI({
                baseURL: process.env.ANTIGRAVITY_BASE_URL,
                apiKey: process.env.ANTIGRAVITY_API_KEY,
            });

            const ocrResp = await client.chat.completions.create({
                model: 'gemini-3-flash',
                messages: [{
                    role: 'user',
                    content: [
                        {
                            type: 'image_url',
                            image_url: { url: `data:${mimeType};base64,${base64Image}` }
                        },
                        {
                            type: 'text',
                            text: 'Bu fotoğrafta el yazısı ile yazılmış bir metin/şiir var. Lütfen fotoğraftaki TÜM metni baştan sona, satır satır, EKSİKSİZ bir şekilde oku ve metne dök. Hiçbir satırı, kelimeyi veya paragrafı kesinlikle atlama. Özetleme yapma. Sadece okuduğun metnin kendisini çıktı olarak ver.'
                        }
                    ]
                }],
                max_tokens: 800,
                temperature: 0.2,
            });
            wishText = (ocrResp.choices[0]?.message?.content || '').trim();
            console.log(`📝 OCR sonucu: "${wishText}"`);
        } catch (ocrErr) {
            console.warn('⚠️ OCR hatasi:', ocrErr.message);
        }

        const wish = {
            id: Date.now().toString(),
            childName: childName.trim(),
            wishText,
            photoUrl: `/uploads/${req.file.filename}`,
            timestamp: new Date().toISOString(),
            isSpotlight: false
        };

        wishes.push(wish);
        saveWishes();
        io.emit('new-wish', wish);
        console.log(`✅ Yeni dilek onaylandı: ${wish.childName}`);
        res.json({ success: true, wish });
    } catch (error) {
        console.error('Yukleme hatasi:', error);
        res.status(500).json({ error: 'Sunucu hatasi' });
    }
});

// Moderasyon ayarlarini getir / guncelle
app.get('/api/moderation', (req, res) => {
    res.json(moderationSettings);
});

app.post('/api/moderation/toggle', (req, res) => {
    moderationSettings.enabled = !moderationSettings.enabled;
    const state = moderationSettings.enabled ? 'ACIK' : 'KAPALI';
    console.log(`🤖 AI Moderasyon: ${state}`);
    io.emit('moderation-state', moderationSettings);
    res.json({ success: true, ...moderationSettings });
});

app.post('/api/moderation/settings', (req, res) => {
    const { enabled, checkText, checkImage, model, strictness } = req.body;
    if (typeof enabled === 'boolean') moderationSettings.enabled = enabled;
    if (typeof checkText === 'boolean') moderationSettings.checkText = checkText;
    if (typeof checkImage === 'boolean') moderationSettings.checkImage = checkImage;
    if (model) moderationSettings.model = model;
    if (strictness) moderationSettings.strictness = strictness;
    console.log('🤖 Moderasyon ayarlari guncellendi:', moderationSettings);
    io.emit('moderation-state', moderationSettings);
    res.json({ success: true, ...moderationSettings });
});

// Spotlight modunu aktiflesir (kumbaradan cekilen dilek)
app.post('/api/spotlight/:id', (req, res) => {
    const { id } = req.params;

    // Tüm spotlight'ları kapat
    wishes.forEach(w => w.isSpotlight = false);

    // Seçilen dileği spotlight yap
    const wish = wishes.find(w => w.id === id);
    if (wish) {
        wish.isSpotlight = true;
        io.emit('spotlight', wish);
        console.log(`🌟 Spotlight: ${wish.childName}`);
        res.json({ success: true, wish });
    } else {
        res.status(404).json({ error: 'Dilek bulunamadı' });
    }
});

// Son eklenen dileği spotlight yap
app.post('/api/spotlight-latest', (req, res) => {
    if (wishes.length === 0) {
        return res.status(404).json({ error: 'Henüz dilek yok' });
    }

    // Tüm spotlight'ları kapat
    wishes.forEach(w => w.isSpotlight = false);

    // Son dileği spotlight yap
    const latestWish = wishes[wishes.length - 1];
    latestWish.isSpotlight = true;
    io.emit('spotlight', latestWish);
    console.log(`🌟 Spotlight (son): ${latestWish.childName}`);
    res.json({ success: true, wish: latestWish });
});

// Spotlight'ı kapat
app.post('/api/spotlight-off', (req, res) => {
    wishes.forEach(w => w.isSpotlight = false);
    io.emit('spotlight-off');
    console.log('💫 Spotlight kapatıldı');
    res.json({ success: true });
});

// === OTOMATİK SPOTLIGHT (SLAYT GÖSTERİSİ) ===
let autoSpotlightInterval = null;
let autoSpotlightIndex = 0;
let autoSpotlightDelay = 10000; // varsayilan 10 saniye

app.post('/api/auto-spotlight/start', (req, res) => {
    const { delay } = req.body || {};
    if (delay) autoSpotlightDelay = parseInt(delay) * 1000;

    if (wishes.length === 0) {
        return res.json({ success: false, error: 'Dilek yok' });
    }

    // Oncekini temizle
    if (autoSpotlightInterval) clearInterval(autoSpotlightInterval);

    autoSpotlightIndex = 0;
    const cycleSpotlight = () => {
        if (wishes.length === 0) return;
        autoSpotlightIndex = autoSpotlightIndex % wishes.length;
        const wish = wishes[autoSpotlightIndex];
        wishes.forEach(w => w.isSpotlight = false);
        wish.isSpotlight = true;
        io.emit('spotlight', wish);
        console.log(`🔄 Oto-Spotlight: ${wish.childName} (${autoSpotlightIndex + 1}/${wishes.length})`);
        autoSpotlightIndex++;
    };

    cycleSpotlight(); // ilk dileği hemen göster
    autoSpotlightInterval = setInterval(cycleSpotlight, autoSpotlightDelay);
    console.log(`▶️ Otomatik Spotlight başladı (${autoSpotlightDelay / 1000}s aralık)`);
    res.json({ success: true, delay: autoSpotlightDelay / 1000 });
});

app.post('/api/auto-spotlight/stop', (req, res) => {
    if (autoSpotlightInterval) {
        clearInterval(autoSpotlightInterval);
        autoSpotlightInterval = null;
    }
    wishes.forEach(w => w.isSpotlight = false);
    io.emit('spotlight-off');
    console.log('⏹️ Otomatik Spotlight durduruldu');
    res.json({ success: true });
});

app.get('/api/auto-spotlight/status', (req, res) => {
    res.json({
        active: !!autoSpotlightInterval,
        delay: autoSpotlightDelay / 1000,
        index: autoSpotlightIndex
    });
});

// === TEMA SİSTEMİ ===
let currentTheme = 'iyilik';

app.get('/api/theme', (req, res) => {
    res.json({ theme: currentTheme });
});

app.post('/api/theme', (req, res) => {
    const { theme } = req.body;
    currentTheme = theme || 'default';
    io.emit('theme-change', currentTheme);
    console.log(`🎨 Tema değiştirildi: ${currentTheme}`);
    res.json({ success: true, theme: currentTheme });
});

// Tüm dilekleri getir
app.get('/api/wishes', (req, res) => {
    res.json(wishes);
});

// Yerel IP adresini bul
function getLocalIP() {
    const nets = require('os').networkInterfaces();
    let localIP = 'localhost';
    
    // Ağ arayüzlerini tara ve 192., 10., veya belli 172. ile başlayan (yaygın LAN IP'leri) adresi bul
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            // Dahili ve IPv6 değilse
            if (net.family === 'IPv4' && !net.internal) {
                // Hyper-V Default Switch'i atla (genelde 172.2x ile başlar)
                if (name.toLowerCase().includes('default switch')) continue;
                
                // Özellikle 192.168.x.x gibi yaygın yerel ağ adreslerine öncelik ver
                if (net.address.startsWith('192.168.') || net.address.startsWith('10.')) {
                    return net.address;
                }
                
                // Eğer hiçbiri eşleşmezse, ilk bulduğunu kaydet ama döngüye devam et (daha iyi bir eşleşme olabilir diye)
                if (localIP === 'localhost') {
                    localIP = net.address;
                }
            }
        }
    }
    return localIP;
}

// Yerel IP adresini getir
app.get('/api/local-ip', (req, res) => {
    res.json({ ip: getLocalIP() });
});

// Tek dilek sil
app.delete('/api/wishes/:id', (req, res) => {
    const { id } = req.params;
    const wishIndex = wishes.findIndex(w => w.id === id);

    if (wishIndex === -1) {
        return res.status(404).json({ error: 'Dilek bulunamadı' });
    }

    const wish = wishes[wishIndex];

    // Dosyayi sil (varsa)
    if (wish.photoUrl) {
        const filePath = path.join(__dirname, wish.photoUrl);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }

    wishes.splice(wishIndex, 1);
    saveWishes();
    io.emit('wish-deleted', { id });
    console.log(`🗑️ Dilek silindi: ${wish.childName}`);
    res.json({ success: true });
});

// Tüm dilekleri sil
app.delete('/api/wishes', (req, res) => {
    // Tüm fotoğrafları sil
    wishes.forEach(wish => {
        if (wish.photoUrl) {
            const filePath = path.join(__dirname, wish.photoUrl);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }
    });

    wishes = [];
    saveWishes();
    io.emit('all-cleared');
    console.log('🗑️ Tüm dilekler silindi');
    res.json({ success: true });
});

// Socket.io bağlantıları
io.on('connection', (socket) => {
    console.log('🔌 Yeni bağlantı:', socket.id);

    // Mevcut dilekleri gönder
    socket.emit('all-wishes', wishes);

    socket.on('disconnect', () => {
        console.log('🔌 Bağlantı koptu:', socket.id);
    });
});

// Sunucuyu başlat
server.listen(PORT, '0.0.0.0', () => {
    // Yerel IP adresini bul
    const nets = require('os').networkInterfaces();
    let localIP = 'localhost';
    for (const name of Object.keys(nets)) {
        if (name.toLowerCase().includes('vethernet')) continue;
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                localIP = net.address;
                break;
            }
        }
    }
    console.log(`
╔══════════════════════════════════════════════════════╗
║          🏺 DİLEK KUMBARASI BAŞLATILDI 🏺            ║
╠══════════════════════════════════════════════════════╣
║                                                      ║
║  📱 Telefon:  http://${localIP}:${PORT}/upload
║  🖥️  Ekran:    http://${localIP}:${PORT}/display
║  ⚙️  Yönetim:  http://${localIP}:${PORT}/admin
║                                                      ║
╚══════════════════════════════════════════════════════╝
    `);
});
