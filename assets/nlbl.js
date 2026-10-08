/* ==========================================================================
   Moteur .NLBL autonome (navigateur) — portage fidèle de src/lib/nlbl/
   ZIP + WinZip AES-256 (AE-1) : SHA-1, HMAC-SHA1, PBKDF2, AES-CTR (compteur
   128 bits petit-boutien à partir de 1), deflate via CompressionStream.
   Aucun appel réseau, aucune dépendance.
   ========================================================================== */
var NLBL = (function () {
  "use strict";
  var TE = new TextEncoder();

  /* ---------------- SHA-1 ---------------- */
  function sha1(bytes) {
    var ml = bytes.length, nb = ((ml + 8) >> 6) + 1, w = new Uint32Array(nb * 16), i;
    for (i = 0; i < ml; i++) w[i >> 2] |= bytes[i] << (24 - (i & 3) * 8);
    w[ml >> 2] |= 0x80 << (24 - (ml & 3) * 8);
    w[nb * 16 - 1] = ml * 8;
    w[nb * 16 - 2] = Math.floor(ml / 0x20000000);
    var h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
    var W = new Uint32Array(80);
    for (var b = 0; b < nb; b++) {
      for (i = 0; i < 16; i++) W[i] = w[b * 16 + i];
      for (i = 16; i < 80; i++) { var x = W[i - 3] ^ W[i - 8] ^ W[i - 14] ^ W[i - 16]; W[i] = (x << 1) | (x >>> 31); }
      var a = h0, bb = h1, c = h2, d = h3, e = h4;
      for (i = 0; i < 80; i++) {
        var f, k;
        if (i < 20) { f = (bb & c) | (~bb & d); k = 0x5a827999; }
        else if (i < 40) { f = bb ^ c ^ d; k = 0x6ed9eba1; }
        else if (i < 60) { f = (bb & c) | (bb & d) | (c & d); k = 0x8f1bbcdc; }
        else { f = bb ^ c ^ d; k = 0xca62c1d6; }
        var t = (((a << 5) | (a >>> 27)) + f + e + k + W[i]) >>> 0;
        e = d; d = c; c = (bb << 30) | (bb >>> 2); bb = a; a = t;
      }
      h0 = (h0 + a) >>> 0; h1 = (h1 + bb) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
    }
    var out = new Uint8Array(20), hs = [h0, h1, h2, h3, h4];
    for (i = 0; i < 5; i++) { out[i * 4] = hs[i] >>> 24; out[i * 4 + 1] = (hs[i] >>> 16) & 255; out[i * 4 + 2] = (hs[i] >>> 8) & 255; out[i * 4 + 3] = hs[i] & 255; }
    return out;
  }
  function concat(arrs) {
    var n = 0, i; for (i = 0; i < arrs.length; i++) n += arrs[i].length;
    var o = new Uint8Array(n), p = 0;
    for (i = 0; i < arrs.length; i++) { o.set(arrs[i], p); p += arrs[i].length; }
    return o;
  }
  function hmacSha1(key, msg) {
    if (key.length > 64) key = sha1(key);
    var k = new Uint8Array(64); k.set(key);
    var ip = new Uint8Array(64), op = new Uint8Array(64);
    for (var i = 0; i < 64; i++) { ip[i] = k[i] ^ 0x36; op[i] = k[i] ^ 0x5c; }
    return sha1(concat([op, sha1(concat([ip, msg]))]));
  }
  function pbkdf2Sha1(pwd, salt, iter, len) {
    var out = new Uint8Array(len), blocks = Math.ceil(len / 20);
    for (var b = 1; b <= blocks; b++) {
      var u = hmacSha1(pwd, concat([salt, new Uint8Array([b >>> 24, (b >>> 16) & 255, (b >>> 8) & 255, b & 255])]));
      var t = u.slice();
      for (var i = 1; i < iter; i++) { u = hmacSha1(pwd, u); for (var j = 0; j < 20; j++) t[j] ^= u[j]; }
      out.set(t.subarray(0, Math.min(20, len - (b - 1) * 20)), (b - 1) * 20);
    }
    return out;
  }

  /* ---------------- AES (chiffrement seul, 128/192/256) ---------------- */
  var SBOX = new Uint8Array(256);
  (function () {
    var p = 1, q = 1;
    do {
      p = p ^ ((p << 1) & 0xff) ^ (p & 0x80 ? 0x1b : 0);
      q ^= q << 1; q ^= q << 2; q ^= q << 4; q &= 0xff; if (q & 0x80) q ^= 0x09;
      var x = q ^ ((q << 1) | (q >> 7)) ^ ((q << 2) | (q >> 6)) ^ ((q << 3) | (q >> 5)) ^ ((q << 4) | (q >> 4));
      SBOX[p] = (x ^ 0x63) & 0xff;
    } while (p !== 1);
    SBOX[0] = 0x63;
  })();
  function xtime(a) { return ((a << 1) ^ (a & 0x80 ? 0x1b : 0)) & 0xff; }
  function expandKey(key) {
    var nk = key.length / 4, nr = nk + 6, w = new Uint8Array(16 * (nr + 1)), rcon = 1, i;
    w.set(key);
    for (i = nk; i < 4 * (nr + 1); i++) {
      var t0 = w[(i - 1) * 4], t1 = w[(i - 1) * 4 + 1], t2 = w[(i - 1) * 4 + 2], t3 = w[(i - 1) * 4 + 3];
      if (i % nk === 0) {
        var tmp = t0; t0 = SBOX[t1] ^ rcon; t1 = SBOX[t2]; t2 = SBOX[t3]; t3 = SBOX[tmp];
        rcon = xtime(rcon);
      } else if (nk > 6 && i % nk === 4) { t0 = SBOX[t0]; t1 = SBOX[t1]; t2 = SBOX[t2]; t3 = SBOX[t3]; }
      w[i * 4] = w[(i - nk) * 4] ^ t0; w[i * 4 + 1] = w[(i - nk) * 4 + 1] ^ t1;
      w[i * 4 + 2] = w[(i - nk) * 4 + 2] ^ t2; w[i * 4 + 3] = w[(i - nk) * 4 + 3] ^ t3;
    }
    return { w: w, nr: nr };
  }
  function aesBlock(ks, inp) {
    var s = new Uint8Array(16), w = ks.w, nr = ks.nr, r, i, c;
    for (i = 0; i < 16; i++) s[i] = inp[i] ^ w[i];
    for (r = 1; r <= nr; r++) {
      for (i = 0; i < 16; i++) s[i] = SBOX[s[i]];
      var t = new Uint8Array(16);
      for (c = 0; c < 4; c++) for (i = 0; i < 4; i++) t[c * 4 + i] = s[((c + i) % 4) * 4 + i];
      if (r !== nr) {
        for (c = 0; c < 4; c++) {
          var a0 = t[c * 4], a1 = t[c * 4 + 1], a2 = t[c * 4 + 2], a3 = t[c * 4 + 3], all = a0 ^ a1 ^ a2 ^ a3;
          t[c * 4] ^= all ^ xtime(a0 ^ a1); t[c * 4 + 1] ^= all ^ xtime(a1 ^ a2);
          t[c * 4 + 2] ^= all ^ xtime(a2 ^ a3); t[c * 4 + 3] ^= all ^ xtime(a3 ^ a0);
        }
      }
      for (i = 0; i < 16; i++) s[i] = t[i] ^ w[r * 16 + i];
    }
    return s;
  }
  /** AES-CTR façon WinZip : compteur 128 bits petit-boutien initialisé à 1. */
  function ctrWinZip(key, data) {
    var ks = expandKey(key), out = new Uint8Array(data.length), ctr = new Uint8Array(16);
    for (var off = 0, n = 1; off < data.length; off += 16, n++) {
      var v = n; for (var i = 0; i < 8; i++) { ctr[i] = v & 255; v = Math.floor(v / 256); }
      var k = aesBlock(ks, ctr);
      for (var j = 0; j < 16 && off + j < data.length; j++) out[off + j] = data[off + j] ^ k[j];
    }
    return out;
  }

  /* ---------------- CRC32, deflate, ZIP ---------------- */
  var CRC = new Uint32Array(256);
  for (var n0 = 0; n0 < 256; n0++) { var c0 = n0; for (var k0 = 0; k0 < 8; k0++) c0 = c0 & 1 ? 0xedb88320 ^ (c0 >>> 1) : c0 >>> 1; CRC[n0] = c0 >>> 0; }
  function crc32(b) { var c = 0xffffffff; for (var i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

  function deflateRaw(bytes) {
    if (typeof CompressionStream === "undefined") return Promise.reject(new Error("Navigateur trop ancien : utilisez Chrome, Edge ou Firefox récent."));
    var s = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
    return new Response(s).arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
  }
  function randomBytes(n) { var b = new Uint8Array(n); crypto.getRandomValues(b); return b; }

  function encryptAe1(compressed, password, strength) {
    var keySize = { 1: 16, 2: 24, 3: 32 }[strength], salt = randomBytes(keySize / 2);
    var d = pbkdf2Sha1(TE.encode(password), salt, 1000, keySize * 2 + 2);
    var aesKey = d.subarray(0, keySize), hmacKey = d.subarray(keySize, keySize * 2), pv = d.subarray(keySize * 2, keySize * 2 + 2);
    var ct = ctrWinZip(aesKey, compressed);
    var auth = hmacSha1(hmacKey, ct).subarray(0, 10);
    return concat([salt, pv, ct, auth]);
  }

  function u16(v) { return [v & 255, (v >>> 8) & 255]; }
  function u32(v) { return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]; }
  function dosDT(d) {
    return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
             date: (((d.getFullYear() - 1980) & 0x7f) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
  }
  /** entries: [{name, data:Uint8Array|string, modified?:Date, aes?:{password,strength}}] → Promise<Uint8Array> */
  function buildZip(entries) {
    return entries.reduce(function (p, e) {
      return p.then(function (acc) {
        var raw = typeof e.data === "string" ? TE.encode(e.data) : e.data;
        return deflateRaw(raw).then(function (comp) {
          var item = { name: TE.encode(e.name), raw: raw, crc: crc32(raw), dt: dosDT(e.modified || new Date()) };
          if (e.aes) {
            var st = e.aes.strength || 3;
            item.stored = encryptAe1(comp, e.aes.password, st); item.flags = 1; item.method = 99;
            item.extra = new Uint8Array([].concat(u16(0x9901), u16(7), u16(1), [65, 69], [st], u16(8)));
          } else { item.stored = comp; item.flags = 0; item.method = 8; item.extra = new Uint8Array(0); }
          acc.push(item); return acc;
        });
      });
    }, Promise.resolve([])).then(function (items) {
      var parts = [], central = [], off = 0;
      items.forEach(function (it) {
        var common = [].concat(u16(it.flags), u16(it.method), u16(it.dt.time), u16(it.dt.date), u32(it.crc), u32(it.stored.length), u32(it.raw.length), u16(it.name.length), u16(it.extra.length));
        var local = concat([new Uint8Array([].concat(u32(0x04034b50), u16(20), common)), it.name, it.extra]);
        parts.push(local, it.stored);
        central.push(concat([new Uint8Array([].concat(u32(0x02014b50), u16(45), u16(20), common, u16(0), u16(0), u16(0), u32(0), u32(off))), it.name, it.extra]));
        off += local.length + it.stored.length;
      });
      var cd = concat(central);
      var eocd = new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0), u16(items.length), u16(items.length), u32(cd.length), u32(off), u16(0)));
      return concat(parts.concat([cd, eocd]));
    });
  }

  /* ---------------- Modèle Zebra cLEMENT2 ---------------- */
  var PASSWORD = ",^_A5Fus&!?j='Epiq*e";
  var TEMPLATE_NAME = "cLEMENT2";
  var IMPRIMANTE_DEFAUT = "ZDesigner GK420d";
  var CHAMPS = [["Modele", "modele"], ["Type", "type"], ["OF", "of"], ["CodeBarre", "codeBarre"], ["Couleur", "couleur"], ["Manche", "manche"], ["Taille", "taille"]];

  function xmlEscape(v) { return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;"); }
  function b64(bytes) { var s = ""; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s); }
  function unb64(s) { var bin = atob(s), o = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) o[i] = bin.charCodeAt(i); return o; }
  var CTRL = /[\r\n\t\u0000-\u001F]/;
  function blocString(tag, value, ind) {
    var isB64 = CTRL.test(value), attr = isB64 ? ' Base64Encoded="true"' : "", c = isB64 ? b64(TE.encode(value)) : xmlEscape(value);
    return "<" + tag + ' Type="StringContents">\n' + ind + "<StringValue" + attr + ">" + c + "</StringValue>\n" + ind + "<UserValue" + attr + ">" + c + "</UserValue>\n      </" + tag + ">";
  }
  function patcherVariable(xml, nom, valeur) {
    return xml.replace(/<Item Type="Variable">[\s\S]*?<\/Item>/g, function (bloc) {
      if (bloc.indexOf("<Name>" + nom + "</Name>") === -1) return bloc;
      var d = blocString("DefaultValue", valeur, "        "), s = blocString("SampleValue", valeur, "        ");
      return bloc.replace(/<DefaultValue Type="StringContents">[\s\S]*?<\/DefaultValue>/, function () { return d; })
                 .replace(/<SampleValue Type="StringContents">[\s\S]*?<\/SampleValue>/, function () { return s; });
    });
  }
  function renommer(xml, nom) {
    return xml.split("<Name>" + TEMPLATE_NAME + "</Name>").join("<Name>" + xmlEscape(nom) + "</Name>")
              .split("<SolutionName>" + TEMPLATE_NAME + "</SolutionName>").join("<SolutionName>" + xmlEscape(nom) + "</SolutionName>");
  }
  function utf16le(s) { var o = new Uint8Array(s.length * 2); for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); o[i * 2] = c & 255; o[i * 2 + 1] = c >> 8; } return o; }
  function latin1(s) { var o = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) o[i] = s.charCodeAt(i) & 255; return o; }
  function indexOfBytes(h, n, from) {
    outer: for (var i = from || 0; i <= h.length - n.length; i++) { for (var j = 0; j < n.length; j++) if (h[i + j] !== n[j]) continue outer; return i; }
    return -1;
  }
  function patcherImprimante(xml, nomImp) {
    return xml.replace(/<Printer Type="Printer">[\s\S]*?<\/Printer>/, function (bloc) {
      return bloc.replace(/<Name>[^<]*<\/Name>/, "<Name>" + xmlEscape(nomImp) + "</Name>")
        .replace(/<DriverName>[^<]*<\/DriverName>/, "<DriverName>" + xmlEscape(nomImp) + "</DriverName>")
        .replace(/<DevModeBuffer>[^<]*<\/DevModeBuffer>/, function (b) {
          var buf = unb64(b.slice(15, b.length - 16));
          var ancienChamp = new Uint8Array(64); ancienChamp.set(utf16le(IMPRIMANTE_DEFAUT));
          var pos = indexOfBytes(buf, ancienChamp);
          if (pos !== -1) { var champ = new Uint8Array(64); champ.set(utf16le(nomImp.slice(0, 32))); buf.set(champ, pos); }
          var ancienAnsi = latin1(IMPRIMANTE_DEFAUT);
          var ansi = nomImp.slice(0, ancienAnsi.length).normalize("NFKD").replace(/[̀-ͯ]/g, "");
          var rep = new Uint8Array(ancienAnsi.length); rep.set(latin1(ansi).subarray(0, ancienAnsi.length));
          var p = indexOfBytes(buf, ancienAnsi);
          while (p !== -1) { buf.set(rep, p); p = indexOfBytes(buf, ancienAnsi, p + ancienAnsi.length); }
          return "<DevModeBuffer>" + b64(buf) + "</DevModeBuffer>";
        });
    });
  }
  function construireXmls(tpl, etiquette, nom, imprimante) {
    var solution = renommer(tpl.solution, nom), format = renommer(tpl.label, nom);
    if (imprimante) format = patcherImprimante(format, imprimante);
    CHAMPS.forEach(function (c) { solution = patcherVariable(solution, c[0], etiquette[c[1]]); });
    return { solution: solution, format: format };
  }
  function construireNlbl(tpl, etiquette, nom, imprimante) {
    var x = construireXmls(tpl, etiquette, nom, imprimante), now = new Date();
    return buildZip([
      { name: "Formats/" + nom, data: x.format, modified: now, aes: { password: PASSWORD, strength: 3 } },
      { name: nom + ".slnx", data: x.solution, modified: now, aes: { password: PASSWORD, strength: 3 } }
    ]);
  }

  /* ---------------- Paquet : 1 étiquette → .nlbl ; N → .zip ---------------- */
  function horodatage(d) {
    var p = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
    function g(t) { var f = p.filter(function (x) { return x.type === t; })[0]; return f ? f.value : ""; }
    return g("year") + g("month") + g("day") + "_" + g("hour") + g("minute");
  }
  function slug(t, max) {
    max = max || 28;
    return (t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max).replace(/-+$/g, "")) || "etiquette";
  }
  var LISEZMOI = "ÉTIQUETTES — LOT DE FICHIERS .NLBL (Zebra Designer Essentials 3)\n=====================================================================\n\nCe lot contient un fichier .nlbl par étiquette, avec les données\nDÉJÀ INTÉGRÉES : aucun import de fichier texte n'est nécessaire.\n\nPour imprimer chaque étiquette :\n1. Ouvrir le fichier .nlbl souhaité dans Zebra Designer 3 ;\n2. Cliquer sur « Imprimer » : les valeurs sont déjà remplies ;\n3. Régler la quantité puis lancer l'impression.\n\nAstuce : pour N copies de la MÊME étiquette, un seul fichier suffit —\nrégler « Nombre d'étiquettes » dans la fenêtre d'impression de Zebra Designer.\n\nCe fichier a été généré par le générateur autonome d'étiquettes\nde Clément Design.\n";
  function lisezMoi(noms, qs) {
    if (qs.every(function (q) { return q === 1; })) return LISEZMOI;
    var total = qs.reduce(function (s, q) { return s + q; }, 0);
    return LISEZMOI + "\nQUANTITÉS DEMANDÉES (total : " + total + " copies) — réglez « Nombre d'étiquettes » dans Zebra Designer pour chaque fichier :\n\n" +
      noms.map(function (n, i) { return "- " + n + " : imprimer ×" + qs[i] + " copie" + (qs[i] > 1 ? "s" : ""); }).join("\n") + "\n";
  }
  /** etiquettes: [LabelInput], quantites: [int] → Promise<{filename, mime, data, mode}> */
  function genererPaquet(tpl, etiquettes, quantites, imprimante, maintenant) {
    maintenant = maintenant || new Date();
    var base = "etiquettes_" + horodatage(maintenant);
    if (etiquettes.length === 1) {
      return construireNlbl(tpl, etiquettes[0], base, imprimante).then(function (data) {
        return { filename: base + ".nlbl", mime: "application/octet-stream", data: data, mode: "nlbl" };
      });
    }
    var noms = etiquettes.map(function (e, i) { return "etiquette_" + String(i + 1).padStart(3, "0") + "_" + slug(e.modele) + "_OF" + slug(e.of, 12) + ".nlbl"; });
    return Promise.all(etiquettes.map(function (e, i) { return construireNlbl(tpl, e, noms[i].replace(/\.nlbl$/, ""), imprimante); }))
      .then(function (fichiers) {
        var entrees = fichiers.map(function (f, i) { return { name: base + "/" + noms[i], data: f, modified: maintenant }; });
        entrees.push({ name: base + "/LISEZMOI.txt", data: lisezMoi(noms, quantites), modified: maintenant });
        return buildZip(entrees);
      }).then(function (data) { return { filename: base + ".zip", mime: "application/zip", data: data, mode: "zip" }; });
  }

  return { sha1: sha1, hmacSha1: hmacSha1, pbkdf2Sha1: pbkdf2Sha1, ctrWinZip: ctrWinZip, aesBlock: aesBlock, expandKey: expandKey,
           buildZip: buildZip, construireXmls: construireXmls, construireNlbl: construireNlbl, genererPaquet: genererPaquet,
           xmlEscape: xmlEscape, IMPRIMANTE_DEFAUT: IMPRIMANTE_DEFAUT };
})();
