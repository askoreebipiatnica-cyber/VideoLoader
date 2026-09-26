import { readFileSync } from "node:fs";

await import("../parser.js");
const P = globalThis.VideoLoaderParser;

let pass = 0, fail = 0;
function eq(name, got, want) {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { pass++; console.log("PASS " + name); }
  else { fail++; console.log("FAIL " + name + "\n  got:  " + a + "\n  want: " + b); }
}

// normalizeInput
eq("normalize bare domain", P.normalizeInput("example.com/v.mp4"), "https://example.com/v.mp4");
eq("normalize keeps https", P.normalizeInput("https://x.com/a"), "https://x.com/a");
eq("normalize rejects empty", P.normalizeInput("   "), null);
eq("normalize rejects js", P.normalizeInput("javascript:alert(1)"), null);

// isDirectMedia / isPlaylist
eq("direct mp4", P.isDirectMedia("https://c.com/v.mp4?x=1"), true);
eq("direct webm", P.isDirectMedia("https://c.com/v.WEBM"), true);
eq("not direct page", P.isDirectMedia("https://youtube.com/watch?v=1"), false);
eq("playlist m3u8", P.isPlaylist("https://c.com/a.m3u8", ""), "hls");
eq("playlist by ct", P.isPlaylist("https://c.com/a", "application/x-mpegURL"), "hls");
eq("playlist mpd", P.isPlaylist("https://c.com/a.mpd", ""), "dash");
eq("not playlist", P.isPlaylist("https://c.com/a.mp4", "video/mp4"), null);

// extractFromHtml
const html = `<html><head>
<meta property="og:video:secure_url" content="https://cdn.com/v1.mp4">
<meta name="twitter:player:stream" content="/v2.mp4">
<meta property="og:title" content="nope">
</head></html>`;
eq("og extract", P.extractFromHtml(html, "https://site.com/p"), ["https://cdn.com/v1.mp4", "https://site.com/v2.mp4"]);
eq("og empty", P.extractFromHtml("<html></html>", "https://s.com/"), []);

// extractYouTube
const ytHtml = `<html><script>ytInitialPlayerResponse = {"streamingData":{"formats":[{"mimeType":"video/mp4; codecs=\\"avc1\\"","url":"https://rr.com/v.mp4"},{"mimeType":"video/webm","signatureCipher":"s=abc"}]}};</script></html>`;
eq("yt progressive only", P.extractYouTube(ytHtml), ["https://rr.com/v.mp4"]);
eq("yt none", P.extractYouTube("<html></html>"), []);
// Регрессия: вложенные "};" внутри JSON не должны обрезать парсинг
const ytNested = `<html><script>var x = {"a":"};"};
ytInitialPlayerResponse = {"streamingData":{"formats":[{"mimeType":"video/mp4","url":"https://rr.com/n.mp4"}],"misc":{"note":"a};b"}}};
</script></html>`;
eq("yt nested braces", P.extractYouTube(ytNested), ["https://rr.com/n.mp4"]);
eq("yt truncated json", P.extractYouTube(`<script>ytInitialPlayerResponse = {"streamingData":`), []);

// safeFilename / ext / size
eq("safe strips", P.safeFilename('a/b\\c:d*e"f<g>h_i.mp4', ""), "b_c_d_e_f_g_h_i.mp4");
eq("safe adds ext", P.safeFilename("https://h.com/watch?v=1", ".mp4").endsWith(".mp4"), true);
eq("safe reserved win", P.safeFilename("CON", ".mp4"), "_CON.mp4");
eq("safe reserved com", P.safeFilename("com1.txt", ""), "_com1.txt");
eq("safe empty", P.safeFilename("", ""), "video.mp4");
eq("safe long trunc", P.safeFilename("x".repeat(200) + ".mp4", "").length <= 124, true);
eq("ext webm", P.extByContentType("video/webm"), ".webm");
eq("ext default", P.extByContentType("video/mp4"), ".mp4");
eq("size mb", P.humanSize(1572864), "1.5 МБ");
eq("size empty", P.humanSize(0), "");
eq("size negative", P.humanSize(-5), "");
eq("size nan", P.humanSize("abc"), "");
eq("size kb", P.humanSize(2048), "2 КБ");

// normalize edge
eq("normalize spaces+upper", P.normalizeInput("  HTTPS://X.COM/A  "), "https://x.com/A");
eq("normalize ftp out", P.normalizeInput("ftp://x.com/f"), null);

// og: пропускаем data: и не-http
eq("og skips data", P.extractFromHtml(`<meta property="og:video" content="data:video/mp4;base64,AAA">`, "https://s.com/"), []);

// hasFtypMp4: цельный MP4 vs фрагмент (как скачанный moof-кусок)
eq("ftyp ok", P.hasFtypMp4(new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112])), true);
eq("ftyp moof frag", P.hasFtypMp4(new Uint8Array([0, 0, 0, 16, 109, 111, 111, 102])), false);
eq("ftyp short", P.hasFtypMp4(new Uint8Array([0, 0])), false);
eq("ftyp empty", P.hasFtypMp4(new Uint8Array([])), false);

// checkMp4Head: init-сегмент без mdat отсекается
const INIT = [0, 0, 0, 24, 102, 116, 121, 112, 0, 0, 0, 12, 109, 111, 111, 118];
const FULL = [...INIT.slice(0, 8), 0, 0, 0, 32, 109, 100, 97, 116, 1, 2, 3];
eq("head full+mdat", P.checkMp4Head(new Uint8Array(FULL), 0), true);
eq("head init small", P.checkMp4Head(new Uint8Array(INIT), 818), false);
eq("head big no-mdat", P.checkMp4Head(new Uint8Array(INIT), 5000000), true);
eq("head moof", P.checkMp4Head(new Uint8Array([0, 0, 0, 16, 109, 111, 111, 102]), 19263), false);
eq("head empty", P.checkMp4Head(new Uint8Array([]), 0), false);
eq("ebml ok", P.hasEbmlHead(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1])), true);
eq("ebml no", P.hasEbmlHead(new Uint8Array([0, 0, 0, 0])), false);

// extractInlineVideoUrls: цельный video_url из JSON страницы
const inlineHtml = `<script>{"video_url":"https:\\/\\/scontent-hel3-1.cdninstagram.com\\/v\\/t50.1\\/abc.mp4?x=1","other":1}</script>`
  + `<script>{"videoUrl":"https://fbcdn.net/x.mp4"}</script>`
  + `<script>{"video_url":"data:video/mp4;base64,AAA"}</script>`
  + `<script>{"video_url":"https://scontent-hel3-1.cdninstagram.com/v/t50.1/abc.mp4?x=1"}</script>`;
eq("inline video urls", P.extractInlineVideoUrls(inlineHtml, "https://www.instagram.com/"), [
  "https://scontent-hel3-1.cdninstagram.com/v/t50.1/abc.mp4?x=1",
  "https://fbcdn.net/x.mp4",
]);
eq("inline none", P.extractInlineVideoUrls("<html><p>hi</p></html>", "https://x.com/"), []);
eq("inline junk skipped", P.extractInlineVideoUrls(`{"video_url":"/static/logo.png"}`, "https://x.com/"), []);
eq("inline relative resolved", P.extractInlineVideoUrls(`{"video_url":"/v/clip.mp4"}`, "https://x.com/p/1"), ["https://x.com/v/clip.mp4"]);

// instagram shortcode + embed
eq("ig shortcode reel", P.instagramShortcode("https://www.instagram.com/reel/DdG42sKzOlz/?x=1"), "DdG42sKzOlz");
eq("ig shortcode post", P.instagramShortcode("https://www.instagram.com/p/ABC123_-/"), "ABC123_-");
eq("ig shortcode none", P.instagramShortcode("https://www.youtube.com/watch?v=1"), null);
eq("ig embed", P.embedUrl("https://www.instagram.com/reel/DdG42sKzOlz/"), "https://www.instagram.com/p/DdG42sKzOlz/embed/captioned/");
eq("ig embed none", P.embedUrl("https://example.com/v"), null);

// shortcode -> pk (вектор из тестов yt-dlp: pk 482584233761418119 <-> aye83DjauH)
eq("ig pk vector", P.shortcodeToPk("aye83DjauH"), "482584233761418119");
eq("ig pk bad", P.shortcodeToPk("a b!"), null);
eq("ig pk empty", P.shortcodeToPk(""), null);
eq("ig pk long strips", P.shortcodeToPk("DdG42sKzOlz" + "A".repeat(28)), P.shortcodeToPk("DdG42sKzOlz"));

// LSD token
eq("ig lsd", P.extractLsdToken(`<script>["LSD",[],{"token":"ABC123x"}]</script>`), "ABC123x");
eq("ig lsd none", P.extractLsdToken("<html></html>"), null);

// video_versions из info и polaris
const vvInfo = { items: [{ video_versions: [{ url: "https://cdn.test/a.mp4", width: 720 }, { url: "https://cdn.test/b.mp4" }] }] };
const vvPolaris = { data: { xig_polaris_media: { if_not_gated_logged_out: { video_versions: [{ url: "https://cdn.test/c.mp4" }] } } } };
eq("ig vv info", P.extractVideoVersions(vvInfo), ["https://cdn.test/a.mp4", "https://cdn.test/b.mp4"]);
eq("ig vv polaris", P.extractVideoVersions(vvPolaris), ["https://cdn.test/c.mp4"]);
eq("ig vv none", P.extractVideoVersions({}), []);

// tiktok playAddr
const ttHtml = `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">{"a":{"playAddr":"https:\\/\\/v1-cdn.tiktok.com\\/v.mp4","downloadAddr":"https:\\/\\/v1-cdn.tiktok.com\\/d.mp4"}}</script>`;
eq("tiktok addrs", P.extractTikTok(ttHtml), ["https://v1-cdn.tiktok.com/v.mp4", "https://v1-cdn.tiktok.com/d.mp4"]);
eq("tiktok none", P.extractTikTok("<html></html>"), []);
eq("tiktok broken", P.extractTikTok(`"playAddr":"ht!tp://["`), []);

// pushHistory: журнал последних 7
let h0 = P.pushHistory([], { filename: "a.mp4", downloadId: 1 });
eq("hist one", h0.length, 1);
let h1 = h0;
for (let i = 2; i <= 9; i++) h1 = P.pushHistory(h1, { filename: "f" + i + ".mp4", downloadId: i });
eq("hist cap7", h1.length, 7);
eq("hist newest first", h1[0].downloadId, 9);
eq("hist oldest dropped", h1.some((x) => x.downloadId === 1 || x.downloadId === 2), false);
eq("hist dedupe", P.pushHistory(h1, { filename: "dup", downloadId: 9 }).filter((x) => x.downloadId === 9).length, 1);
eq("hist bad input", P.pushHistory(null, { filename: "a", downloadId: 1 }).length, 1);

// isSafeHttpUrl: allowlist схем
eq("safe http", P.isSafeHttpUrl("http://cdn.test/v.mp4"), true);
eq("safe https", P.isSafeHttpUrl("https://cdn.test/v.mp4?x=1"), true);
eq("safe js no", P.isSafeHttpUrl("javascript:alert(1)"), false);
eq("safe data no", P.isSafeHttpUrl("data:text/html,hi"), false);
eq("safe file no", P.isSafeHttpUrl("file:///C:/v.mp4"), false);
eq("safe blob no", P.isSafeHttpUrl("blob:https://x/1"), false);
eq("safe ftp no", P.isSafeHttpUrl("ftp://x/f"), false);
eq("safe nonstring", P.isSafeHttpUrl({}), false);
eq("safe empty", P.isSafeHttpUrl(""), false);
eq("safe long", P.isSafeHttpUrl("https://x.com/" + "a".repeat(2048)), false);

// isMediaish: медиа да, гифки/картинки нет
eq("mediaish mp4", P.isMediaish("https://x.com/v.mp4?x=1"), true);
eq("mediaish mp3", P.isMediaish("https://cs1.vk.ru/a.mp3"), true);
eq("mediaish cdn", P.isMediaish("https://scontent-hel3-1.cdninstagram.com/v/t50/x"), true);
eq("mediaish playback", P.isMediaish("https://rr.googlevideo.com/videoplayback?mime=video%2Fmp4"), true);
eq("mediaish gif no", P.isMediaish("https://x.com/a.gif"), false);
eq("mediaish png no", P.isMediaish("https://x.com/a.png"), false);
eq("mediaish js no", P.isMediaish("https://x.com/a.js"), false);
eq("mediaish page no", P.isMediaish("https://x.com/about"), false);

// аудио: прямые файлы, заголовки, og:audio
eq("audio mp3", P.isDirectAudio("https://cs1.vk.ru/a.mp3?x=1"), true);
eq("audio m4a", P.isDirectAudio("https://x.com/a.M4A"), true);
eq("audio no", P.isDirectAudio("https://x.com/v.mp4"), false);
eq("audio head id3", P.hasAudioHead(new Uint8Array([0x49, 0x44, 0x33, 4, 0])), true);
eq("audio head ogg", P.hasAudioHead(new Uint8Array([0x4f, 0x67, 0x67, 0x53])), true);
eq("audio head flac", P.hasAudioHead(new Uint8Array([0x66, 0x4c, 0x61, 0x43])), true);
eq("audio head riff", P.hasAudioHead(new Uint8Array([0x52, 0x49, 0x46, 0x46])), true);
eq("audio head mpeg", P.hasAudioHead(new Uint8Array([0xff, 0xfb, 0x90, 0x00])), true);
eq("audio head junk", P.hasAudioHead(new Uint8Array([1, 2, 3, 4])), false);
eq("audio ext mp3", P.extByContentType("audio/mpeg"), ".mp3");
eq("audio ext ogg", P.extByContentType("audio/ogg"), ".ogg");
eq("audio ext m4a", P.extByContentType("audio/mp4"), ".m4a");
eq("video ogg stays ogv", P.extByContentType("video/ogg"), ".ogv");
eq("og audio meta", P.extractFromHtml(`<meta property="og:audio" content="https://cs1.vk.ru/a.mp3">`, "https://vk.ru/"), ["https://cs1.vk.ru/a.mp3"]);

// manifest валиден
const mf = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
eq("manifest v3", mf.manifest_version, 3);
eq("manifest icons exist", [mf.icons["16"], mf.icons["48"], mf.icons["128"]], ["icons/icon16.png", "icons/icon48.png", "icons/icon128.png"]);

console.log(`\nTOTAL pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
