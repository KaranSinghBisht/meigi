"""Name pools for fictional entities, split three ways. `train`, `val` and `test` never share a company stem, person,
bank, branch, overseas bank or beneficiary, x402 merchant or address, so a test item cannot be answered by remembering
a training entity (val borrows the train item catalog, nothing else). Names are invented combinations; build.py also
checks them against the NTA Tokyo corporate registry when that file is available."""

# (kanji/kana form, katakana reading, romaji)
COMPANY_STEMS = {
    "train": [("ハルカゼ", "ハルカゼ", "harukaze"), ("東雲", "シノノメ", "shinonome"), ("若葉台", "ワカバダイ", "wakabadai"),
              ("白鷺", "シラサギ", "shirasagi"), ("瑞穂野", "ミズホノ", "mizuhono"), ("青嵐", "セイラン", "seiran"),
              ("朝凪", "アサナギ", "asanagi"), ("翠嶺", "スイレイ", "suirei"), ("千歳野", "チトセノ", "chitoseno"),
              ("ヒダマリ", "ヒダマリ", "hidamari"), ("つばくろ", "ツバクロ", "tsubakuro"), ("ミナモ", "ミナモ", "minamo"),
              ("星見台", "ホシミダイ", "hoshimidai"), ("葵坂", "アオイザカ", "aoizaka"), ("柚木", "ユノキ", "yunoki"),
              ("鳴海野", "ナルミノ", "narumino"), ("秋津", "アキツ", "akitsu"), ("藤ヶ丘", "フジガオカ", "fujigaoka"),
              ("桐生野", "キリュウノ", "kiryuno"), ("雲雀", "ヒバリ", "hibari"), ("緑陽", "リョクヨウ", "ryokuyo"),
              ("紫苑", "シオン", "shion"), ("琥珀", "コハク", "kohaku"), ("暁", "アカツキ", "akatsuki"),
              ("蒼海", "ソウカイ", "sokai"), ("早瀬", "ハヤセ", "hayase"), ("篝", "カガリ", "kagari"),
              ("椿山", "ツバキヤマ", "tsubakiyama"), ("銀杏坂", "イチョウザカ", "ichozaka"), ("萌黄", "モエギ", "moegi")],
    "val": [("凪野", "ナギノ", "nagino"), ("小春", "コハル", "koharu"), ("月見野", "ツキミノ", "tsukimino"),
            ("霞ヶ丘", "カスミガオカ", "kasumigaoka"), ("汐見", "シオミ", "shiomi"), ("楓", "カエデ", "kaede"),
            ("真砂", "マサゴ", "masago"), ("燕", "ツバメ", "tsubame"), ("白樺", "シラカバ", "shirakaba"), ("茜", "アカネ", "akane")],
    "test": [("風待", "カザマチ", "kazamachi"), ("浅葱", "アサギ", "asagi"), ("夕凪", "ユウナギ", "yunagi"),
             ("久遠", "クオン", "kuon"), ("天音", "アマネ", "amane"), ("雪割", "ユキワリ", "yukiwari"),
             ("稲穂野", "イナホノ", "inahono"), ("柊", "ヒイラギ", "hiiragi"), ("綾瀬野", "アヤセノ", "ayaseno"),
             ("朧", "オボロ", "oboro"), ("岬", "ミサキ", "misaki"), ("玻璃", "ハリ", "hari"),
             ("常盤台", "トキワダイ", "tokiwadai"), ("菫", "スミレ", "sumire"), ("羅針", "ラシン", "rashin")],
}

# (suffix, katakana reading, romaji, English), shared: company names are unique as wholes because stems are split
INDUSTRIES = [("精機", "セイキ", "seiki", "Precision"), ("商事", "ショウジ", "shoji", "Trading"),
              ("ロジスティクス", "ロジスティクス", "logistics", "Logistics"), ("設計", "セッケイ", "sekkei", "Design"),
              ("フーズ", "フーズ", "foods", "Foods"), ("印刷", "インサツ", "insatsu", "Printing"),
              ("電機", "デンキ", "denki", "Electric"), ("化成", "カセイ", "kasei", "Chemical"),
              ("システムズ", "システムズ", "systems", "Systems"), ("物産", "ブッサン", "bussan", "Bussan"),
              ("工業", "コウギョウ", "kogyo", "Industries"), ("建材", "ケンザイ", "kenzai", "Building Materials"),
              ("メディカル", "メディカル", "medical", "Medical"), ("運輸", "ウンユ", "unyu", "Transport")]

# (surname kanji, kana, romaji)
SURNAMES = {
    "train": [("田中", "タナカ", "Tanaka"), ("佐藤", "サトウ", "Sato"), ("鈴木", "スズキ", "Suzuki"), ("高橋", "タカハシ", "Takahashi"),
              ("伊藤", "イトウ", "Ito"), ("渡辺", "ワタナベ", "Watanabe"), ("中村", "ナカムラ", "Nakamura"), ("小林", "コバヤシ", "Kobayashi"),
              ("加藤", "カトウ", "Kato"), ("吉田", "ヨシダ", "Yoshida"), ("山口", "ヤマグチ", "Yamaguchi"), ("松本", "マツモト", "Matsumoto")],
    "val": [("井上", "イノウエ", "Inoue"), ("木村", "キムラ", "Kimura"), ("林", "ハヤシ", "Hayashi"), ("清水", "シミズ", "Shimizu"),
            ("山崎", "ヤマザキ", "Yamazaki")],
    "test": [("森", "モリ", "Mori"), ("池田", "イケダ", "Ikeda"), ("橋本", "ハシモト", "Hashimoto"), ("阿部", "アベ", "Abe"),
             ("石川", "イシカワ", "Ishikawa"), ("前田", "マエダ", "Maeda"), ("藤田", "フジタ", "Fujita"), ("岡田", "オカダ", "Okada")],
}
GIVEN_NAMES = {
    "train": [("花子", "ハナコ", "Hanako"), ("太郎", "タロウ", "Taro"), ("健一", "ケンイチ", "Kenichi"), ("美咲", "ミサキ", "Misaki"),
              ("翔太", "ショウタ", "Shota"), ("由美", "ユミ", "Yumi"), ("大輔", "ダイスケ", "Daisuke"), ("恵", "メグミ", "Megumi")],
    "val": [("直樹", "ナオキ", "Naoki"), ("真理", "マリ", "Mari"), ("拓也", "タクヤ", "Takuya")],
    "test": [("陽菜", "ヒナ", "Hina"), ("蓮", "レン", "Ren"), ("彩", "アヤ", "Aya"), ("誠", "マコト", "Makoto"), ("千尋", "チヒロ", "Chihiro")],
}

# fictional domestic banks (name, katakana), and branches
BANKS = {
    "train": [("みなと中央銀行", "ミナトチユウオウ", "Minato Chuo Bank"), ("東和みらい銀行", "トウワミライ", "Towa Mirai Bank"),
              ("青葉ネット銀行", "アオバネツト", "Aoba Net Bank"), ("北辰信用金庫", "ホクシンシンキン", "Hokushin Shinkin Bank"),
              ("さざなみ銀行", "サザナミ", "Sazanami Bank"), ("若草信用組合", "ワカクサシンクミ", "Wakakusa Credit Cooperative")],
    "val": [("汐風銀行", "シオカゼ", "Shiokaze Bank"), ("瑞雲銀行", "ズイウン", "Zuiun Bank"),
            ("朝霧信用金庫", "アサギリシンキン", "Asagiri Shinkin Bank")],
    "test": [("大和桜銀行", "ヤマトザクラ", "Yamato Sakura Bank"), ("琴浦銀行", "コトウラ", "Kotoura Bank"),
             ("春日野信用金庫", "カスガノシンキン", "Kasugano Shinkin Bank"), ("ひかり湊銀行", "ヒカリミナト", "Hikari Minato Bank")],
}
BRANCHES = {
    "train": [("本店営業部", "Head Office"), ("渋谷支店", "Shibuya Branch"), ("新宿支店", "Shinjuku Branch"),
              ("丸の内支店", "Marunouchi Branch"), ("横浜支店", "Yokohama Branch"), ("梅田支店", "Umeda Branch"),
              ("名古屋駅前支店", "Nagoya Ekimae Branch"), ("博多支店", "Hakata Branch"), ("池袋支店", "Ikebukuro Branch"),
              ("品川支店", "Shinagawa Branch")],
    "val": [("大宮支店", "Omiya Branch"), ("札幌支店", "Sapporo Branch"), ("目黒支店", "Meguro Branch"), ("中央支店", "Chuo Branch")],
    "test": [("神田支店", "Kanda Branch"), ("上野支店", "Ueno Branch"), ("川崎支店", "Kawasaki Branch"), ("京都支店", "Kyoto Branch"),
             ("仙台支店", "Sendai Branch"), ("天神支店", "Tenjin Branch"), ("本店", "Main Branch")],
}

# fictional overseas banks and beneficiaries used by scammers
OVERSEAS = {
    "train": [("Harbor Crest Bank", "Hong Kong"), ("Banco Litoral", "Lisbon"), ("Pacific Meridian Bank", "Singapore"),
              ("Baltic Amber Bank", "Riga")],
    "val": [("Coral Gate Bank", "Manila"), ("Seabreeze Mutual Bank", "Labuan")],
    "test": [("Golden Strait Bank", "Kuala Lumpur"), ("Northwind Savings", "Limassol"), ("Orchid Bay Bank", "Bangkok")],
}
BENEFICIARIES = {
    "train": ["HC Global Trading Ltd.", "Meridian Asset Partners", "Blue Pier Consulting Ltd.", "Everfield Holdings"],
    "val": ["Silverline Advisory Ltd.", "Tidewater Commerce"],
    "test": ["Lotus Crest Enterprises", "Kestrel Bridge Capital", "Amberline Supply Co."],
}

# x402 merchants: (slug, Japanese service name, English description, typical price in token units)
MERCHANTS = {
    "train": [("tenki-data", "天気データAPI", "Hourly weather forecast, 1 request", 10), ("kabuka-feed", "株価フィード", "Delayed stock quote, 1 symbol", 5),
              ("honyaku-api", "翻訳API", "Machine translation, up to 2,000 characters", 30), ("chizu-tiles", "地図タイル", "Map tiles, 100 tiles", 20),
              ("news-digest", "ニュース要約", "Daily news digest, 1 article", 15), ("ocr-scan", "OCR読取", "OCR of one scanned page", 25)],
    "val": [("kion-stats", "気温統計", "Historical temperature series, 1 station", 12), ("ekimae-search", "駅前検索", "Nearby shop search, 1 query", 8)],
    "test": [("kawase-rate", "為替レートAPI", "Live FX rate, 1 currency pair", 6), ("eki-jikoku", "時刻表API", "Train timetable, 1 station", 9),
             ("koe-tts", "音声合成", "Text-to-speech, 1 minute of audio", 40), ("gazo-gen", "画像生成", "Image generation, 1 image", 50),
             ("hojin-lookup", "法人検索", "Corporate registry lookup, 1 query", 18)],
}

# (Japanese name, English name, unit price range in yen, tax rate %, goods or service)
CATALOG = {
    "train": [("精密ベアリング SB-200", "Precision bearing SB-200", (2000, 6000), 10, "goods"), ("保守点検作業", "Maintenance inspection", (30000, 90000), 10, "service"),
              ("コピー用紙 A4 5000枚", "A4 copy paper, 5,000 sheets", (3000, 5000), 10, "goods"), ("物流倉庫保管料", "Warehouse storage fee", (40000, 150000), 10, "service"),
              ("パンフレット印刷 1000部", "Brochure printing, 1,000 copies", (50000, 120000), 10, "service"), ("配送料", "Delivery charge", (1500, 9000), 10, "service"),
              ("ソフトウェア保守 月額", "Software maintenance, monthly", (20000, 80000), 10, "service"), ("制御基板 CB-17", "Control board CB-17", (8000, 20000), 10, "goods"),
              ("ミネラルウォーター 2L×6本", "Mineral water 2L x 6", (700, 1200), 8, "goods"), ("コーヒー豆 1kg", "Coffee beans 1kg", (2500, 4000), 8, "goods"),
              ("会議用弁当", "Lunch boxes for meetings", (800, 1500), 8, "goods"), ("設計図面作成", "Drawing preparation", (60000, 200000), 10, "service")],
    "test": [("産業用センサー TS-9", "Industrial sensor TS-9", (4000, 12000), 10, "goods"), ("清掃業務委託 月額", "Cleaning services, monthly", (50000, 140000), 10, "service"),
             ("梱包資材一式", "Packing materials set", (8000, 30000), 10, "goods"), ("クラウド利用料", "Cloud usage fee", (15000, 70000), 10, "service"),
             ("緑茶ティーバッグ 100包", "Green tea bags x100", (900, 1600), 8, "goods"), ("研修用サンドイッチ", "Sandwiches for training", (500, 900), 8, "goods"),
             ("計測器校正", "Instrument calibration", (25000, 80000), 10, "service"), ("ラベル印刷 5000枚", "Label printing, 5,000", (12000, 40000), 10, "service")],
}

WARDS = {
    "train": ["東京都港区芝浦", "東京都千代田区神田錦町", "東京都渋谷区桜丘町", "大阪府大阪市北区中之島", "神奈川県横浜市西区みなとみらい",
              "東京都品川区大崎", "愛知県名古屋市中区栄"],
    "val": ["東京都江東区豊洲", "埼玉県さいたま市大宮区桜木町"],
    "test": ["東京都台東区上野", "京都府京都市下京区烏丸通", "福岡県福岡市中央区天神", "宮城県仙台市青葉区一番町"],
}

FREE_MAIL = ["gmail.com", "yahoo.co.jp", "outlook.com", "icloud.com"]
