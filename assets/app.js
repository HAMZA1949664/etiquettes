/* ==========================================================================
   Étiquettes .NLBL — Clément Design
   Connexion → catalogue (base) → génération multi-tailles → enregistrement
   dans la base PUIS téléchargement du .zip ; historique ; comptes (Achats).
   ========================================================================== */
(function () {
"use strict";

var $ = function (id) { return document.getElementById(id); };
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]; }); }
function uniq(a) { return Array.from(new Set(a)); }

/* ===================== Stockage sur ce poste (cache du site) ===================== */
function lireLocal(cle) { try { var v = localStorage.getItem(cle); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
function ecrireLocal(cle, v) { try { if (v === null || v === undefined) localStorage.removeItem(cle); else localStorage.setItem(cle, JSON.stringify(v)); return true; } catch (e) { return false; } }

/* ===================== Session (gardée sur ce poste, 30 jours) ===================== */
var session = null; // { token, identifiant, nom, role, atelier_id, atelier }
function lireSession() { return lireLocal("cld_session"); }
function ecrireSession(s) { ecrireLocal("cld_session", s || null); }

/* ===================== Appels à la base (fonctions Supabase) ===================== */
function ErreurApi(message, code) { this.message = message; this.code = code; }
function rpc(fonction, args) {
  var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  var minuteur = ctrl ? setTimeout(function () { ctrl.abort(); }, 20000) : null;
  return fetch(CONFIG.supabaseUrl + "/rest/v1/rpc/" + fonction, {
    method: "POST", signal: ctrl ? ctrl.signal : undefined,
    headers: { "apikey": CONFIG.supabaseCle, "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(args || {})
  }).then(function (r) {
    clearTimeout(minuteur);
    return r.text().then(function (t) {
      var corps = null; try { corps = t ? JSON.parse(t) : null; } catch (e) {}
      if (r.ok) return corps;
      var msg = (corps && corps.message) || ("Erreur " + r.status);
      if (/SESSION_INVALIDE/.test(msg)) throw new ErreurApi("Votre session a expiré : reconnectez-vous.", "session");
      throw new ErreurApi(msg.replace(/^(DONNEES_INVALIDES|REFUSE):\s*/, ""), "serveur");
    });
  }, function () { clearTimeout(minuteur); throw new ErreurApi("Pas de connexion à Internet (ou base injoignable).", "reseau"); });
}
function gererErreur(e, prefixe) {
  if (e && e.code === "session") { deconnecter(e.message, true); return; }
  toast((prefixe ? prefixe + " : " : "") + ((e && e.message) || e), true);
}

/* ===================== Toast ===================== */
var tId;
function toast(msg, err) { var t = $("toast"); t.textContent = msg; t.className = "vis" + (err ? " err" : ""); clearTimeout(tId); tId = setTimeout(function () { t.className = ""; }, err ? 6000 : 3500); }

/* ===================== Connexion ===================== */
$("formConnexion").addEventListener("submit", function (ev) {
  ev.preventDefault();
  var b = $("btnConnexion"), err = $("erreurConnexion");
  err.classList.add("cache"); b.disabled = true; b.textContent = "Connexion…";
  rpc("connexion", { p_identifiant: $("identifiant").value, p_code: $("code").value })
    .then(function (r) {
      if (!r || !r.ok) { err.textContent = (r && r.erreur) || "Connexion impossible."; err.classList.remove("cache"); return; }
      session = r; ecrireSession(r); $("code").value = ""; demarrer();
    })
    .catch(function (e) {
      err.textContent = e.code === "reseau" ? "Pas d'Internet : la connexion d'un compte demande Internet. Ensuite, le site fonctionne même hors ligne." : (e.message || String(e));
      err.classList.remove("cache");
    })
    .then(function () { b.disabled = false; b.textContent = "Se connecter"; });
});
function deconnecter(message, sessionExpiree) {
  if (session && !sessionExpiree) rpc("deconnexion", { p_token: session.token }).catch(function () {});
  session = null; ecrireSession(null); CATALOGUE = [];
  $("vueApp").classList.add("cache"); $("nav").classList.add("cache"); $("vueConnexion").classList.remove("cache");
  var err = $("erreurConnexion");
  if (message) { err.textContent = message; err.classList.remove("cache"); } else err.classList.add("cache");
}
var armeDeconnexion = 0;
$("btnDeconnexion").addEventListener("click", function () {
  var n = enAttente().length, b = $("btnDeconnexion");
  if (n && Date.now() - armeDeconnexion > 4000) {
    armeDeconnexion = Date.now(); b.textContent = "Confirmer ?";
    toast(n + " génération" + (n > 1 ? "s" : "") + " pas encore envoyée" + (n > 1 ? "s" : "") + " : elle" + (n > 1 ? "s restent" : " reste") + " sur ce poste et partira à la prochaine connexion de ce compte.", true);
    setTimeout(function () { b.textContent = "Déconnexion"; }, 4000); return;
  }
  b.textContent = "Déconnexion"; deconnecter();
});

/* ===================== Démarrage après connexion ===================== */
var CATALOGUE = [], ARTICLES = [], TOUTES_COULEURS = [], TOUTES_TAILLES = [];
function demarrer() {
  $("vueConnexion").classList.add("cache"); $("vueApp").classList.remove("cache"); $("nav").classList.remove("cache");
  $("quiNom").textContent = session.nom; $("quiAtelier").textContent = session.atelier;
  $("ongletComptes").classList.toggle("cache", session.role !== "admin");
  $("hBlocAtelier").classList.toggle("cache", session.role !== "admin");
  $("chargement").classList.remove("cache"); $("pageGenerer").classList.add("cache");
  function installer(cat, dateCache) {
    CATALOGUE = cat || [];
    ARTICLES = uniq(CATALOGUE.map(function (r) { return r[0]; })).sort();
    TOUTES_COULEURS = uniq(CATALOGUE.map(function (r) { return r[1]; })).sort(comparerCouleurs);
    TOUTES_TAILLES = uniq(CATALOGUE.map(function (r) { return r[2]; })).sort(comparerTailles);
    $("chargement").classList.add("cache");
    bandeau(dateCache ? "Hors ligne : catalogue gardé sur ce poste (mis à jour le " + fmtDate.format(new Date(dateCache)) + "). Les étiquettes restent générées ; les enregistrements partiront au retour d'Internet." : "");
    afficherPage("generer"); tout(); majEtat();
  }
  rpc("catalogue", { p_token: session.token }).then(function (cat) {
    ecrireLocal("cld_catalogue", { date: new Date().toISOString(), data: cat || [] });
    installer(cat, null); synchroniser();
  }).catch(function (e) {
    if (e.code === "session") { deconnecter(e.message, true); return; }
    var cache = lireLocal("cld_catalogue");
    if (cache && cache.data && cache.data.length) { installer(cache.data, cache.date); return; }
    $("chargement").textContent = "Impossible de charger le catalogue : " + e.message + " Connectez ce poste à Internet une première fois.";
  });
}
function bandeau(texte, err) { var b = $("bandeau"); b.textContent = texte || ""; b.className = "bandeau" + (err ? " err" : "") + (texte ? "" : " cache"); }

/* ===================== Onglets ===================== */
var pageCourante = "generer";
function afficherPage(p) {
  pageCourante = p;
  [["generer", "pageGenerer"], ["historique", "pageHistorique"], ["comptes", "pageComptes"]].forEach(function (x) {
    $(x[1]).classList.toggle("cache", x[0] !== p);
  });
  Array.prototype.forEach.call(document.querySelectorAll(".onglet"), function (o) { o.classList.toggle("actif", o.dataset.page === p); });
  if (p === "historique") chargerHistorique();
  if (p === "comptes") chargerComptes();
}
Array.prototype.forEach.call(document.querySelectorAll(".onglet"), function (o) {
  o.addEventListener("click", function () { if (CATALOGUE.length) afficherPage(o.dataset.page); });
});

/* ===================== Génération : état et listes ===================== */
var st = { article: "", couleur: "", manche: "", tailles: [], of: "", type: TYPES[0][0], spe: false, recherche: "" };

function couleursListe() { if (!st.article) return []; if (st.spe) return TOUTES_COULEURS; return uniq(CATALOGUE.filter(function (r) { return r[0] === st.article; }).map(function (r) { return r[1]; })).sort(comparerCouleurs); }
function manchesListe() { if (!st.article || !st.couleur) return []; return uniq(CATALOGUE.filter(function (r) { return r[0] === st.article && r[1] === st.couleur && r[3]; }).map(function (r) { return r[3]; })); }
function mancheApplicable() { return st.spe ? true : manchesListe().length > 0; }
function manchesProposees() { return st.spe ? Object.keys(MANCHES) : manchesListe(); }
function taillesListe() {
  if (!st.article || !st.couleur) return [];
  if (st.spe) return TOUTES_TAILLES;
  var ma = mancheApplicable(); if (ma && !st.manche) return [];
  return uniq(CATALOGUE.filter(function (r) { return r[0] === st.article && r[1] === st.couleur && (!ma || r[3] === st.manche); }).map(function (r) { return r[2]; })).sort(comparerTailles);
}
function record(t) {
  if (st.spe) return [st.article, st.couleur, t, st.manche, ""];
  var ma = mancheApplicable();
  for (var i = 0; i < CATALOGUE.length; i++) { var r = CATALOGUE[i]; if (r[0] === st.article && r[1] === st.couleur && r[2] === t && (!ma || r[3] === st.manche)) return r; }
  return null;
}
function taillesCochees() { var l = taillesListe(); return st.tailles.filter(function (t) { return l.indexOf(t) !== -1; }).sort(comparerTailles); }
function etiquettes() { return taillesCochees().map(function (t) { return calculer(record(t), st.of, st.type, st.spe); }); }

/* ===================== Noms de fichiers : modèle + taille ===================== */
function seg(t, max) { return (String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9+\-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max || 40).replace(/-+$/g, "")) || "x"; }
function segTaille(t) { return String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "").replace(/[^a-zA-Z0-9+\-]+/g, "-").slice(0, 20) || "x"; }
function nomsFichiers(es) {
  var vus = {};
  return es.map(function (e) {
    var base = seg(e.modele) + "_" + segTaille(e.taille) + "_OF" + seg(e.of, 20), n = base, i = 2;
    while (vus[n.toLowerCase()]) n = base + "_" + (i++);
    vus[n.toLowerCase()] = 1; return n + ".nlbl";
  });
}
function horodatage(d) {
  var p = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  function g(t) { var f = p.filter(function (x) { return x.type === t; })[0]; return f ? f.value : ""; }
  return g("year") + g("month") + g("day") + "_" + g("hour") + g("minute");
}

/* ===================== Rendu : génération ===================== */
function chip(val, on, txt, sub, cls) { return '<button type="button" class="chip' + (cls ? " " + cls : "") + (on ? " on" : "") + '" data-v="' + esc(val) + '" aria-pressed="' + (on ? "true" : "false") + '">' + esc(txt) + (sub ? "<small>" + esc(sub) + "</small>" : "") + "</button>"; }
function rendreArticles() {
  var q = st.recherche.trim().toUpperCase();
  var l = ARTICLES.filter(function (a) { return !q || a.toUpperCase().indexOf(q) !== -1; });
  $("articles").innerHTML = l.length ? l.map(function (a) { return chip(a, a === st.article, a); }).join("") : '<div class="vide">Aucun article trouvé.</div>';
}
function rendreSelection() {
  var cs = couleursListe();
  $("couleurs").innerHTML = !st.article ? '<div class="vide">Choisissez d\'abord un article.</div>' : cs.map(function (c) { return chip(c, c === st.couleur, couleurLabel(c)[0], c); }).join("");
  var ma = mancheApplicable(), ms = manchesProposees();
  $("blocManche").style.display = (st.couleur && ma) ? "" : "none";
  $("manches").innerHTML = ms.map(function (m) { return chip(m, m === st.manche, mancheLabel(m)[0]); }).join("");
  var ts = taillesListe(), sel = taillesCochees();
  $("outilsTailles").style.display = ts.length ? "" : "none";
  $("compte").textContent = sel.length ? sel.length + " taille" + (sel.length > 1 ? "s" : "") + " cochée" + (sel.length > 1 ? "s" : "") : "Aucune taille cochée";
  $("tailles").innerHTML = !st.couleur ? '<div class="vide">Choisissez un article et une couleur.</div>' :
    (ma && !st.manche && !st.spe) ? '<div class="vide">Choisissez une manche.</div>' :
    ts.map(function (t) { return chip(t, sel.indexOf(t) !== -1, t, "", "taille"); }).join("");
}
function barcodeSvg(code) {
  var L = ["0001101","0011001","0010011","0111101","0100011","0110001","0101111","0111011","0110111","0001011"],
      G = ["0100111","0110011","0011011","0100001","0011101","0111001","0000101","0010001","0001001","0010111"],
      R = ["1110010","1100110","1101100","1000010","1011100","1001110","1010000","1000100","1001000","1110100"],
      P = ["LLLLLL","LLGLGG","LLGGLG","LLGGGL","LGLLGG","LGGLLG","LGGGLL","LGLGLG","LGLGGL","LGGLGL"];
  var d = code.split("").map(Number), par = P[d[0]], bits = "101", i;
  for (i = 1; i < 7; i++) bits += par[i - 1] === "L" ? L[d[i]] : G[d[i]];
  bits += "01010"; for (i = 7; i < 13; i++) bits += R[d[i]]; bits += "101";
  var mw = 2, q = 12, h = 50, W = q * 2 + bits.length * mw, rects = "", x = q;
  for (i = 0; i < bits.length; i++) { if (bits[i] === "1") { var g = (i < 3 || (i >= 45 && i < 50) || i >= bits.length - 3); rects += '<rect x="' + x + '" y="0" width="' + mw + '" height="' + (g ? h + 6 : h) + '"/>'; } x += mw; }
  return '<svg viewBox="0 0 ' + W + ' ' + (h + 20) + '" role="img" aria-label="Code-barres ' + code + '"><g fill="#111">' + rects + '</g>' +
    '<text x="' + (W / 2) + '" y="' + (h + 18) + '" text-anchor="middle" font-family="ui-monospace,Menlo,Consolas,monospace" font-size="13" fill="#111" letter-spacing="2">' + code + '</text></svg>';
}
function ph(v, defaut) { return v ? esc(v) : '<span class="ph">' + defaut + '</span>'; }
function rendreApercu() {
  var es = etiquettes(), e = es[0] || null, sel = taillesCochees();
  var vals = e || { modele: st.article ? st.article + (st.manche ? " " + sleeveAbbrev(st.manche) : "") + (st.spe ? " SPE" : "") : "", type: st.type.split("|").join(" / "), of: st.of.trim(), codeBarre: "", couleur: st.couleur ? couleurAffichee(st.couleur) : "", manche: "", taille: "" };
  $("etiq").innerHTML =
    '<div class="l1"><span>' + ph(vals.modele, "Modèle") + '</span><span>' + ph(vals.taille, "Taille") + '</span></div>' +
    '<div class="l2">' + ph(vals.type, "Type") + '</div>' +
    '<div class="l2">' + ph(vals.couleur, "Couleur") + (vals.manche ? " · " + esc(vals.manche) : "") + '</div>' +
    (vals.codeBarre && ean13Valide(vals.codeBarre) ? barcodeSvg(vals.codeBarre) : '<div class="l2 ph" style="text-align:center;padding:8% 0">Code-barres</div>') +
    '<div class="l3"><span>OF ' + ph(vals.of, "—") + '</span><span class="ph">' + (sel.length > 1 ? "1ʳᵉ des " + sel.length + " tailles" : "55 × 35 mm") + '</span></div>';
  var manque = [];
  if (!st.article) manque.push("l'article"); if (!st.couleur) manque.push("la couleur");
  if (st.couleur && mancheApplicable() && !st.manche && !st.spe) manque.push("la manche");
  if (!st.of.trim()) manque.push("le n° d'OF");
  if (!sel.length) manque.push("au moins une taille");
  var box = $("manque"), pret = false, erreurs = [];
  es.forEach(function (x, i) { if (!x) erreurs.push(sel[i] + " : absente du catalogue"); else { var er = erreursEtiquette(x); if (er.length && st.of.trim()) erreurs.push(x.taille + " : il faut " + er.join(", ")); } });
  if (manque.length) { box.className = "manque"; box.textContent = "Il manque : " + manque.join(", ") + "."; }
  else if (erreurs.length) { box.className = "manque err"; box.textContent = erreurs.join(" · "); }
  else { box.className = "manque ok"; box.textContent = "Prêt : " + sel.length + " étiquette" + (sel.length > 1 ? "s" : "") + " " + es[0].modele + " · " + es[0].couleur + " · OF " + es[0].of; pret = true; }
  var noms = es.length && es.every(Boolean) ? nomsFichiers(es) : [];
  $("listeSel").innerHTML = noms.length ? '<div class="tablewrap"><table><thead><tr><th>Taille</th><th>Code-barres</th><th>Fichier</th></tr></thead><tbody>' +
    es.map(function (x, i) { return '<tr><td><strong>' + esc(x.taille) + '</strong></td><td class="mono">' + esc(x.codeBarre) + '</td><td class="mono">' + esc(noms[i]) + '</td></tr>'; }).join("") + '</tbody></table></div>' : "";
  var b = $("btnGenerer"); if (!b.dataset.occupe) { b.disabled = !pret || sel.length > 100;
  b.textContent = sel.length > 1 ? "Générer les " + sel.length + " étiquettes (.zip)" : "Générer les étiquettes (.zip)"; }
}
function tout() { rendreArticles(); rendreSelection(); rendreApercu(); }

/* ===================== Génération + enregistrement ===================== */
function telecharger(data, nom, type) {
  var url = URL.createObjectURL(new Blob([data], { type: type || "application/zip" })), a = document.createElement("a");
  a.href = url; a.download = nom; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
}
/** Construit le .zip (un .nlbl par étiquette + LISEZMOI). */
function construireZip(es, noms, dossier, maintenant) {
  return Promise.all(es.map(function (e, i) { return NLBL.construireNlbl(MODELE_ZEBRA, e, noms[i].replace(/\.nlbl$/, "")); }))
    .then(function (fichiers) {
      var entrees = fichiers.map(function (f, i) { return { name: dossier + "/" + noms[i], data: f, modified: maintenant }; });
      entrees.push({ name: dossier + "/LISEZMOI.txt", modified: maintenant, data:
        "ÉTIQUETTES " + es[0].modele + " — " + es[0].couleur + " — OF " + es[0].of + "\r\n" +
        "Un fichier .nlbl par taille, données déjà intégrées (Zebra Designer Essentials 3).\r\n\r\n" +
        "Pour chaque fichier : ouvrir dans Zebra Designer, cliquer « Imprimer »,\r\nrégler le « Nombre d'étiquettes » puis lancer l'impression.\r\n\r\n" +
        noms.map(function (n, i) { return "- " + n + "  (taille " + es[i].taille + ", code " + es[i].codeBarre + ")"; }).join("\r\n") + "\r\n" });
      return NLBL.buildZip(entrees);
    });
}
function nouvelId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  var b = new Uint8Array(16); crypto.getRandomValues(b); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  var h = Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).slice(1); }).join("");
  return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
}
function generer() {
  var es = etiquettes(); if (!es.length || es.some(function (e) { return !e || erreursEtiquette(e).length; })) return;
  var sel = taillesCochees(), b = $("btnGenerer"), maintenant = new Date(), noms = nomsFichiers(es);
  var dossier = seg(es[0].modele) + "_OF" + seg(es[0].of, 20) + "_" + horodatage(maintenant);
  var enregistrement = {
    client_id: nouvelId(), genere_le: maintenant.toISOString(), hors_ligne: false,
    article: st.article, couleur_code: st.couleur, couleur: es[0].couleur, manche: st.manche,
    modele: es[0].modele, type: es[0].type, num_of: es[0].of, spe: st.spe, nom_zip: dossier + ".zip",
    etiquettes: es.map(function (e, i) { return { taille_catalogue: sel[i], taille: e.taille, code_barre: e.codeBarre, nom_fichier: noms[i] }; })
  };
  b.disabled = true; b.dataset.occupe = "1"; b.textContent = "Génération…";
  construireZip(es, noms, dossier, maintenant)
    .then(function (zip) {
      // 1. Le façonnier reçoit TOUJOURS ses étiquettes, avec ou sans Internet.
      telecharger(zip, dossier + ".zip");
      // 2. L'enregistrement est gardé sur le poste puis envoyé à la base.
      mettreEnAttente(enregistrement);
      return synchroniser().then(function () {
        var reste = enAttente().some(function (x) { return x.payload.client_id === enregistrement.client_id; });
        if (reste) toast("Téléchargé. Pas d'Internet : l'enregistrement est gardé sur ce poste et partira automatiquement.", true);
        else toast("Enregistré et téléchargé : " + es.length + " étiquette" + (es.length > 1 ? "s" : "") + " (" + dossier + ".zip)");
      });
    })
    .catch(function (e) { toast("Échec de la génération : " + ((e && e.message) || e), true); })
    .then(function () { delete b.dataset.occupe; if (CATALOGUE.length) rendreApercu(); });
}

/* ===================== File d'attente des enregistrements (hors ligne) ===================== */
// Gardée sur ce poste (localStorage), PAR COMPTE : une génération est toujours
// enregistrée au nom du compte qui l'a faite, même si un autre se connecte entre-temps.
function cleFile(id) { return "cld_attente_" + id; }
function enAttente(id) { id = id || (session && session.identifiant); return id ? (lireLocal(cleFile(id)) || []) : []; }
function ecrireFile(id, l) {
  if (!ecrireLocal(cleFile(id), l.length ? l : null)) toast("Stockage du navigateur plein ou bloqué : l'enregistrement hors ligne n'a pas pu être gardé.", true);
}
function mettreEnAttente(payload) {
  var l = enAttente(); l.push({ payload: payload, ajoute_le: new Date().toISOString(), erreur: null });
  ecrireFile(session.identifiant, l); majEtat();
}
var syncEnCours = null;
/** Envoie à la base les enregistrements en attente du compte connecté (dans l'ordre). */
function synchroniser() {
  if (!session) return Promise.resolve();
  if (syncEnCours) return syncEnCours;
  var id = session.identifiant;
  majEtat("envoi");
  syncEnCours = (function suivant(index) {
    var l = enAttente(id);
    if (index >= l.length) return Promise.resolve();
    var item = l[index];
    // Reçue plus de 2 minutes après la génération = générée hors ligne.
    if (item.differe || Date.now() - Date.parse(item.ajoute_le) > 120000) item.payload.hors_ligne = true;
    return rpc("enregistrer_generation", { p_token: session.token, p_generation: item.payload })
      .then(function () {
        var m = enAttente(id).filter(function (x) { return x.payload.client_id !== item.payload.client_id; });
        ecrireFile(id, m); return suivant(index);
      }, function (e) {
        if (e.code === "reseau") { // toujours hors ligne : on réessaiera
          var r = enAttente(id); r.forEach(function (x) { x.differe = true; }); ecrireFile(id, r); return;
        }
        if (e.code === "session") { deconnecter("Session expirée : reconnectez-vous pour envoyer les générations en attente.", true); return; }
        // Refus de la base (donnée invalide) : on garde la ligne avec le motif, on passe à la suivante.
        var m = enAttente(id); m.forEach(function (x) { if (x.payload.client_id === item.payload.client_id) x.erreur = e.message; });
        ecrireFile(id, m); return suivant(index + 1);
      });
  })(0).then(function () { syncEnCours = null; majEtat(); if (!enAttente(id).length && navigator.onLine) bandeau(""); if (pageCourante === "historique" && session) rendreHistorique(); },
             function () { syncEnCours = null; majEtat(); });
  return syncEnCours;
}
function majEtat(phase) {
  var el = $("etat"); if (!el) return;
  var l = enAttente(), n = l.length, refus = l.filter(function (x) { return x.erreur; }).length;
  el.className = "etat";
  if (phase === "envoi" && n) { el.classList.add("attente"); $("etatTexte").textContent = "Envoi de " + n + "…"; return; }
  if (!navigator.onLine) { el.classList.add("horsligne"); $("etatTexte").textContent = n ? "Hors ligne · " + n + " en attente" : "Hors ligne"; }
  else if (n) { el.classList.add("attente"); $("etatTexte").textContent = n + " en attente d'envoi" + (refus ? " (" + refus + " refusée" + (refus > 1 ? "s" : "") + ")" : ""); }
  else $("etatTexte").textContent = "En ligne · tout est enregistré";
}
$("etat").addEventListener("click", function () { if (session) { synchroniser(); if (CATALOGUE.length) afficherPage("historique"); } });
window.addEventListener("online", function () { majEtat(); if (session) { synchroniser(); if (CATALOGUE.length) demarrerCatalogueSilencieux(); } });
window.addEventListener("offline", function () { majEtat(); });
document.addEventListener("visibilitychange", function () { if (!document.hidden && session && enAttente().length) synchroniser(); });
setInterval(function () { if (session && navigator.onLine && enAttente().length) synchroniser(); }, 30000);
/** Au retour d'Internet : rafraîchit la copie locale du catalogue sans interrompre le travail. */
function demarrerCatalogueSilencieux() {
  rpc("catalogue", { p_token: session.token }).then(function (cat) {
    if (cat && cat.length) {
      ecrireLocal("cld_catalogue", { date: new Date().toISOString(), data: cat });
      CATALOGUE = cat;
      ARTICLES = uniq(CATALOGUE.map(function (r) { return r[0]; })).sort();
      TOUTES_COULEURS = uniq(CATALOGUE.map(function (r) { return r[1]; })).sort(comparerCouleurs);
      TOUTES_TAILLES = uniq(CATALOGUE.map(function (r) { return r[2]; })).sort(comparerTailles);
      bandeau(""); tout();
    }
  }).catch(function () {});
}

/* ===================== Événements : génération ===================== */
$("type").innerHTML = TYPES.map(function (t) { return '<option value="' + esc(t[0]) + '">' + esc(t[1]) + '</option>'; }).join("");
$("recherche").addEventListener("input", function (e) { st.recherche = e.target.value; rendreArticles(); });
$("articles").addEventListener("click", function (e) { var b = e.target.closest(".chip"); if (!b) return; st.article = b.dataset.v; st.couleur = ""; st.manche = ""; st.tailles = []; tout(); });
$("couleurs").addEventListener("click", function (e) { var b = e.target.closest(".chip"); if (!b) return; st.couleur = b.dataset.v; st.manche = ""; st.tailles = [];
  if (!st.spe) { var ms = manchesListe(); if (ms.length === 1) st.manche = ms[0]; } tout(); });
$("manches").addEventListener("click", function (e) { var b = e.target.closest(".chip"); if (!b) return; st.manche = (st.spe && st.manche === b.dataset.v) ? "" : b.dataset.v; if (!st.spe) st.tailles = []; tout(); });
$("tailles").addEventListener("click", function (e) { var b = e.target.closest(".chip"); if (!b) return; var t = b.dataset.v, i = st.tailles.indexOf(t);
  if (i === -1) st.tailles.push(t); else st.tailles.splice(i, 1); rendreSelection(); rendreApercu(); });
$("btnTout").addEventListener("click", function () { st.tailles = taillesListe().slice(0, 100); rendreSelection(); rendreApercu(); });
$("btnAucune").addEventListener("click", function () { st.tailles = []; rendreSelection(); rendreApercu(); });
$("of").addEventListener("input", function (e) { st.of = e.target.value; rendreApercu(); });
$("type").addEventListener("change", function (e) { st.type = e.target.value; rendreApercu(); });
$("spe").addEventListener("change", function (e) { st.spe = e.target.checked; st.tailles = [];
  if (!st.spe) { if (st.couleur && couleursListe().indexOf(st.couleur) === -1) { st.couleur = ""; st.manche = ""; }
    else { var ms = manchesListe(); if (st.manche && ms.indexOf(st.manche) === -1) st.manche = ""; if (!st.manche && ms.length === 1) st.manche = ms[0]; } }
  tout(); });
$("btnGenerer").addEventListener("click", generer);

/* ===================== Historique ===================== */
var HISTO = [], ouvert = {};
var fmtDate = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
function chargerHistorique() {
  $("hTable").innerHTML = '<div class="vide">Chargement…</div>';
  rpc("historique", { p_token: session.token, p_depuis: $("hDepuis").value || null, p_jusqua: $("hJusqua").value || null,
                      p_atelier: $("hAtelier").value || null, p_limite: 1000 })
    .then(function (r) {
      HISTO = (r && r.generations) || [];
      if (session.role === "admin" && r && r.ateliers) {
        var v = $("hAtelier").value;
        $("hAtelier").innerHTML = '<option value="">Tous</option>' + r.ateliers.map(function (a) { return '<option value="' + esc(a.id) + '">' + esc(a.nom) + '</option>'; }).join("");
        $("hAtelier").value = v;
      }
      rendreHistorique();
    })
    .catch(function (e) {
      if (e.code === "reseau") { HISTO = []; rendreHistorique(); toast("Hors ligne : seules les générations gardées sur ce poste sont affichées.", true); return; }
      $("hTable").innerHTML = ""; gererErreur(e, "Historique indisponible");
    });
}
/** Générations encore sur ce poste (pas encore reçues par la base), au format de l'historique. */
function enAttenteCommeHisto() {
  var recus = {}; HISTO.forEach(function (g) { if (g.client_id) recus[g.client_id] = 1; });
  return enAttente().filter(function (x) { return !recus[x.payload.client_id]; }).map(function (x) {
    var p = x.payload;
    return { id: "attente-" + p.client_id, client_id: p.client_id, cree_le: p.genere_le, atelier: session.atelier, atelier_id: session.atelier_id,
      identifiant: session.identifiant, article: p.article, couleur: p.couleur, manche: p.manche, modele: p.modele, type: p.type,
      num_of: p.num_of, spe: p.spe, nb_etiquettes: p.etiquettes.length, nom_zip: p.nom_zip, etiquettes: p.etiquettes,
      en_attente: true, erreur: x.erreur };
  });
}
function histoFiltre() {
  var q = $("hRecherche").value.trim().toUpperCase();
  return enAttenteCommeHisto().concat(HISTO).filter(function (g) { return !q || (g.num_of + " " + g.modele + " " + g.article).toUpperCase().indexOf(q) !== -1; });
}
function rendreHistorique() {
  var l = histoFiltre(), admin = session.role === "admin";
  var nbEt = l.reduce(function (s, g) { return s + g.nb_etiquettes; }, 0), ofs = uniq(l.map(function (g) { return g.num_of; })).length;
  $("hResume").innerHTML = '<span><strong>' + l.length + '</strong>génération' + (l.length > 1 ? "s" : "") + '</span><span><strong>' + nbEt + '</strong>étiquettes (fichiers)</span><span><strong>' + ofs + '</strong>OF différent' + (ofs > 1 ? "s" : "") + '</span>';
  if (!l.length) { $("hTable").innerHTML = '<div class="vide">Aucune génération sur cette période.</div>'; return; }
  $("hTable").innerHTML = '<table><thead><tr><th>Date</th>' + (admin ? '<th>Atelier</th>' : '') + '<th>OF</th><th>Modèle</th><th>Couleur</th><th>Tailles</th><th class="num">Nb</th></tr></thead><tbody>' +
    l.map(function (g) {
      var tailles = (g.etiquettes || []).map(function (t) { return t.taille; }).join(", ");
      var ligne = '<tr class="ligne-gen' + (g.en_attente ? ' attente' : '') + '" data-id="' + esc(g.id) + '"><td>' + esc(fmtDate.format(new Date(g.cree_le))) + '</td>' + (admin ? '<td><span class="pastille">' + esc(g.atelier) + '</span></td>' : '') +
        '<td class="mono">' + esc(g.num_of) + '</td><td><strong>' + esc(g.modele) + '</strong>' + (g.spe ? ' <span class="pastille spe">SPE</span>' : '') +
        (g.en_attente ? ' <span class="pastille" title="' + esc(g.erreur || "Sera envoyée au retour d'Internet") + '">' + (g.erreur ? "refusée par la base" : "en attente d'envoi") + '</span>' : (g.hors_ligne ? ' <span class="pastille spe" title="Générée hors ligne, reçue plus tard">hors ligne</span>' : '')) + '</td><td>' + esc(g.couleur) + '</td><td>' + esc(tailles) + '</td><td class="num">' + g.nb_etiquettes + '</td></tr>';
      if (ouvert[g.id]) {
        ligne += '<tr class="detail"><td colspan="' + (admin ? 7 : 6) + '"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:8px"><span>' + esc(g.type) + (g.manche ? ' · ' + esc(mancheLabel(g.manche)[0]) : '') + ' · par ' + esc(g.identifiant) + ' · <span class="mono">' + esc(g.nom_zip) + '</span></span>' +
          '<button class="btn small" data-retelecharger="' + esc(g.id) + '">Télécharger à nouveau</button></div>' +
          '<table><thead><tr><th>Taille</th><th>Code-barres</th><th>Fichier</th></tr></thead><tbody>' +
          (g.etiquettes || []).map(function (t) { return '<tr><td><strong>' + esc(t.taille) + '</strong></td><td class="mono">' + esc(t.code_barre) + '</td><td class="mono">' + esc(t.nom_fichier) + '</td></tr>'; }).join("") +
          '</tbody></table></td></tr>';
      }
      return ligne;
    }).join("") + '</tbody></table>';
}
$("hTable").addEventListener("click", function (e) {
  var r = e.target.closest("[data-retelecharger]");
  if (r) { retelecharger(r.dataset.retelecharger, r); return; }
  var tr = e.target.closest(".ligne-gen"); if (!tr) return;
  ouvert[tr.dataset.id] = !ouvert[tr.dataset.id]; rendreHistorique();
});
/** Refait le même .zip à partir de l'historique (aucun nouvel enregistrement). */
function retelecharger(id, bouton) {
  var g = enAttenteCommeHisto().concat(HISTO).filter(function (x) { return x.id === id; })[0]; if (!g) return;
  var m = mancheLabel(g.manche);
  var es = (g.etiquettes || []).map(function (t) { return { modele: g.modele, type: g.type, of: g.num_of, codeBarre: t.code_barre, couleur: g.couleur, manche: m ? m[0] + " / " + m[1] : "", taille: t.taille }; });
  var noms = (g.etiquettes || []).map(function (t) { return t.nom_fichier; });
  var dossier = (g.nom_zip || "etiquettes").replace(/\.zip$/i, "");
  bouton.disabled = true;
  construireZip(es, noms, dossier, new Date(g.cree_le))
    .then(function (z) { telecharger(z, dossier + ".zip"); toast("Copie téléchargée (pas de nouvel enregistrement)."); })
    .catch(function (e) { toast("Échec : " + (e.message || e), true); })
    .then(function () { bouton.disabled = false; });
}
["hDepuis", "hJusqua", "hAtelier"].forEach(function (id) { $(id).addEventListener("change", chargerHistorique); });
$("hActualiser").addEventListener("click", chargerHistorique);
$("hRecherche").addEventListener("input", rendreHistorique);
$("hExporter").addEventListener("click", function () {
  var l = histoFiltre(); if (!l.length) { toast("Rien à exporter.", true); return; }
  function c(v) { v = String(v == null ? "" : v); return /[;"\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  var lignes = [["Date", "Atelier", "Compte", "OF", "Modèle", "Article", "Couleur", "Manche", "Type", "SPE", "Taille", "Code-barres", "Fichier"].join(";")];
  l.forEach(function (g) { (g.etiquettes || []).forEach(function (t) {
    lignes.push([fmtDate.format(new Date(g.cree_le)), g.atelier, g.identifiant, g.num_of, g.modele, g.article, g.couleur, g.manche, g.type, g.spe ? "oui" : "non", t.taille, t.code_barre, t.nom_fichier].map(c).join(";"));
  }); });
  telecharger("﻿" + lignes.join("\r\n") + "\r\n", "historique_etiquettes_" + horodatage(new Date()) + ".csv", "text/csv;charset=utf-8");
});

/* ===================== Comptes (Achats) ===================== */
function chargerComptes() {
  $("cTable").innerHTML = '<div class="vide">Chargement…</div>';
  rpc("comptes_liste", { p_token: session.token }).then(function (l) {
    l = l || [];
    $("cTable").innerHTML = '<table><thead><tr><th>Compte</th><th>Atelier</th><th>Rôle</th><th>Dernière connexion</th><th>Nouveau code</th></tr></thead><tbody>' +
      l.map(function (c) {
        return '<tr><td><strong>' + esc(c.nom) + '</strong><div class="mono" style="color:var(--muted)">' + esc(c.identifiant) + '</div></td><td>' + esc(c.atelier) + '</td><td>' + (c.role === "admin" ? "Achats" : "Façonnier") + (c.bloque ? ' <span class="pastille">bloqué</span>' : '') + '</td>' +
          '<td>' + (c.derniere_connexion ? esc(fmtDate.format(new Date(c.derniere_connexion))) : "—") + '</td>' +
          '<td><div class="form-code"><input type="text" minlength="10" maxlength="100" placeholder="10 caractères min." data-code="' + esc(c.identifiant) + '" autocomplete="off"><button class="btn small" data-valider="' + esc(c.identifiant) + '">Enregistrer</button></div></td></tr>';
      }).join("") + '</tbody></table>';
  }).catch(function (e) { $("cTable").innerHTML = ""; gererErreur(e, "Comptes indisponibles"); });
}
$("cTable").addEventListener("click", function (e) {
  var b = e.target.closest("[data-valider]"); if (!b) return;
  var id = b.dataset.valider, champ = document.querySelector('[data-code="' + id + '"]'), code = champ.value.trim();
  if (code.length < 10) { toast("Le code doit faire au moins 10 caractères.", true); champ.focus(); return; }
  b.disabled = true;
  rpc("definir_code", { p_token: session.token, p_identifiant: id, p_nouveau: code })
    .then(function () { toast("Code de « " + id + " » enregistré. Communiquez-le à la personne concernée."); chargerComptes(); })
    .catch(function (e) { gererErreur(e, "Changement refusé"); })
    .then(function () { b.disabled = false; });
});

/* ===================== Lancement ===================== */
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  navigator.serviceWorker.register("sw.js").catch(function () {});
}
session = lireSession();
if (session && session.token) demarrer(); else deconnecter();
})();
