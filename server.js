const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

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

// Ana sayfa
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'display.html'));
});

// Uzantısız URL'ler
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
app.get('/upload', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'upload.html'));
});
app.get('/display', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'display.html'));
});

// Dilek yukleme endpoint'i
app.post('/api/upload', upload.single('photo'), (req, res) => {
    try {
        const { childName } = req.body;

        if (!req.file) {
            return res.status(400).json({ error: 'Fotograf gerekli' });
        }
        if (!childName || childName.trim().length < 2) {
            return res.status(400).json({ error: 'Isim gerekli (en az 2 karakter)' });
        }

        const wish = {
            id: Date.now().toString(),
            childName: childName.trim(),
            photoUrl: `/uploads/${req.file.filename}`,
            timestamp: new Date().toISOString(),
            isSpotlight: false
        };

        wishes.push(wish);
        saveWishes();
        io.emit('new-wish', wish);
        console.log('Yeni dilek:', wish.childName);
        res.json({ success: true, wish });
    } catch (error) {
        console.error('Yukleme hatasi:', error);
        res.status(500).json({ error: 'Sunucu hatasi' });
    }
});

// Spotlight modunu aktifleştir (kumbaradan çekilen dilek)
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
let currentTheme = 'default';

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
║  📱 Telefon:  http://${localIP}:${PORT}/upload.html
║  🖥️  Ekran:    http://${localIP}:${PORT}/display.html
║  ⚙️  Yönetim:  http://${localIP}:${PORT}/admin.html
║                                                      ║
╚══════════════════════════════════════════════════════╝
    `);
});
