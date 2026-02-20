require('dotenv').config();
const { moderateText } = require('./contentModerator');

async function runTests() {
    console.log('=== GENISLETILMIS MODERASYON TESTLERI ===\n');

    const tests = [
        // Gecmeli
        { text: 'Elif', label: 'Normal isim' },
        { text: 'Herkese saglik ve mutluluk', label: 'Iyilik dilegi' },
        { text: 'Annem icin dua ediyorum', label: 'Dua' },
        { text: 'Dunyada baris olsun', label: 'Baris dilegi' },
        // Reddedilmeli
        { text: 'Turk Telekom iflas etsin', label: 'Negatif dilek - sirket' },
        { text: 'Ogretmenim berbat', label: 'Sikayetci' },
        { text: 'siktir', label: 'Kufur' },
        { text: 'Erdogan batsın', label: 'Siyasi nefret' },
        { text: 'herkes olsun', label: 'Beddua' },
        { text: 'aaaaaaaaaa', label: 'Spam' },
        { text: 'Ulkemiz batsın', label: 'Negatif dilek - ulke' },
    ];

    let passed = 0, failed = 0;
    for (const t of tests) {
        const result = await moderateText(t.text);
        const icon = result.allowed ? '[ONAY]' : '[RED] ';
        console.log(`${icon} [${t.label}] "${t.text}"`);
    }

    console.log('\nTum testler tamamlandi!');
}

runTests().catch(console.error);
