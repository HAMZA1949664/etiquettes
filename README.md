# Étiquettes .NLBL — Clément Design

Site de génération des étiquettes Zebra Designer (.nlbl) pour les ateliers (Archipel, Nasstex) et le service Achats.

- **Connexion** par identifiant + code (un compte par atelier).
- **Génération** : article → couleur → manche → OF et type → tailles cochées → un `.zip` contenant un fichier `.nlbl` par taille, nommé `MODELE_TAILLE_OFxxxxx.nlbl`.
- **Chaque génération est enregistrée** dans la base Supabase *Label-etiquettes* (atelier, compte, date réelle, OF, modèle, couleur, chaque taille et son code-barres).
- **Sans Internet, le site continue de fonctionner** : les étiquettes sont téléchargées tout de suite, l'enregistrement est gardé sur le poste (par compte) et envoyé automatiquement dès le retour de la connexion (au retour d'Internet, à l'ouverture du site, puis toutes les 30 s). Pas de doublon si un envoi est rejoué. Le site lui-même et le catalogue restent disponibles hors ligne (service worker `sw.js` + copie locale du catalogue). La connexion d'un compte reste valable 30 jours sur le poste.
- **Historique** : chaque atelier voit ses générations ; le compte Achats voit tout, filtre par atelier / période et exporte en CSV (Excel).
- **Comptes** (Achats) : changer le code d'un compte, débloquer un compte bloqué après 5 erreurs.

## Sécurité

- Le code de ce dépôt ne contient **aucun secret** : la clé de `assets/config.js` est une clé *publishable*, publique par conception.
- Les tables de la base sont verrouillées (RLS activée, aucun accès direct). Seules 7 fonctions sont appelables, et toutes vérifient la session :
  `connexion`, `deconnexion`, `catalogue`, `enregistrer_generation`, `historique`, `comptes_liste`, `definir_code`.
- Codes chiffrés (bcrypt), sessions de 12 h, blocage 15 min après 5 erreurs, un atelier ne voit jamais les données d'un autre.
- Le catalogue (articles et codes-barres) reste dans la base : il n'est pas publié ici.

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `index.html` | La page (connexion, génération, historique, comptes) |
| `assets/app.js` | Logique du site et appels à la base |
| `assets/regles.js` | Règles métier (couleurs, manches, tailles, EAN-13, SPE) — identiques au site principal |
| `assets/nlbl.js` | Moteur .nlbl : ZIP chiffré AES-256 (WinZip AE-1), identique au format Zebra Designer |
| `assets/modele-zebra.js` | Modèle d'étiquette cLEMENT2 (55 × 35 mm) — ne pas modifier |
| `assets/config.js` | Adresse de la base Supabase |
| `sw.js` | Garde le site sur le poste pour l'ouvrir sans Internet (changer `CACHE` à chaque nouvelle version) |

## Ajouter un article au catalogue

Dans Supabase → *Table Editor* → table `articles` → *Insert row* (article, couleur, taille, manche, code_barre à 13 chiffres). Il apparaît sur le site à la connexion suivante.
