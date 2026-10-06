/**
 * נושאי הכלים של כל חלק בשולחן ערוך — הספרים שקטע פירוש יכול להפנות אליהם בשמם ("ש"ך ד"ה…",
 * "במג"א…") במקום אל לשון השו"ע. `title` הוא שם הספר בספרייה, ו-`keywords` הן צורות הציטוט
 * שבראש השורה (מילה שלמה; ראו startsWithSourceKeyword).
 */
export interface HalachaCommentator {
  id: string;
  label: string;
  title: string;
  keywords: string[];
}

const withPrefix = (...forms: string[]) => forms.flatMap(f => [f, `ב${f}`]);

const taz = (part: string): HalachaCommentator => ({
  id: 'taz', label: 'ט"ז', title: `טורי זהב על שולחן ערוך ${part}`, keywords: withPrefix('ט"ז', 'טורי זהב')
});
const baerHeitev = (title: string): HalachaCommentator => ({
  id: 'baer_heitev', label: 'באר היטב', title, keywords: withPrefix('באה"ט', 'באר היטב')
});
const pitcheiTeshuva = (part: string): HalachaCommentator => ({
  id: 'pitchei_teshuva', label: 'פתחי תשובה', title: `פתחי תשובה על שולחן ערוך ${part}`,
  keywords: withPrefix('פ"ת', 'פתח"ת', 'פתחי תשובה')
});
const shach = (part: string): HalachaCommentator => ({
  id: 'shach', label: 'ש"ך', title: `שפתי כהן על שולחן ערוך ${part}`, keywords: withPrefix('ש"ך', 'שפתי כהן')
});

/** חלק השו"ע (כמו ב-HALACHA_BOOKS) -> נושאי הכלים שלו */
export const HALACHA_COMMENTATORS: Record<string, HalachaCommentator[]> = {
  'שולחן ערוך, אורח חיים': [
    { id: 'magen_avraham', label: 'מגן אברהם', title: 'מגן אברהם', keywords: withPrefix('מג"א', 'מגן אברהם') },
    taz('אורח חיים'),
    baerHeitev('באר היטב אורח חיים'),
    // בלי השם המלא: "משנה" שבראש השורה נחתכת כמילת הקשר (SOURCE_CONTEXT_STRIP_RE)
    { id: 'mishna_berura', label: 'משנה ברורה', title: 'משנה ברורה', keywords: withPrefix('מ"ב', 'משנ"ב') },
    { id: 'biur_halacha', label: 'ביאור הלכה', title: 'ביאור הלכה', keywords: withPrefix('בה"ל', 'ביאור הלכה') }
  ],
  'שולחן ערוך, יורה דעה': [
    shach('יורה דעה'),
    taz('יורה דעה'),
    baerHeitev('באר היטב יורה דעה'),
    pitcheiTeshuva('יורה דעה')
  ],
  'שולחן ערוך, אבן העזר': [
    { id: 'chelkat_mechokek', label: 'חלקת מחוקק', title: 'חלקת מחוקק', keywords: withPrefix('ח"מ', 'חלקת מחוקק') },
    { id: 'beit_shmuel', label: 'בית שמואל', title: 'בית שמואל', keywords: withPrefix('ב"ש', 'בית שמואל') },
    taz('אבן העזר'),
    baerHeitev('באר היטב אבן העזר'),
    pitcheiTeshuva('אבן העזר')
  ],
  'שולחן ערוך, חושן משפט': [
    {
      id: 'sma', label: 'סמ"ע', title: 'מאירת עיניים על שולחן ערוך חושן משפט',
      keywords: withPrefix('סמ"ע', 'מאירת עינים', 'מאירת עיניים')
    },
    shach('חושן משפט'),
    taz('חושן משפט'),
    // כך בספרייה: "חשן" בלי וי"ו
    baerHeitev('באר היטב חשן משפט'),
    pitcheiTeshuva('חושן משפט'),
    { id: 'ketzot', label: 'קצות החושן', title: 'קצות החושן על שולחן ערוך חושן משפט', keywords: withPrefix('קצה"ח', 'קצות החושן') }
  ]
};
