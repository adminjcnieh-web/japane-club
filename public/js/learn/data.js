// Isi Learning Center. Semua materi ditulis di sini (tanpa database), supaya cepat dan gratis.
// Katakana dibuat otomatis dari tabel hiragana (selisih kode karakter tetap), sehingga konsisten.
//
// Bentuk satu level:
//   { n, title, intro, cards:[{big, small, text}], examples:[[jp, romaji, arti]], ...data khusus kategori }

const H = {
  a: [['あ', 'a'], ['い', 'i'], ['う', 'u'], ['え', 'e'], ['お', 'o']],
  k: [['か', 'ka'], ['き', 'ki'], ['く', 'ku'], ['け', 'ke'], ['こ', 'ko']],
  s: [['さ', 'sa'], ['し', 'shi'], ['す', 'su'], ['せ', 'se'], ['そ', 'so']],
  t: [['た', 'ta'], ['ち', 'chi'], ['つ', 'tsu'], ['て', 'te'], ['と', 'to']],
  n: [['な', 'na'], ['に', 'ni'], ['ぬ', 'nu'], ['ね', 'ne'], ['の', 'no']],
  h: [['は', 'ha'], ['ひ', 'hi'], ['ふ', 'fu'], ['へ', 'he'], ['ほ', 'ho']],
  m: [['ま', 'ma'], ['み', 'mi'], ['む', 'mu'], ['め', 'me'], ['も', 'mo']],
  y: [['や', 'ya'], ['ゆ', 'yu'], ['よ', 'yo']],
  r: [['ら', 'ra'], ['り', 'ri'], ['る', 'ru'], ['れ', 're'], ['ろ', 'ro']],
  w: [['わ', 'wa'], ['を', 'wo'], ['ん', 'n']],
  g: [['が', 'ga'], ['ぎ', 'gi'], ['ぐ', 'gu'], ['げ', 'ge'], ['ご', 'go']],
  z: [['ざ', 'za'], ['じ', 'ji'], ['ず', 'zu'], ['ぜ', 'ze'], ['ぞ', 'zo']],
  d: [['だ', 'da'], ['で', 'de'], ['ど', 'do']],
  b: [['ば', 'ba'], ['び', 'bi'], ['ぶ', 'bu'], ['べ', 'be'], ['ぼ', 'bo']],
  p: [['ぱ', 'pa'], ['ぴ', 'pi'], ['ぷ', 'pu'], ['ぺ', 'pe'], ['ぽ', 'po']],
  yoon: [['きゃ', 'kya'], ['きゅ', 'kyu'], ['きょ', 'kyo'], ['しゃ', 'sha'], ['しゅ', 'shu'], ['しょ', 'sho'], ['ちゃ', 'cha'], ['ちゅ', 'chu'], ['ちょ', 'cho'], ['りゃ', 'rya'], ['りゅ', 'ryu'], ['りょ', 'ryo']],
};

const toKata = (s) => [...s].map((c) => { const n = c.codePointAt(0); return n >= 0x3041 && n <= 0x3096 ? String.fromCodePoint(n + 0x60) : c; }).join('');

const KANA_PLAN = [
  { title: 'Baris A (a i u e o)', groups: ['a'], note: 'Lima huruf vokal. Semua huruf Jepang lain dibangun dari bunyi ini.' },
  { title: 'Baris KA (ka ki ku ke ko)', groups: ['k'], note: 'Konsonan K + vokal. Dibaca seperti bahasa Indonesia.' },
  { title: 'Baris SA (sa shi su se so)', groups: ['s'], note: 'Perhatikan "shi": dibaca "syi", bukan "si".' },
  { title: 'Baris TA (ta chi tsu te to)', groups: ['t'], note: '"chi" dibaca "ci" dan "tsu" dibaca "tsu" (ts + u).' },
  { title: 'Baris NA (na ni nu ne no)', groups: ['n'], note: 'Konsonan N + vokal.' },
  { title: 'Baris HA (ha hi fu he ho)', groups: ['h'], note: '"fu" bunyinya antara "hu" dan "fu". Huruf は dibaca "wa" saat menjadi partikel.' },
  { title: 'Baris MA (ma mi mu me mo)', groups: ['m'], note: 'Konsonan M + vokal.' },
  { title: 'Baris YA dan RA', groups: ['y', 'r'], note: 'Baris YA hanya punya ya, yu, yo. Bunyi "r" Jepang ringan, antara r dan l.' },
  { title: 'WA, WO, N dan baris GA', groups: ['w', 'g'], note: 'ん adalah satu-satunya huruf konsonan murni. Tanda dakuten (゛) mengubah k menjadi g.' },
  { title: 'Baris ZA dan DA', groups: ['z', 'd'], note: 'Dakuten pada s menjadi z, pada t menjadi d. じ dibaca "ji".' },
  { title: 'Baris BA dan PA', groups: ['b', 'p'], note: 'Dakuten pada h menjadi b. Handakuten (゜) pada h menjadi p.' },
  { title: 'Kombinasi (kya, sha, cha, rya)', groups: ['yoon'], note: 'Huruf berakhiran i + ya/yu/yo kecil digabung menjadi satu bunyi, misalnya きゃ dibaca "kya".' },
];

const HIRA_EX = [
  [['あめ', 'ame', 'hujan'], ['いぬ', 'inu', 'anjing'], ['うみ', 'umi', 'laut'], ['えき', 'eki', 'stasiun'], ['おちゃ', 'ocha', 'teh']],
  [['かさ', 'kasa', 'payung'], ['くち', 'kuchi', 'mulut'], ['こえ', 'koe', 'suara']],
  [['さかな', 'sakana', 'ikan'], ['すし', 'sushi', 'sushi'], ['せかい', 'sekai', 'dunia']],
  [['たまご', 'tamago', 'telur'], ['つくえ', 'tsukue', 'meja'], ['とけい', 'tokei', 'jam']],
  [['なつ', 'natsu', 'musim panas'], ['ねこ', 'neko', 'kucing'], ['にく', 'niku', 'daging']],
  [['はな', 'hana', 'bunga'], ['ひと', 'hito', 'orang'], ['ふね', 'fune', 'kapal'], ['ほし', 'hoshi', 'bintang']],
  [['まど', 'mado', 'jendela'], ['みず', 'mizu', 'air'], ['もり', 'mori', 'hutan']],
  [['やま', 'yama', 'gunung'], ['ゆき', 'yuki', 'salju'], ['くるま', 'kuruma', 'mobil'], ['りんご', 'ringo', 'apel']],
  [['わたし', 'watashi', 'saya'], ['かぎ', 'kagi', 'kunci'], ['ごはん', 'gohan', 'nasi']],
  [['かぜ', 'kaze', 'angin'], ['でんわ', 'denwa', 'telepon'], ['どうぞ', 'douzo', 'silakan']],
  [['かばん', 'kaban', 'tas'], ['おべんとう', 'obentou', 'bekal'], ['さんぽ', 'sanpo', 'jalan-jalan']],
  [['きゃく', 'kyaku', 'tamu'], ['しゃしん', 'shashin', 'foto'], ['りょこう', 'ryokou', 'perjalanan']],
];
const KATA_EX = [
  [['アイス', 'aisu', 'es krim'], ['エアコン', 'eakon', 'AC'], ['オレンジ', 'orenji', 'jeruk']],
  [['カメラ', 'kamera', 'kamera'], ['コーヒー', 'koohii', 'kopi'], ['ケーキ', 'keeki', 'kue']],
  [['サッカー', 'sakkaa', 'sepak bola'], ['スープ', 'suupu', 'sup'], ['ソース', 'soosu', 'saus']],
  [['テレビ', 'terebi', 'televisi'], ['トイレ', 'toire', 'toilet'], ['タクシー', 'takushii', 'taksi']],
  [['ナイフ', 'naifu', 'pisau'], ['ネクタイ', 'nekutai', 'dasi'], ['ノート', 'nooto', 'buku catatan']],
  [['ホテル', 'hoteru', 'hotel'], ['フォーク', 'fooku', 'garpu'], ['ヒーター', 'hiitaa', 'pemanas']],
  [['マスク', 'masuku', 'masker'], ['メロン', 'meron', 'melon'], ['ミルク', 'miruku', 'susu']],
  [['ラジオ', 'rajio', 'radio'], ['レストラン', 'resutoran', 'restoran'], ['ルール', 'ruuru', 'aturan']],
  [['ゲーム', 'geemu', 'permainan'], ['ガム', 'gamu', 'permen karet'], ['ギター', 'gitaa', 'gitar']],
  [['ゼロ', 'zero', 'nol'], ['デパート', 'depaato', 'pusat perbelanjaan'], ['ドア', 'doa', 'pintu']],
  [['バス', 'basu', 'bus'], ['ピアノ', 'piano', 'piano'], ['プール', 'puuru', 'kolam renang'], ['ペン', 'pen', 'pena']],
  [['ジュース', 'juusu', 'jus'], ['チョコレート', 'chokoreeto', 'cokelat'], ['シャワー', 'shawaa', 'pancuran/mandi']],
];

function kanaLessons(script) {
  return KANA_PLAN.map((p, i) => {
    const pairs = p.groups.flatMap((g) => H[g]).map(([c, r]) => [script === 'kata' ? toKata(c) : c, r]);
    return {
      n: i + 1,
      title: p.title,
      intro: p.note + (script === 'kata' ? ' Katakana dipakai untuk kata serapan dan nama asing.' : ''),
      items: pairs.map(([c, r]) => ({ char: c, romaji: r })),
      cards: pairs.map(([c, r]) => ({ big: c, small: r, text: `dibaca "${r}"` })),
      examples: (script === 'kata' ? KATA_EX : HIRA_EX)[i],
    };
  });
}

// ---------- Kanji ----------
const kj = (char, reading, romaji, meaning, ex, note = '') => ({ char, reading, romaji, meaning, ex, note });
const KANJI_PLAN = [
  { title: 'Angka 1 sampai 5', intro: 'Kanji angka paling sering muncul di kalender dan harga.', k: [kj('一', 'いち', 'ichi', 'satu', ['一つ', 'ひとつ', 'satu buah']), kj('二', 'に', 'ni', 'dua', ['二つ', 'ふたつ', 'dua buah']), kj('三', 'さん', 'san', 'tiga', ['三つ', 'みっつ', 'tiga buah']), kj('四', 'よん', 'yon', 'empat', ['四月', 'しがつ', 'April'], 'juga dibaca し'), kj('五', 'ご', 'go', 'lima', ['五月', 'ごがつ', 'Mei'])] },
  { title: 'Angka 6 sampai 10', intro: 'Lanjutan kanji angka. Perhatikan angka 7 dan 9 yang punya dua bacaan.', k: [kj('六', 'ろく', 'roku', 'enam', ['六月', 'ろくがつ', 'Juni']), kj('七', 'なな', 'nana', 'tujuh', ['七月', 'しちがつ', 'Juli'], 'juga dibaca しち'), kj('八', 'はち', 'hachi', 'delapan', ['八月', 'はちがつ', 'Agustus']), kj('九', 'きゅう', 'kyuu', 'sembilan', ['九月', 'くがつ', 'September'], 'juga dibaca く'), kj('十', 'じゅう', 'juu', 'sepuluh', ['十月', 'じゅうがつ', 'Oktober'])] },
  { title: 'Hari dan unsur alam', intro: 'Kanji ini membentuk nama hari dalam seminggu.', k: [kj('日', 'ひ', 'hi', 'hari, matahari', ['日本', 'にほん', 'Jepang']), kj('月', 'つき', 'tsuki', 'bulan', ['月曜日', 'げつようび', 'hari Senin']), kj('火', 'ひ', 'hi', 'api', ['火曜日', 'かようび', 'hari Selasa']), kj('水', 'みず', 'mizu', 'air', ['水曜日', 'すいようび', 'hari Rabu']), kj('木', 'き', 'ki', 'pohon, kayu', ['木曜日', 'もくようび', 'hari Kamis']), kj('金', 'かね', 'kane', 'emas, uang', ['金曜日', 'きんようび', 'hari Jumat'], 'dalam nama hari dibaca きん'), kj('土', 'つち', 'tsuchi', 'tanah', ['土曜日', 'どようび', 'hari Sabtu'], 'dalam nama hari dibaca ど')] },
  { title: 'Orang dan tubuh', intro: 'Kanji sederhana tentang manusia dan anggota tubuh.', k: [kj('人', 'ひと', 'hito', 'orang', ['日本人', 'にほんじん', 'orang Jepang']), kj('口', 'くち', 'kuchi', 'mulut', ['出口', 'でぐち', 'pintu keluar']), kj('目', 'め', 'me', 'mata', ['目', 'め', 'mata']), kj('手', 'て', 'te', 'tangan', ['手', 'て', 'tangan']), kj('足', 'あし', 'ashi', 'kaki', ['足', 'あし', 'kaki']), kj('耳', 'みみ', 'mimi', 'telinga', ['耳', 'みみ', 'telinga'])] },
  { title: 'Ukuran dan arah', intro: 'Kanji untuk menyatakan besar, kecil, atas, bawah, dan tengah.', k: [kj('大', 'おおきい', 'ookii', 'besar', ['大学', 'だいがく', 'universitas']), kj('小', 'ちいさい', 'chiisai', 'kecil', ['小学校', 'しょうがっこう', 'sekolah dasar']), kj('上', 'うえ', 'ue', 'atas', ['上', 'うえ', 'atas']), kj('下', 'した', 'shita', 'bawah', ['下', 'した', 'bawah']), kj('中', 'なか', 'naka', 'tengah, dalam', ['中', 'なか', 'dalam'])] },
  { title: 'Sekolah', intro: 'Kanji yang kamu temui di lingkungan sekolah.', k: [kj('学', 'がく', 'gaku', 'belajar', ['学生', 'がくせい', 'siswa/mahasiswa']), kj('校', 'こう', 'kou', 'sekolah', ['学校', 'がっこう', 'sekolah']), kj('先', 'さき', 'saki', 'lebih dulu, ujung', ['先生', 'せんせい', 'guru']), kj('生', 'せい', 'sei', 'hidup, lahir', ['先生', 'せんせい', 'guru']), kj('本', 'ほん', 'hon', 'buku, asal', ['日本', 'にほん', 'Jepang'])] },
];
function kanjiLessons() {
  return KANJI_PLAN.map((p, i) => ({
    n: i + 1,
    title: p.title,
    intro: p.intro,
    kanji: p.k,
    cards: p.k.map((x) => ({ big: x.char, small: `${x.reading} (${x.romaji})`, text: `${x.meaning}. Contoh: ${x.ex[0]} (${x.ex[1]}) = ${x.ex[2]}${x.note ? `. ${x.note}` : ''}` })),
    examples: p.k.slice(0, 3).map((x) => [x.ex[0], x.ex[1], x.ex[2]]),
  }));
}

// ---------- Kosakata ----------
const w = (jp, kana, romaji, id) => ({ jp, kana, romaji, id });
const VOCAB_PLAN = [
  { title: 'Salam dan ungkapan', intro: 'Ungkapan yang dipakai setiap hari.', w: [w('おはよう', 'おはよう', 'ohayou', 'selamat pagi'), w('こんにちは', 'こんにちは', 'konnichiwa', 'selamat siang / halo'), w('こんばんは', 'こんばんは', 'konbanwa', 'selamat malam'), w('さようなら', 'さようなら', 'sayounara', 'selamat tinggal'), w('ありがとう', 'ありがとう', 'arigatou', 'terima kasih'), w('すみません', 'すみません', 'sumimasen', 'maaf / permisi'), w('おねがいします', 'おねがいします', 'onegaishimasu', 'tolong / mohon'), w('いただきます', 'いただきます', 'itadakimasu', 'selamat makan (sebelum makan)')] },
  { title: 'Angka', intro: 'Angka 1 sampai 10 dalam bacaan Jepang.', w: [w('いち', 'いち', 'ichi', 'satu'), w('に', 'に', 'ni', 'dua'), w('さん', 'さん', 'san', 'tiga'), w('よん', 'よん', 'yon', 'empat'), w('ご', 'ご', 'go', 'lima'), w('ろく', 'ろく', 'roku', 'enam'), w('なな', 'なな', 'nana', 'tujuh'), w('はち', 'はち', 'hachi', 'delapan'), w('きゅう', 'きゅう', 'kyuu', 'sembilan'), w('じゅう', 'じゅう', 'juu', 'sepuluh')] },
  { title: 'Keluarga', intro: 'Menyebut anggota keluarga sendiri.', w: [w('かぞく', 'かぞく', 'kazoku', 'keluarga'), w('ちち', 'ちち', 'chichi', 'ayah (saya)'), w('はは', 'はは', 'haha', 'ibu (saya)'), w('あに', 'あに', 'ani', 'kakak laki-laki (saya)'), w('あね', 'あね', 'ane', 'kakak perempuan (saya)'), w('おとうと', 'おとうと', 'otouto', 'adik laki-laki (saya)'), w('いもうと', 'いもうと', 'imouto', 'adik perempuan (saya)'), w('ともだち', 'ともだち', 'tomodachi', 'teman')] },
  { title: 'Makanan dan minuman', intro: 'Kata-kata di meja makan.', w: [w('ごはん', 'ごはん', 'gohan', 'nasi / makan'), w('みず', 'みず', 'mizu', 'air'), w('おちゃ', 'おちゃ', 'ocha', 'teh'), w('パン', 'パン', 'pan', 'roti'), w('たまご', 'たまご', 'tamago', 'telur'), w('さかな', 'さかな', 'sakana', 'ikan'), w('にく', 'にく', 'niku', 'daging'), w('くだもの', 'くだもの', 'kudamono', 'buah')] },
  { title: 'Hewan', intro: 'Nama hewan yang sering muncul di buku pelajaran.', w: [w('いぬ', 'いぬ', 'inu', 'anjing'), w('ねこ', 'ねこ', 'neko', 'kucing'), w('とり', 'とり', 'tori', 'burung'), w('うま', 'うま', 'uma', 'kuda'), w('うし', 'うし', 'ushi', 'sapi'), w('さる', 'さる', 'saru', 'monyet'), w('ぞう', 'ぞう', 'zou', 'gajah'), w('うさぎ', 'うさぎ', 'usagi', 'kelinci')] },
  { title: 'Warna', intro: 'Warna dasar. Beberapa berakhiran い dan bisa menerangkan benda.', w: [w('あか', 'あか', 'aka', 'merah'), w('あお', 'あお', 'ao', 'biru'), w('きいろ', 'きいろ', 'kiiro', 'kuning'), w('みどり', 'みどり', 'midori', 'hijau'), w('しろ', 'しろ', 'shiro', 'putih'), w('くろ', 'くろ', 'kuro', 'hitam'), w('ちゃいろ', 'ちゃいろ', 'chairo', 'cokelat'), w('ピンク', 'ピンク', 'pinku', 'merah muda')] },
  { title: 'Sekolah', intro: 'Kata-kata di kelas.', w: [w('がっこう', 'がっこう', 'gakkou', 'sekolah'), w('せんせい', 'せんせい', 'sensei', 'guru'), w('がくせい', 'がくせい', 'gakusei', 'siswa / mahasiswa'), w('きょうしつ', 'きょうしつ', 'kyoushitsu', 'ruang kelas'), w('ほん', 'ほん', 'hon', 'buku'), w('えんぴつ', 'えんぴつ', 'enpitsu', 'pensil'), w('つくえ', 'つくえ', 'tsukue', 'meja'), w('かばん', 'かばん', 'kaban', 'tas')] },
  { title: 'Waktu', intro: 'Kata untuk membicarakan hari dan waktu.', w: [w('きょう', 'きょう', 'kyou', 'hari ini'), w('あした', 'あした', 'ashita', 'besok'), w('きのう', 'きのう', 'kinou', 'kemarin'), w('いま', 'いま', 'ima', 'sekarang'), w('あさ', 'あさ', 'asa', 'pagi'), w('ひる', 'ひる', 'hiru', 'siang'), w('よる', 'よる', 'yoru', 'malam'), w('まいにち', 'まいにち', 'mainichi', 'setiap hari')] },
];
function vocabLessons() {
  return VOCAB_PLAN.map((p, i) => ({
    n: i + 1,
    title: p.title,
    intro: p.intro,
    words: p.w,
    cards: p.w.map((x) => ({ big: x.jp, small: x.romaji, text: x.id })),
    examples: p.w.slice(0, 3).map((x) => [x.jp, x.romaji, x.id]),
  }));
}

// ---------- Bunpou (tata bahasa) ----------
const s = (tokens, id, romaji = '') => ({ tokens, id, romaji });
const BUNPOU_PLAN = [
  { title: 'Topik: は dan です', intro: 'Pola dasar: A は B です = "A adalah B". Partikel は ditulis "ha" tetapi dibaca "wa". です menutup kalimat dengan sopan.', rule: 'A は B です', cards: [{ big: 'は', small: 'wa', text: 'penanda topik: "mengenai ...".' }, { big: 'です', small: 'desu', text: 'adalah (bentuk sopan).' }],
    sentences: [s(['わたし', 'は', 'がくせい', 'です'], 'Saya adalah siswa.', 'watashi wa gakusei desu'), s(['これ', 'は', 'ほん', 'です'], 'Ini adalah buku.', 'kore wa hon desu'), s(['たなかさん', 'は', 'せんせい', 'です'], 'Tanaka adalah guru.', 'tanaka-san wa sensei desu'), s(['わたし', 'は', 'インドネシアじん', 'です'], 'Saya orang Indonesia.', 'watashi wa indoneshia-jin desu'), s(['あれ', 'は', 'がっこう', 'です'], 'Itu (di sana) adalah sekolah.', 'are wa gakkou desu')],
    fills: [{ jp: 'わたし ___ がくせいです。', answer: 'は', options: ['は', 'を', 'に', 'の'], id: 'Saya adalah siswa.' }, { jp: 'これは ほん ___。', answer: 'です', options: ['です', 'は', 'を', 'か'], id: 'Ini adalah buku.' }] },
  { title: 'Kata tunjuk: これ, それ, あれ', intro: 'これ = ini (dekat pembicara), それ = itu (dekat lawan bicara), あれ = itu (jauh dari keduanya).', rule: 'これ / それ / あれ + は + benda + です', cards: [{ big: 'これ', small: 'kore', text: 'ini (dekat saya)' }, { big: 'それ', small: 'sore', text: 'itu (dekat kamu)' }, { big: 'あれ', small: 'are', text: 'itu (jauh dari kita)' }],
    sentences: [s(['これ', 'は', 'ペン', 'です'], 'Ini pena.', 'kore wa pen desu'), s(['それ', 'は', 'かばん', 'です'], 'Itu tas.', 'sore wa kaban desu'), s(['あれ', 'は', 'やま', 'です'], 'Itu gunung.', 'are wa yama desu'), s(['これ', 'は', 'えんぴつ', 'です'], 'Ini pensil.', 'kore wa enpitsu desu')],
    fills: [{ jp: '(benda di tanganku) ___ は ほんです。', answer: 'これ', options: ['これ', 'それ', 'あれ', 'は'], id: 'Benda dekat pembicara.' }, { jp: '(gunung di kejauhan) ___ は やまです。', answer: 'あれ', options: ['あれ', 'これ', 'それ', 'の'], id: 'Benda jauh dari keduanya.' }, { jp: '(benda di tanganmu) ___ は かばんです。', answer: 'それ', options: ['それ', 'これ', 'あれ', 'を'], id: 'Benda dekat lawan bicara.' }] },
  { title: 'Kepemilikan: の', intro: 'の menghubungkan dua kata, seperti "milik" atau "tentang": わたしの ほん = buku saya.', rule: 'A の B = B milik/tentang A', cards: [{ big: 'の', small: 'no', text: 'milik / tentang.' }],
    sentences: [s(['これ', 'は', 'わたし', 'の', 'かばん', 'です'], 'Ini tas saya.', 'kore wa watashi no kaban desu'), s(['たなかさん', 'の', 'ほん', 'です'], 'Ini buku Tanaka.', 'tanaka-san no hon desu'), s(['ともだち', 'の', 'いえ', 'です'], 'Ini rumah teman.', 'tomodachi no ie desu'), s(['にほんご', 'の', 'ほん', 'です'], 'Ini buku bahasa Jepang.', 'nihongo no hon desu')],
    fills: [{ jp: 'わたし ___ ほん', answer: 'の', options: ['の', 'は', 'を', 'に'], id: 'buku saya' }, { jp: 'せんせい ___ かばん', answer: 'の', options: ['の', 'を', 'で', 'か'], id: 'tas guru' }] },
  { title: 'Objek: を dan kata kerja ます', intro: 'を menandai benda yang dikenai pekerjaan. Kata kerja sopan berakhiran ます.', rule: 'benda + を + kata kerja ます', cards: [{ big: 'を', small: 'o', text: 'penanda objek (ditulis "wo", dibaca "o").' }, { big: 'たべます', small: 'tabemasu', text: 'makan' }, { big: 'のみます', small: 'nomimasu', text: 'minum' }, { big: 'よみます', small: 'yomimasu', text: 'membaca' }],
    sentences: [s(['パン', 'を', 'たべます'], 'Makan roti.', 'pan o tabemasu'), s(['みず', 'を', 'のみます'], 'Minum air.', 'mizu o nomimasu'), s(['ほん', 'を', 'よみます'], 'Membaca buku.', 'hon o yomimasu'), s(['テレビ', 'を', 'みます'], 'Menonton televisi.', 'terebi o mimasu'), s(['にほんご', 'を', 'べんきょうします'], 'Belajar bahasa Jepang.', 'nihongo o benkyou shimasu')],
    fills: [{ jp: 'パン ___ たべます。', answer: 'を', options: ['を', 'は', 'の', 'で'], id: 'Makan roti.' }, { jp: 'おちゃ ___ のみます。', answer: 'を', options: ['を', 'に', 'の', 'か'], id: 'Minum teh.' }] },
  { title: 'Tempat dan cara: に dan で', intro: 'に menunjukkan tujuan atau waktu. で menunjukkan tempat berlangsungnya kegiatan atau alat/cara.', rule: 'tujuan + に + いきます / tempat + で + kegiatan', cards: [{ big: 'に', small: 'ni', text: 'ke (tujuan), pada (waktu).' }, { big: 'で', small: 'de', text: 'di (tempat kegiatan), dengan (alat).' }],
    sentences: [s(['がっこう', 'に', 'いきます'], 'Pergi ke sekolah.', 'gakkou ni ikimasu'), s(['いえ', 'で', 'ごはん', 'を', 'たべます'], 'Makan nasi di rumah.', 'ie de gohan o tabemasu'), s(['としょかん', 'で', 'べんきょうします'], 'Belajar di perpustakaan.', 'toshokan de benkyou shimasu'), s(['バス', 'で', 'いきます'], 'Pergi naik bus.', 'basu de ikimasu')],
    fills: [{ jp: 'がっこう ___ いきます。', answer: 'に', options: ['に', 'で', 'を', 'の'], id: 'Pergi ke sekolah.' }, { jp: 'としょかん ___ ほんを よみます。', answer: 'で', options: ['で', 'に', 'は', 'か'], id: 'Membaca buku di perpustakaan.' }] },
  { title: 'Pertanyaan dan penyangkalan: か, じゃありません', intro: 'Tambahkan か di akhir kalimat untuk bertanya. Untuk menyangkal "bukan", pakai じゃありません.', rule: 'kalimat + か / A は B じゃありません', cards: [{ big: 'か', small: 'ka', text: 'penanda pertanyaan.' }, { big: 'じゃありません', small: 'janaimasen', text: 'bukan (sopan).' }],
    sentences: [s(['あなた', 'は', 'がくせい', 'ですか'], 'Apakah kamu siswa?', 'anata wa gakusei desu ka'), s(['これ', 'は', 'ほん', 'ですか'], 'Apakah ini buku?', 'kore wa hon desu ka'), s(['それ', 'は', 'ペン', 'じゃありません'], 'Itu bukan pena.', 'sore wa pen janaimasen'), s(['おちゃ', 'を', 'のみますか'], 'Apakah kamu minum teh?', 'ocha o nomimasu ka')],
    fills: [{ jp: 'あなたは がくせいです ___', answer: 'か', options: ['か', 'の', 'を', 'は'], id: 'Apakah kamu siswa?' }, { jp: 'わたしは せんせい ___。', answer: 'じゃありません', options: ['じゃありません', 'ですか', 'を', 'の'], id: 'Saya bukan guru.' }] },
  { title: 'Kata sifat berakhiran い', intro: 'Kata sifat い bisa langsung diikuti です: たかい です = (itu) tinggi/mahal.', rule: 'benda + は + kata sifat い + です', cards: [{ big: 'たかい', small: 'takai', text: 'tinggi / mahal' }, { big: 'おおきい', small: 'ookii', text: 'besar' }, { big: 'あつい', small: 'atsui', text: 'panas' }, { big: 'おいしい', small: 'oishii', text: 'enak' }, { big: 'おもしろい', small: 'omoshiroi', text: 'menarik / lucu' }],
    sentences: [s(['この', 'ほん', 'は', 'おもしろい', 'です'], 'Buku ini menarik.', 'kono hon wa omoshiroi desu'), s(['あの', 'やま', 'は', 'たかい', 'です'], 'Gunung itu tinggi.', 'ano yama wa takai desu'), s(['きょう', 'は', 'あつい', 'です'], 'Hari ini panas.', 'kyou wa atsui desu'), s(['この', 'おちゃ', 'は', 'おいしい', 'です'], 'Teh ini enak.', 'kono ocha wa oishii desu')],
    fills: [{ jp: 'この おちゃは ___ です。', answer: 'おいしい', options: ['おいしい', 'おおきい', 'あつい', 'たかい'], id: 'Teh ini enak.' }, { jp: 'きょうは ___ です。(panas)', answer: 'あつい', options: ['あつい', 'おいしい', 'たかい', 'おもしろい'], id: 'Hari ini panas.' }] },
];
function bunpouLessons() {
  return BUNPOU_PLAN.map((p, i) => ({ n: i + 1, title: p.title, intro: p.intro, rule: p.rule, cards: p.cards, sentences: p.sentences, fills: p.fills, examples: p.sentences.slice(0, 3).map((x) => [x.tokens.join(''), x.romaji, x.id]) }));
}

// ---------- Percakapan ----------
const ln = (jp, romaji, id) => ({ jp, romaji, id });
const TALK_PLAN = [
  { title: 'Perkenalan diri', intro: 'Kalimat saat bertemu orang baru.',
    lines: [ln('はじめまして。', 'hajimemashite', 'Perkenalkan (salam pertama kali bertemu).'), ln('わたしは さくらです。', 'watashi wa sakura desu', 'Saya Sakura.'), ln('よろしく おねがいします。', 'yoroshiku onegaishimasu', 'Mohon bantuannya / senang berkenalan.'), ln('おなまえは なんですか。', 'onamae wa nan desu ka', 'Siapa namamu?')],
    qa: [{ q: 'Kamu bertemu orang baru untuk pertama kali. Apa yang kamu ucapkan?', a: 'はじめまして。', wrong: ['さようなら。', 'おやすみなさい。', 'いただきます。'] }, { q: 'Kamu ingin menanyakan nama lawan bicara.', a: 'おなまえは なんですか。', wrong: ['いくらですか。', 'トイレは どこですか。', 'わかりません。'] }, { q: 'Setelah memperkenalkan diri, kamu menutup dengan...', a: 'よろしく おねがいします。', wrong: ['ごちそうさまでした。', 'おはようございます。', 'すみません。'] }],
    order: [{ tokens: ['わたし', 'は', 'さくら', 'です'], id: 'Saya Sakura.' }, { tokens: ['よろしく', 'おねがいします'], id: 'Mohon bantuannya.' }] },
  { title: 'Salam sehari-hari', intro: 'Salam menurut waktu dan keadaan.',
    lines: [ln('おはようございます。', 'ohayou gozaimasu', 'Selamat pagi (sopan).'), ln('こんにちは。', 'konnichiwa', 'Selamat siang / halo.'), ln('こんばんは。', 'konbanwa', 'Selamat malam (saat bertemu).'), ln('おやすみなさい。', 'oyasuminasai', 'Selamat tidur.'), ln('ありがとうございます。', 'arigatou gozaimasu', 'Terima kasih (sopan).'), ln('どういたしまして。', 'dou itashimashite', 'Sama-sama.')],
    qa: [{ q: 'Seseorang berkata "ありがとうございます". Balasanmu?', a: 'どういたしまして。', wrong: ['おやすみなさい。', 'はじめまして。', 'いただきます。'] }, { q: 'Kamu bertemu temanmu di pagi hari.', a: 'おはようございます。', wrong: ['こんばんは。', 'おやすみなさい。', 'さようなら。'] }, { q: 'Kamu akan tidur dan berpamitan kepada keluarga.', a: 'おやすみなさい。', wrong: ['おはようございます。', 'こんにちは。', 'はじめまして。'] }],
    order: [{ tokens: ['ありがとう', 'ございます'], id: 'Terima kasih.' }, { tokens: ['どう', 'いたしまして'], id: 'Sama-sama.' }] },
  { title: 'Berbelanja', intro: 'Menanyakan harga dan meminta barang.',
    lines: [ln('これは いくらですか。', 'kore wa ikura desu ka', 'Ini harganya berapa?'), ln('ひゃくえんです。', 'hyaku en desu', 'Seratus yen.'), ln('これを ください。', 'kore o kudasai', 'Tolong beri saya ini.'), ln('ありがとうございました。', 'arigatou gozaimashita', 'Terima kasih (sudah selesai).')],
    qa: [{ q: 'Kamu ingin tahu harga sebuah barang.', a: 'これは いくらですか。', wrong: ['これは なんですか。', 'トイレは どこですか。', 'わかりました。'] }, { q: 'Kamu memutuskan membeli barang itu.', a: 'これを ください。', wrong: ['これは いくらですか。', 'おやすみなさい。', 'はじめまして。'] }, { q: 'Penjual berkata "ひゃくえんです". Artinya?', a: 'Seratus yen.', wrong: ['Sepuluh yen.', 'Seribu yen.', 'Lima yen.'] }],
    order: [{ tokens: ['これ', 'を', 'ください'], id: 'Tolong beri saya ini.' }, { tokens: ['これ', 'は', 'いくら', 'ですか'], id: 'Ini harganya berapa?' }] },
  { title: 'Di kelas', intro: 'Kalimat yang berguna saat belajar.',
    lines: [ln('しつもんが あります。', 'shitsumon ga arimasu', 'Saya punya pertanyaan.'), ln('もういちど おねがいします。', 'mou ichido onegaishimasu', 'Tolong sekali lagi.'), ln('わかりません。', 'wakarimasen', 'Saya tidak mengerti.'), ln('わかりました。', 'wakarimashita', 'Saya mengerti.')],
    qa: [{ q: 'Kamu tidak mendengar penjelasan guru dengan jelas.', a: 'もういちど おねがいします。', wrong: ['わかりました。', 'いただきます。', 'さようなら。'] }, { q: 'Kamu sudah paham penjelasan guru.', a: 'わかりました。', wrong: ['わかりません。', 'しつもんが あります。', 'おやすみなさい。'] }, { q: 'Kamu ingin bertanya kepada guru.', a: 'しつもんが あります。', wrong: ['わかりました。', 'どういたしまして。', 'いくらですか。'] }],
    order: [{ tokens: ['もう', 'いちど', 'おねがいします'], id: 'Tolong sekali lagi.' }, { tokens: ['しつもん', 'が', 'あります'], id: 'Saya punya pertanyaan.' }] },
  { title: 'Bertanya tempat', intro: 'Menanyakan lokasi dan memahami petunjuk arah.',
    lines: [ln('トイレは どこですか。', 'toire wa doko desu ka', 'Toilet di mana?'), ln('あそこです。', 'asoko desu', 'Di sana.'), ln('まっすぐ いってください。', 'massugu itte kudasai', 'Silakan lurus.'), ln('みぎ / ひだり', 'migi / hidari', 'kanan / kiri')],
    qa: [{ q: 'Kamu mencari toilet.', a: 'トイレは どこですか。', wrong: ['トイレは いくらですか。', 'トイレを ください。', 'トイレは わかりません。'] }, { q: 'Petunjuk "まっすぐ いってください" artinya...', a: 'Silakan lurus.', wrong: ['Silakan berbelok kanan.', 'Silakan duduk.', 'Silakan berhenti.'] }, { q: 'みぎ artinya...', a: 'kanan', wrong: ['kiri', 'atas', 'bawah'] }],
    order: [{ tokens: ['トイレ', 'は', 'どこ', 'ですか'], id: 'Toilet di mana?' }, { tokens: ['あそこ', 'です'], id: 'Di sana.' }] },
];
function talkLessons() {
  return TALK_PLAN.map((p, i) => ({ n: i + 1, title: p.title, intro: p.intro, lines: p.lines, qa: p.qa, order: p.order, cards: p.lines.map((l) => ({ big: l.jp, small: l.romaji, text: l.id })), examples: p.lines.slice(0, 3).map((l) => [l.jp, l.romaji, l.id]) }));
}

// ---------- Membaca ----------
const READ_PLAN = [
  { title: 'Perkenalan Sakura', intro: 'Bacaan pendek. Baca pelan-pelan dulu, lihat romaji bila perlu.', jp: 'わたしは さくらです。がくせいです。にほんごが すきです。', romaji: 'Watashi wa Sakura desu. Gakusei desu. Nihongo ga suki desu.', id: 'Saya Sakura. Saya siswa. Saya suka bahasa Jepang.',
    qs: [{ q: 'Siapa Sakura?', a: 'Seorang siswa', wrong: ['Seorang guru', 'Seorang dokter', 'Seorang penjual'] }, { q: 'Apa yang disukai Sakura?', a: 'Bahasa Jepang', wrong: ['Matematika', 'Olahraga', 'Musik'] }] },
  { title: 'Hari Minggu', intro: 'Cerita tentang kegiatan di hari Minggu.', jp: 'きょうは にちようびです。あさ ごはんを たべました。ひるに ともだちと こうえんへ いきました。', romaji: 'Kyou wa nichiyoubi desu. Asa gohan o tabemashita. Hiru ni tomodachi to kouen e ikimashita.', id: 'Hari ini hari Minggu. Pagi hari saya makan. Siang hari saya pergi ke taman bersama teman.',
    qs: [{ q: 'Hari apa dalam cerita ini?', a: 'Minggu', wrong: ['Senin', 'Rabu', 'Jumat'] }, { q: 'Ke mana tokoh pergi pada siang hari?', a: 'Ke taman', wrong: ['Ke sekolah', 'Ke toko', 'Ke stasiun'] }] },
  { title: 'Rumah dan sekolah', intro: 'Tentang perjalanan ke sekolah.', jp: 'わたしの いえは がっこうの ちかくです。まいあさ あるいて がっこうへ いきます。', romaji: 'Watashi no ie wa gakkou no chikaku desu. Maiasa aruite gakkou e ikimasu.', id: 'Rumah saya dekat sekolah. Setiap pagi saya berjalan kaki ke sekolah.',
    qs: [{ q: 'Di mana rumah tokoh?', a: 'Dekat sekolah', wrong: ['Jauh dari sekolah', 'Di dalam sekolah', 'Di dekat stasiun'] }, { q: 'Bagaimana tokoh pergi ke sekolah?', a: 'Berjalan kaki', wrong: ['Naik bus', 'Naik sepeda', 'Naik mobil'] }] },
  { title: 'Kucing Mike', intro: 'Mendeskripsikan hewan peliharaan.', jp: 'これは わたしの ねこです。なまえは ミケです。ミケは しろくて かわいいです。', romaji: 'Kore wa watashi no neko desu. Namae wa Mike desu. Mike wa shirokute kawaii desu.', id: 'Ini kucing saya. Namanya Mike. Mike putih dan lucu.',
    qs: [{ q: 'Siapa nama kucingnya?', a: 'Mike', wrong: ['Sakura', 'Tanaka', 'Neko'] }, { q: 'Apa warna kucingnya?', a: 'Putih', wrong: ['Hitam', 'Merah', 'Biru'] }] },
  { title: 'Musim panas di Jepang', intro: 'Bacaan terakhir. Cobalah membaca tanpa melihat romaji.', jp: 'にほんの なつは あついです。わたしは かきごおりが すきです。つめたくて おいしいです。', romaji: 'Nihon no natsu wa atsui desu. Watashi wa kakigoori ga suki desu. Tsumetakute oishii desu.', id: 'Musim panas di Jepang panas. Saya suka es serut. Dingin dan enak.',
    qs: [{ q: 'Bagaimana musim panas di Jepang?', a: 'Panas', wrong: ['Dingin', 'Bersalju', 'Berangin'] }, { q: 'Apa kata untuk rasa es serut dalam cerita?', a: 'Dingin dan enak', wrong: ['Panas dan pedas', 'Manis dan hangat', 'Asam dan keras'] }] },
];
function readLessons() {
  return READ_PLAN.map((p, i) => ({ n: i + 1, title: p.title, intro: p.intro, passage: { jp: p.jp, romaji: p.romaji, id: p.id }, qs: p.qs, cards: [{ big: p.jp, small: p.romaji, text: p.id }], examples: [[p.jp.split('。')[0] + '。', p.romaji.split('. ')[0] + '.', p.id.split('. ')[0] + '.']] }));
}

export const CATEGORIES = [
  { id: 'hiragana', name: 'Hiragana', jp: 'ひらがな', blurb: 'Huruf dasar bahasa Jepang', kind: 'kana', lessons: kanaLessons('hira') },
  { id: 'katakana', name: 'Katakana', jp: 'カタカナ', blurb: 'Huruf untuk kata serapan', kind: 'kana', lessons: kanaLessons('kata') },
  { id: 'kanji', name: 'Kanji', jp: '漢字', blurb: 'Kanji pertama yang wajib kamu kenal', kind: 'kanji', lessons: kanjiLessons() },
  { id: 'kosakata', name: 'Kosakata', jp: '単語', blurb: 'Kata-kata sehari-hari per tema', kind: 'vocab', lessons: vocabLessons() },
  { id: 'bunpou', name: 'Bunpou', jp: '文法', blurb: 'Tata bahasa langkah demi langkah', kind: 'grammar', lessons: bunpouLessons() },
  { id: 'percakapan', name: 'Percakapan', jp: '会話', blurb: 'Kalimat siap pakai sehari-hari', kind: 'talk', lessons: talkLessons() },
  { id: 'membaca', name: 'Membaca', jp: '読解', blurb: 'Baca kalimat dan pahami ceritanya', kind: 'read', lessons: readLessons() },
];

export const CAT_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
export const LESSON_COUNTS = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.lessons.length]));
export const TOTAL_LESSONS = CATEGORIES.reduce((a, c) => a + c.lessons.length, 0);

/** Semua kosakata (untuk "Kosakata hari ini"). */
export const ALL_WORDS = CATEGORIES.find((c) => c.id === 'kosakata').lessons.flatMap((l) => l.words).filter((x) => x.jp.length > 1);
export function wordOfTheDay(dateStr) {
  let h = 0;
  for (const ch of dateStr) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return ALL_WORDS[h % ALL_WORDS.length];
}
