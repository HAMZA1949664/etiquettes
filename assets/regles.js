/* Règles métier — copie fidèle de src/lib/label-data.ts et src/lib/tailles.ts du site. */
/* ===================== Règles métier (copie de src/lib/label-data.ts) ===================== */
var COULEURS = {BLC:["Blanc","White"],NOIR:["Noir","Black"],NE:["Noir","Black"],GRIS:["Gris","Grey"],VERT:["Vert","Green"],ROUG:["Rouge","Red"],ORAN:["Orange","Orange"],JA:["Jaune","Yellow"],JAUN:["Jaune","Yellow"],BE:["Beige","Beige"],BEIG:["Beige","Beige"],BR:["Brun","Brown"],BRU:["Brun","Brown"],MARR:["Marron","Brown"],MARI:["Marine","Navy"],ROI:["Bleu Roi","Royal Blue"],DEN:["Denim","Denim"],KAK:["Kaki","Khaki"],KHAK:["Kaki","Khaki"],TAUP:["Taupe","Taupe"],MOKA:["Moka","Mocha"],CHOC:["Chocolat","Chocolate"],CARA:["Caramel","Caramel"],FUSH:["Fuchsia","Fuchsia"],BORD:["Bordeaux","Burgundy"],PIST:["Pistache","Pistachio"],PARM:["Parme","Lavender"],ANTH:["Anthracite","Charcoal"],ACIE:["Acier","Steel Grey"],KIRS:["Kirsch","Cherry"],FICE:["Ficelle","String"],SOUR:["Gris souris","Mouse Grey"],PO:["Poudré","Powder Pink"],OPER:["Opéra","Opera"],AR:["Argent","Silver"],AN:["Anis","Anise"],ES:["Écru","Ecru"],PDP2:["Peau de pêche","Peach"],UNI:["Uni","Plain"]};
var MANCHES = {"Longues / Long":["Manches longues","Long sleeves"],"Courtes / Short":["Manches courtes","Short sleeves"],"3/4 / 3/4":["Manches 3/4","3/4 sleeves"]};
var TYPES = [["Veste|Jacket","Veste"],["Tablier|Apron","Tablier"],["Pantalon Cuisine|Kitchen pants","Pantalon Cuisine"],["Pantalon Service|Service pants","Pantalon Service"],["Toque|Chef hat","Toque"],["Polo|Polo","Polo"],["T-Shirt|T-Shirt","T-Shirt"]];

function couleurLabel(c){ return COULEURS[c] || [c, c]; }
function couleurAffichee(code){ var p=couleurLabel(code), fr=p[0], en=p[1]; if(!en||en===fr) return fr; var b=en+" / "+fr; return b.length<=20?b:fr; }
function comparerCouleurs(a,b){ var r=couleurLabel(a)[0].localeCompare(couleurLabel(b)[0],"fr",{sensitivity:"base"}); return r!==0?r:a.localeCompare(b,"fr"); }
function mancheLabel(m){ if(!m) return null; return MANCHES[m] || [m,m]; }
function sleeveAbbrev(m){ return m==="Longues / Long"?"ML":m==="Courtes / Short"?"MC":m==="3/4 / 3/4"?"M3/4":""; }
function tailleCourte(t){
  var s=String(t).trim(), m;
  if(s==="U"||s==="TU") return ["TU","OS"]; if(s==="BEBE") return ["TBB","SBB"];
  if((m=s.match(/^(\d+\s*-\s*\d+)\s*A?$/i))){ var r=m[1].replace(/\s+/g,""); return ["T"+r+"A","S"+r+"Y"]; }
  if((m=s.match(/^T(\d+)$/i))) return ["T"+m[1],"S"+m[1]];
  if(/^\d+$/.test(s)) return ["T"+s,"S"+s];
  return [s,s];
}
var ORDRE_LIT=["XS","S","M","M+","L","XL","XXL","2XL","3XL","XXXL","4XL","5XL","6XL"];
function classer(t){
  var s=String(t).trim(), m, k;
  if(/^(U|TU|OS|UNIQUE)$/i.test(s)) return [0,0,s]; if(/^BEBE$/i.test(s)) return [1,0,s];
  if((m=s.match(/^(\d+)\s*-\s*\d+\s*A?$/i))) return [2,+m[1],s];
  k=ORDRE_LIT.indexOf(s.toUpperCase().replace(/\s+/g,"")); if(k!==-1) return [3,k,s];
  if((m=s.match(/^(?:T)?(\d+)$/i))) return [4,+m[1],s];
  if(/^SPE-$/i.test(s)) return [5,0,s]; if(/^SPE\+$/i.test(s)) return [5,1,s];
  return [6,0,s];
}
function comparerTailles(a,b){ var x=classer(a), y=classer(b); return x[0]-y[0] || x[1]-y[1] || x[2].localeCompare(y[2],"fr",{numeric:true,sensitivity:"base"}); }
function ean13Check(b12){ var s=0; for(var i=0;i<12;i++) s+=(+b12[i])*(i%2===0?1:3); return String((10-(s%10))%10); }
function ean13Valide(c){ return /^\d{13}$/.test(c) && ean13Check(c.slice(0,12))===c[12]; }
function speBarcode(a,c,m,t,of){ var str=[a,c,m,t,of].join("|"), h=0; for(var i=0;i<str.length;i++) h=(h*31+str.charCodeAt(i))>>>0; var b="99"+String(h%10000000000).padStart(10,"0"); return b+ean13Check(b); }
function calculer(rec, of, typeValue, spe){
  if(!rec||!typeValue) return null;
  var a=rec[0], c=rec[1], t=rec[2], m=rec[3], code=rec[4], mL=mancheLabel(m), sl=sleeveAbbrev(m), ty=typeValue.split("|");
  return { modele: a+(sl?" "+sl:"")+(spe?" SPE":""), type: ty[0]+" / "+ty[1], of: of.trim(),
           codeBarre: spe?speBarcode(a,c,m,t,of.trim()):code, couleur: couleurAffichee(c),
           manche: mL?mL[0]+" / "+mL[1]:"", taille: tailleCourte(t)[0] };
}
var LIMITES={modele:40,type:60,of:20,couleur:40,manche:60,taille:20};
function erreursEtiquette(e){
  var err=[];
  if(!e.of) err.push("le n° d'OF"); else if(e.of.length>LIMITES.of) err.push("un OF de 20 caractères max");
  if(!ean13Valide(e.codeBarre)) err.push("un code-barres EAN-13 valide");
  ["modele","type","couleur","taille"].forEach(function(k){ if(!e[k]) err.push("le champ "+k); else if(e[k].length>LIMITES[k]) err.push(k+" trop long"); });
  return err;
}

