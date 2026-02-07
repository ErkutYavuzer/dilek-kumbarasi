# 🏺 Dilek Kumbarası

Çocuk etkinlikleri için interaktif dilek duvarı. Çocuklar dileklerini kağıda yazar, fotoğrafını çeker ve büyük ekrana yansıtılır.

## Kurulum

```bash
npm install
node server.js
```

Sunucu başladığında terminalde IP adresi ve sayfa linkleri otomatik gösterilir.

## Kullanım

| Sayfa | Açıklama |
|-------|----------|
| `/upload.html` | 📱 Telefondan fotoğraf yükleme (QR kod ile paylaş) |
| `/display.html` | 🖥️ Büyük ekranda gösterim (projektöre bağla) |
| `/admin.html` | ⚙️ Yönetim paneli (dilek yönetimi, spotlight, tema) |

## Özellikler

- 📂 **JSON dosya depolama** — Sunucu yeniden başlasa bile veriler korunur
- 🔊 **Ses efektleri** — Yeni dilek + spotlight açıldığında
- 🎊 **Konfeti animasyonu** — Yeni dilek gelince
- ⛶ **Fullscreen modu** — Büyük ekran için
- 🔄 **Otomatik spotlight** — Slayt gösterisi (5/10/15/30 saniye)
- 🎨 **7 tema** — Kozmik Gece, Doğum Günü, 23 Nisan, Bayram, Kış, Yılbaşı, Bahar
- 🔍 **Arama** — Admin panelinde dilek filtreleme
- 📱 **QR kod** — Otomatik oluşturulan paylaşım kodu

## Gereksinimler

- Node.js 18+
- Aynı Wi-Fi ağında olmak (telefon → bilgisayar bağlantısı için)
