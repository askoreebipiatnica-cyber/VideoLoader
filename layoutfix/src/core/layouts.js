/**
 * Таблицы раскладок: физическая клавиша (event.code) -> символы для каждой
 * поддерживаемой раскладки. 12 раскладок: en, ru, ukr, by, de, fr, es, it, pl, tr, he, ar.
 *
 * Формат записи: "метка|нижний|верхний" через пробел. Метка — нормализованный
 * event.code: KeyQ -> q, Digit1 -> 1, спецклавиши полным именем (Minus, Quote...).
 * ВАЖНО: каждый сегмент-строка заканчивается пробелом, чтобы при конкатенации
 * токены не слипались.
 */
(function (root) {
  'use strict';
  const LF = root.LayoutFix;
  if (LF.Layouts) return LF.Layouts;

  const SPECIAL = ['Minus', 'Equal', 'BracketLeft', 'BracketRight', 'Semicolon', 'Quote', 'Comma', 'Period', 'Slash', 'Backslash', 'Backquote'];

  // prettier-ignore
  const LAYOUTS = {
    en: {
      name: 'English (QWERTY)',
      base: 'Latin',
      rows:
        'q|q|Q w|w|W e|e|E r|r|R t|t|T y|y|Y u|u|U i|i|I o|o|O p|p|P ' +
        'a|a|A s|s|S d|d|D f|f|F g|g|G h|h|H j|j|J k|k|K l|l|L ' +
        'z|z|Z x|x|X c|c|C v|v|V b|b|B n|n|N m|m|M ' +
        'Backquote|`|~ Minus|-|_ Equal|=|+ BracketLeft|[|{ BracketRight|]|} ' +
        'Semicolon|;|: Quote|\'|" Comma|,|< Period|.|> Slash|/|? Backslash|\\|| ' +
        '1|1|! 2|2|@ 3|3|# 4|4|$ 5|5|% 6|6|^ 7|7|& 8|8|* 9|9|( 0|0|) '
    },
    ru: {
      name: 'Русская (ЙЦУКЕН)',
      base: 'Cyrillic',
      rows:
        'q|й|Й w|ц|Ц e|у|У r|к|К t|е|Е y|н|Н u|г|Г i|ш|Ш o|щ|Щ p|з|З ' +
        'a|ф|Ф s|ы|Ы d|в|В f|а|А g|п|П h|р|Р j|о|О k|л|Л l|д|Д ' +
        'z|я|Я x|ч|Ч c|с|С v|м|М b|и|И n|т|Т m|ь|Ь ' +
        'Backquote|ё|Ё Minus|-|_ Equal|=|+ BracketLeft|х|Х BracketRight|ъ|Ъ ' +
        'Semicolon|ж|Ж Quote|э|Э Comma|б|Б Period|ю|Ю Slash|.|, ' +
        '1|1|! 2|2|" 3|3|№ 4|4|; 5|5|% 6|6|: 7|7|? 8|8|* 9|9|( 0|0|) '
    },
    ukr: {
      name: 'Українська (ЙЦУКЕН)',
      base: 'Cyrillic',
      rows:
        'q|й|Й w|ц|Ц e|у|У r|к|К t|е|Е y|н|Н u|г|Г i|ш|Ш o|щ|Щ p|з|З ' +
        'a|ф|Ф s|і|І d|в|В f|а|А g|п|П h|р|Р j|о|О k|л|Л l|д|Д ' +
        'z|я|Я x|ч|Ч c|с|С v|м|М b|и|И n|т|Т m|ь|Ь ' +
        'Backquote|ґ|Ґ Minus|-|_ Equal|=|+ BracketLeft|х|Х ' +
        'Semicolon|ж|Ж Quote|ї|Ї Comma|б|Б Period|ю|Ю Slash|.|, ' +
        '1|1|! 2|2|" 3|3|№ 4|4|; 5|5|% 6|6|: 7|7|? 8|8|* 9|9|( 0|0|) '
    },
    by: {
      name: 'Беларуская (ЙЦУКЕН)',
      base: 'Cyrillic',
      rows:
        'q|й|Й w|ц|Ц e|у|У r|к|К t|е|Е y|н|Н u|г|Г i|ш|Ш o|щ|Щ p|з|З ' +
        'a|ф|Ф s|ы|Ы d|в|В f|а|А g|п|П h|р|Р j|о|О k|л|Л l|д|Д ' +
        'z|я|Я x|ч|Ч c|с|С v|м|М b|і|І n|т|Т m|ь|Ь ' +
        'Backquote|ё|Ё Minus|-|_ Equal|ў|Ў BracketLeft|х|Х BracketRight|ъ|Ъ ' +
        'Semicolon|ж|Ж Quote|э|Э Comma|б|Б Period|ю|Ю Slash|.|, Backslash|\\|/ ' +
        '1|1|! 2|2|" 3|3|№ 4|4|; 5|5|% 6|6|: 7|7|? 8|8|* 9|9|( 0|0|) '
    },
    de: {
      name: 'Deutsch (QWERTZ)',
      base: 'Latin',
      rows:
        'q|q|Q w|w|W e|e|E r|r|R t|t|T z|y|Y u|u|U i|i|I o|o|O p|p|P ' +
        'a|a|A s|s|S d|d|D f|f|F g|g|G h|h|H j|j|J k|k|K l|l|L ' +
        'y|z|Z x|x|X c|c|C v|v|V b|b|B n|n|N m|m|M ' +
        'Minus|ß|? Equal|´|` BracketLeft|ü|Ü BracketRight|+|* ' +
        'Semicolon|ö|Ö Quote|ä|Ä Backslash|#|\' Comma|,|; Period|.|: Slash|-|_ ' +
        'Backquote|^|° 1|1|! 2|2|" 3|3|§ 4|4|$ 5|5|% 6|6|& 7|7|/ 8|8|( 9|9|) 0|0|= '
    },
    fr: {
      name: 'Français (AZERTY)',
      base: 'Latin',
      rows:
        'q|a|A w|z|Z e|e|E r|r|R t|t|T y|y|Y u|u|U i|i|I o|o|O p|p|P ' +
        'a|q|Q s|s|S d|d|D f|f|F g|g|G h|h|H j|j|J k|k|K l|l|L ' +
        'z|w|W x|x|X c|c|C v|v|V b|b|B n|n|N m|,|? ' +
        'Minus|)|° Equal|=|+ BracketLeft|^|¨ BracketRight|$|£ ' +
        'Semicolon|m|M Quote|ù|% Backslash|*|µ Comma|;|. Period|:|/ Slash|!|§ ' +
        'Backquote|²|² 1|&|1 2|é|2 3|"|3 4|\'|4 5|(|5 6|-|6 7|è|7 8|_|8 9|ç|9 0|à|0 '
    },
    es: {
      name: 'Español (QWERTY)',
      base: 'Latin',
      rows:
        'q|q|Q w|w|W e|e|E r|r|R t|t|T y|y|Y u|u|U i|i|I o|o|O p|p|P ' +
        'a|a|A s|s|S d|d|D f|f|F g|g|G h|h|H j|j|J k|k|K l|l|L ' +
        'z|z|Z x|x|X c|c|C v|v|V b|b|B n|n|N m|m|M ' +
        'Minus|\'|? Equal|¡|¿ BracketLeft|`|^ BracketRight|+|* ' +
        'Semicolon|ñ|Ñ Quote|´|¨ Backslash|ç|Ç Comma|,|; Period|.|: Slash|-|_ ' +
        '1|1|! 2|2|" 3|3|· 4|4|$ 5|5|% 6|6|& 7|7|/ 8|8|( 9|9|) 0|0|= '
    },
    it: {
      name: 'Italiano (QWERTY)',
      base: 'Latin',
      rows:
        'q|q|Q w|w|W e|e|E r|r|R t|t|T y|y|Y u|u|U i|i|I o|o|O p|p|P ' +
        'a|a|A s|s|S d|d|D f|f|F g|g|G h|h|H j|j|J k|k|K l|l|L ' +
        'z|z|Z x|x|X c|c|C v|v|V b|b|B n|n|N m|m|M ' +
        'Minus|\'|? Equal|ì|^ BracketLeft|è|é BracketRight|+|* ' +
        'Semicolon|ò|ç Quote|à|° Backslash|ù|§ Comma|,|; Period|.|: Slash|-|_ ' +
        '1|1|! 2|2|" 3|3|£ 4|4|$ 5|5|% 6|6|& 7|7|/ 8|8|( 9|9|) 0|0|= '
    },
    pl: {
      name: 'Polski (programmerski)',
      base: 'Latin',
      rows:
        'q|q|Q w|w|W e|e|E r|r|R t|t|T y|y|Y u|u|U i|i|I o|o|O p|p|P ' +
        'a|a|A s|s|S d|d|D f|f|F g|g|G h|h|H j|j|J k|k|K l|l|L ' +
        'z|z|Z x|x|X c|c|C v|v|V b|b|B n|n|N m|m|M ' +
        'Minus|-|_ Equal|=|+ BracketLeft|[|{ BracketRight|]|} ' +
        'Semicolon|;|: Quote|\'|" Comma|,|< Period|.|> Slash|/|? Backslash|\\|| ' +
        '1|1|! 2|2|@ 3|3|# 4|4|$ 5|5|% 6|6|^ 7|7|& 8|8|* 9|9|( 0|0|) '
    },
    tr: {
      name: 'Türkçe (Q)',
      base: 'Latin',
      rows:
        'q|q|Q w|w|W e|e|E r|r|R t|t|T y|y|Y u|u|U i|i|İ o|o|O p|p|P ' +
        'a|a|A s|s|S d|d|D f|f|F g|g|G h|h|H j|j|J k|k|K l|l|L ' +
        'z|z|Z x|x|X c|c|C v|v|V b|b|B n|n|N m|m|M ' +
        'Minus|*|? Equal|-|_ BracketLeft|ğ|Ğ BracketRight|ü|Ü ' +
        'Semicolon|ş|Ş Quote|ı|İ Backslash|,|; Comma|ö|Ö Period|ç|Ç Slash|.|: ' +
        'Backquote|"|é 1|1|! 2|2|\' 3|3|^ 4|4|+ 5|5|% 6|6|& 7|7|/ 8|8|( 9|9|) 0|0|= '
    },
    he: {
      name: 'עברית',
      base: 'Hebrew',
      rows:
        'q|/|/ w|\'|\' e|ק|ק r|ר|ר t|א|א y|ט|ט u|ו|ו i|ן|ן o|ם|ם p|פ|פ ' +
        'a|ש|ש s|ד|ד d|ג|ג f|כ|כ g|ע|ע h|י|י j|ח|ח k|ל|ל l|ך|ך ' +
        'z|ז|ז x|ס|ס c|ב|ב v|ה|ה b|נ|נ n|מ|מ m|צ|צ ' +
        'Backquote|;|; Minus|-|- Equal|=|= BracketLeft|]|} BracketRight|[|{ ' +
        'Semicolon|ף|ף Quote|,|" Comma|ת|ת Period|ץ|ץ Slash|.|. ' +
        '1|1|! 2|2|@ 3|3|# 4|4|$ 5|5|% 6|6|^ 7|7|& 8|8|* 9|9|( 0|0|) '
    },
    ar: {
      name: 'العربية (101)',
      base: 'Arabic',
      rows:
        'q|ض|ض w|ص|ص e|ث|ث r|ق|ق t|ف|ف y|غ|غ u|ع|ع i|ه|ه o|خ|خ p|ح|ح ' +
        'a|ش|ش s|س|س d|ي|ي f|ب|ب g|ل|ل h|ا|ا j|ت|ت k|ن|ن l|م|م ' +
        'z|ئ|ئ x|ء|ء c|ؤ|ؤ v|ر|ر b|لا|لا n|ى|ى m|ة|ة ' +
        'Minus|-|- Equal|=|= BracketLeft|ج|ج BracketRight|د|د ' +
        'Semicolon|ك|ك Quote|ط|ط Comma|و|و Period|ز|ز Slash|ظ|ظ ' +
        '1|١|1 2|٢|2 3|٣|3 4|٤|4 5|٥|5 6|٦|6 7|٧|7 8|٨|8 9|٩|9 0|٠|0 '
    }
  };

  const parsed = new Map();
  for (const id of Object.keys(LAYOUTS)) parsed.set(id, parse(LAYOUTS[id].rows));

  /** Парсит строку "code|lower|upper ..." в Map: метка -> {lower, upper}. */
  function parse(rows) {
    const map = new Map();
    for (const token of rows.trim().split(/\s+/)) {
      const parts = token.split('|');
      if (parts.length !== 3) continue;
      map.set(parts[0], { lower: parts[1], upper: parts[2] });
    }
    return map;
  }

  /** Нормализует event.code в метку: KeyQ -> q, Digit1 -> 1, спецклавиши как есть. */
  function codeToKey(code) {
    if (!code) return null;
    if (SPECIAL.includes(code)) return code;
    const m = /^(?:Key([A-Z])|Digit(\d))$/.exec(code);
    if (m) return (m[1] || m[2]).toLowerCase();
    return null;
  }

  /** Возвращает {lower, upper} клавиши в раскладке либо null. */
  function key(layoutId, code) {
    const layout = parsed.get(layoutId);
    if (!layout) return null;
    const k = codeToKey(code);
    return k ? layout.get(k) || null : null;
  }

  /** Все символы раскладки (оба регистра). */
  function chars(layoutId) {
    const layout = parsed.get(layoutId);
    if (!layout) return [];
    const out = [];
    for (const v of layout.values()) {
      out.push(v.lower);
      if (v.upper !== v.lower) out.push(v.upper);
    }
    return out;
  }

  /** id раскладок с данным базовым алфавитом (Latin / Cyrillic / Hebrew / Arabic). */
  function byBase(base) {
    return Object.keys(LAYOUTS).filter((id) => LAYOUTS[id].base === base);
  }

  function ids() {
    return Object.keys(LAYOUTS);
  }

  function meta(layoutId) {
    return LAYOUTS[layoutId]
      ? { id: layoutId, name: LAYOUTS[layoutId].name, base: LAYOUTS[layoutId].base }
      : null;
  }

  return LF.defineModule('Layouts', { ids, meta, key, chars, byBase, codeToKey, _raw: LAYOUTS, _parsed: parsed });
})(typeof self !== 'undefined' ? self : globalThis);
