// comptes.js : comptes joueurs de Sentinelle (Nifo Web), sur Supabase.
//
// Module ES autonome, sans installation. La bibliothèque supabase-js (version figée) est chargée
// à la demande depuis jsDelivr, avec son empreinte d'intégrité, comme PeerJS dans le jeu.
// L'adresse du projet et la clé publiable sont faites pour vivre dans le code client : la sécurité
// repose sur les règles d'accès de la base (voir schema.sql). Aucune clé secrète ici, jamais.
//
// Toutes les fonctions sont asynchrones et lèvent une ErreurCompte (code + message en français).

export const CONFIG = {
  url: 'https://ksaqqifkothfxgiikuxh.supabase.co',
  cle: 'sb_publishable_H2mKIT9-cXBMB2vCEVgZtg_GTd2kCmz',
  bibliotheque: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/dist/umd/supabase.js',
  empreinte: 'sha256-hO6b9FaVwd07oVlba8+w8JZyQ0YxNR/8jr6RQFRdX/Y=',
  qr: 'https://cdn.jsdelivr.net/npm/qrcode-generator@2.0.4/dist/qrcode.js',
  qrEmpreinte: 'sha256-eeyG+ChWAFsciHkFz8z8++w4Icphx/1alS+qX3ePeRw=',
  canalPresence: 'sentinelle:presence',
  ageMinimum: 15,
  cleStockage: 'nifoweb.sentinelle.compte',
  versionConditions: '2026-09-25',
};

const COLONNES_PROFIL = 'id, pseudo, avatar_color, country, created_at';
const PROFIL_COURT = 'id, pseudo, avatar_color, country';

/* ---------- erreurs en français ---------- */
export class ErreurCompte extends Error {
  constructor(code, message, origine) { super(message); this.name = 'ErreurCompte'; this.code = code; this.origine = origine; }
}
const erreur = (code, message, origine) => new ErreurCompte(code, message, origine);

const MESSAGES = {
  invalid_credentials: 'Mail ou mot de passe incorrect.',
  email_not_confirmed: "Adresse mail pas encore confirmée : ouvre le lien reçu par mail.",
  user_already_exists: 'Un compte existe déjà avec ce mail.',
  email_exists: 'Un compte existe déjà avec ce mail.',
  weak_password: 'Mot de passe trop faible : 8 signes au moins, avec des lettres et des chiffres.',
  over_email_send_rate_limit: "Trop de mails envoyés depuis le jeu : réessaie dans une heure.",
  over_request_rate_limit: "Trop d'essais : patiente quelques minutes.",
  signup_disabled: 'Les inscriptions sont fermées pour le moment.',
  email_address_invalid: 'Adresse mail invalide.',
  email_address_not_authorized: "Le jeu ne peut pas encore envoyer de mail à cette adresse (serveur d'envoi pas encore configuré).",
  otp_expired: 'Lien expiré : demande en un nouveau.',
  otp_disabled: 'Aucun compte avec ce mail : crée d’abord un compte.',
  unexpected_failure: 'Inscription refusée : pseudo déjà pris, âge ou informations invalides.',
  session_not_found: 'Session terminée : reconnecte toi.',
  '42501': 'Action non autorisée.',
  '23505': 'Cela existe déjà.',
  '23514': 'Valeur refusée par les règles du jeu.',
  '23503': 'Joueur introuvable.',
};

function traduire(e) {
  if (e instanceof ErreurCompte) return e;
  const code = String((e && (e.code || e.error_code)) || '');
  const texte = String((e && e.message) || '');
  if (MESSAGES[code]) return erreur(code, MESSAGES[code], e);
  if (/Database error saving new user/i.test(texte)) return erreur('unexpected_failure', MESSAGES.unexpected_failure, e);
  if (/Failed to fetch|NetworkError|Load failed|fetch/i.test(texte)) return erreur('RESEAU', 'Serveur injoignable : vérifie ta connexion.', e);
  return erreur(code || 'INCONNU', texte || 'Erreur inattendue.', e);
}
function verifierReponse({ data, error }) { if (error) throw traduire(error); return data; }

/* ---------- chargement de la bibliothèque ---------- */
let client = null;
let chargement = null;

function chargerScript(src, integrite, present) {
  if (present()) return Promise.resolve();
  return new Promise((ok, ko) => {
    const s = document.createElement('script');
    s.src = src; s.integrity = integrite; s.crossOrigin = 'anonymous'; s.async = true; s.referrerPolicy = 'no-referrer';
    const fin = (e) => { clearTimeout(minuteur); if (e) { s.remove(); ko(e); } else ok(); };
    const minuteur = setTimeout(() => fin(erreur('BIBLIOTHEQUE', 'Chargement trop long : vérifie ta connexion.')), 20000);
    s.onload = () => fin(present() ? null : erreur('BIBLIOTHEQUE', 'Bibliothèque absente après chargement.'));
    s.onerror = () => fin(erreur('BIBLIOTHEQUE', 'Chargement refusé (réseau coupé ou empreinte différente).'));
    document.head.appendChild(s);
  });
}

// Crée le client une seule fois ; la session gardée dans l'appareil est reprise toute seule.
export function init() {
  if (client) return Promise.resolve(client);
  if (!chargement) {
    chargement = chargerScript(CONFIG.bibliotheque, CONFIG.empreinte, () => !!(window.supabase && window.supabase.createClient))
      .then(() => {
        client = window.supabase.createClient(CONFIG.url, CONFIG.cle, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: CONFIG.cleStockage },
        });
        return client;
      })
      .catch((e) => { chargement = null; throw traduire(e); });
  }
  return chargement;
}

/* ---------- contrôles avant envoi (les mêmes règles sont appliquées par la base) ---------- */
const SIGNES = 'A-Za-z0-9ÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸÆŒàâäçéèêëîïôöùûüÿæœ_.';
const RE_PSEUDO = new RegExp('^[' + SIGNES + ']+( [' + SIGNES + ']+)*$');

// Pseudo mis en forme comme dans le jeu : majuscules, espaces simples.
export function normaliserPseudo(brut) {
  let s = String(brut == null ? '' : brut);
  try { s = s.normalize('NFC'); } catch (e) {}
  return s.toUpperCase().replace(/\s+/g, ' ').trim();
}
export function verifierPseudo(pseudo) {
  const p = normaliserPseudo(pseudo);
  if (p.length < 3 || p.length > 16) return 'Pseudo : de 3 à 16 signes.';
  if (!RE_PSEUDO.test(p)) return 'Pseudo : lettres, chiffres, point, tiret bas et espaces simples seulement.';
  return '';
}
export function anneeCourante() { return new Date().getFullYear(); }
// Vérifie seulement que l'année est plausible (le seuil de 15 ans est géré à part : voir estMineur ci
// dessous, car en dessous de 15 ans l'inscription reste possible avec un accord parental).
export function verifierAge(annee) {
  const a = Number(annee);
  if (!Number.isInteger(a) || a < 1900 || a > anneeCourante()) return 'Année de naissance invalide.';
  return '';
}
// Âge minimum 15 ans (majorité numérique en France) : en dessous, la loi demande l'accord conjoint du
// mineur et d'un titulaire de l'autorité parentale (voir verifierAccordParental). L'année seule ne
// suffit pas pour le jour exact : au dessus, l'interface demande en plus de certifier avoir 15 ans révolus.
export function estMineur(annee) {
  const a = Number(annee);
  if (!Number.isInteger(a) || a < 1900 || a > anneeCourante()) return false;
  return anneeCourante() - a < CONFIG.ageMinimum;
}
export function verifierAccordParental(annee, accorde) {
  return estMineur(annee) && !accorde ? "Accord d'un parent ou tuteur requis en dessous de 15 ans." : '';
}
export function verifierMail(mail) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(mail || '').trim()) ? '' : 'Adresse mail invalide.';
}
export function verifierMotDePasse(mdp) {
  const m = String(mdp || '');
  if (m.length < 8) return 'Mot de passe : 8 signes au moins.';
  if (!/[A-Za-zÀ-ÿ]/.test(m) || !/[0-9]/.test(m)) return 'Mot de passe : au moins une lettre et un chiffre.';
  return '';
}
// Page où revient le lien reçu par mail : doit figurer dans les adresses autorisées du projet.
export function adresseRetour() { return location.origin + location.pathname; }

/* ---------- compte : inscription, connexion, lien magique, déconnexion, session ---------- */
// Contrôles communs à l'inscription par mot de passe et par lien magique : pseudo, âge (avec l'accord
// parental en dessous de 15 ans), mail, conditions. motDePasse est contrôlé à part (absent pour un lien magique).
function controlerInscription({ pseudo, anneeNaissance, ageCertifie, accordParental, email, conditionsAcceptees }) {
  const p = normaliserPseudo(pseudo), mineur = estMineur(anneeNaissance);
  return verifierPseudo(p) || verifierAge(anneeNaissance)
    || (mineur ? verifierAccordParental(anneeNaissance, accordParental) : (ageCertifie ? '' : "Coche la case : j'ai 15 ans ou plus."))
    || verifierMail(email)
    || (conditionsAcceptees ? '' : "Accepte les conditions d'utilisation et la politique de confidentialité.");
}
function metadonneesInscription({ pseudo, anneeNaissance, couleur, pays, accordParental }) {
  const mineur = estMineur(anneeNaissance);
  return {
    pseudo: normaliserPseudo(pseudo),
    birth_year: Number(anneeNaissance),
    avatar_color: /^#[0-9a-fA-F]{6}$/.test(couleur || '') ? couleur.toLowerCase() : '#27e4ff',
    country: /^[A-Za-z]{2}$/.test(pays || '') ? pays.toUpperCase() : null,
    age_certifie: !mineur,
    parental_consent: mineur ? !!accordParental : false,
    conditions_version: CONFIG.versionConditions,
    conditions_acceptees_le: new Date().toISOString(),
  };
}
export async function inscrire({ pseudo, email, motDePasse, anneeNaissance, couleur, pays, ageCertifie, accordParental, conditionsAcceptees }) {
  const p = normaliserPseudo(pseudo);
  const probleme = controlerInscription({ pseudo, anneeNaissance, ageCertifie, accordParental, email, conditionsAcceptees }) || verifierMotDePasse(motDePasse);
  if (probleme) throw erreur('VALIDATION', probleme);
  const sb = await init();
  if (!(await pseudoDisponible(p))) throw erreur('PSEUDO_PRIS', 'Ce pseudo est déjà pris : choisis en un autre.');
  const r = await sb.auth.signUp({
    email: String(email).trim(),
    password: motDePasse,
    options: { emailRedirectTo: adresseRetour(), data: metadonneesInscription({ pseudo, anneeNaissance, couleur, pays, accordParental }) },
  });
  const data = verifierReponse(r);
  // mail déjà inscrit et confirmé : le service répond sans erreur mais sans identité
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) throw erreur('email_exists', MESSAGES.email_exists);
  return { session: data.session, utilisateur: data.user, confirmationEnvoyee: !data.session };
}
// Inscription par lien magique (sans mot de passe) : même contrôles et mêmes métadonnées que l'inscription
// par mot de passe, mais shouldCreateUser laisse le service créer le compte s'il n'existe pas encore. Le
// joueur reçoit un mail avec un lien : ouvrir ce lien crée la session, exactement comme lienMagique().
export async function inscrireLienMagique({ pseudo, email, anneeNaissance, couleur, pays, ageCertifie, accordParental, conditionsAcceptees }) {
  const probleme = controlerInscription({ pseudo, anneeNaissance, ageCertifie, accordParental, email, conditionsAcceptees });
  if (probleme) throw erreur('VALIDATION', probleme);
  const sb = await init();
  if (!(await pseudoDisponible(pseudo))) throw erreur('PSEUDO_PRIS', 'Ce pseudo est déjà pris : choisis en un autre.');
  verifierReponse(await sb.auth.signInWithOtp({
    email: String(email).trim(),
    options: { shouldCreateUser: true, emailRedirectTo: adresseRetour(), data: metadonneesInscription({ pseudo, anneeNaissance, couleur, pays, accordParental }) },
  }));
  return true;
}

export async function connecter(email, motDePasse) {
  if (verifierMail(email)) throw erreur('VALIDATION', verifierMail(email));
  const sb = await init();
  const data = verifierReponse(await sb.auth.signInWithPassword({ email: String(email).trim(), password: String(motDePasse || '') }));
  return data.session;
}

// Lien de connexion par mail, pour un compte qui existe déjà (aucun compte n'est créé ainsi).
export async function lienMagique(email) {
  if (verifierMail(email)) throw erreur('VALIDATION', verifierMail(email));
  const sb = await init();
  verifierReponse(await sb.auth.signInWithOtp({ email: String(email).trim(), options: { shouldCreateUser: false, emailRedirectTo: adresseRetour() } }));
  return true;
}

// Renvoie le mail de confirmation d'inscription.
export async function renvoyerConfirmation(email) {
  if (verifierMail(email)) throw erreur('VALIDATION', verifierMail(email));
  const sb = await init();
  verifierReponse(await sb.auth.resend({ type: 'signup', email: String(email).trim(), options: { emailRedirectTo: adresseRetour() } }));
  return true;
}

export async function deconnecter() {
  const sb = await init();
  await arreterTempsReel();
  verifierReponse(await sb.auth.signOut({ scope: 'local' }));
  return true;
}

// Session reprise depuis l'appareil (ou revenue d'un lien reçu par mail), ou null.
export async function session() {
  const sb = await init();
  const { data, error } = await sb.auth.getSession();
  if (error) throw traduire(error);
  return data.session || null;
}
export async function monId() { const s = await session(); return s ? s.user.id : null; }
async function exigerId() { const id = await monId(); if (!id) throw erreur('HORS_LIGNE', 'Connecte toi d’abord.'); return id; }

// Prévient à chaque connexion, déconnexion ou renouvellement de session. Rend la fonction pour arrêter.
export async function surChangement(rappel) {
  const sb = await init();
  const { data } = sb.auth.onAuthStateChange((evenement, s) => { try { rappel(evenement, s); } catch (e) { console.error(e); } });
  return () => data.subscription.unsubscribe();
}

/* ---------- profil ---------- */
export async function monProfil() {
  const sb = await init();
  const id = await exigerId();
  return verifierReponse(await sb.from('profiles').select(COLONNES_PROFIL).eq('id', id).maybeSingle());
}
// Pour un compte créé sans pseudo : même contrôle d'âge (et d'accord parental en dessous de 15 ans) que
// l'inscription. Insère aussi parental_consent : sans effet à 15 ans ou plus, indispensable en dessous
// (colonne ajoutée par classement.sql ; sans elle, ce chemin reste bloqué par l'ancien verrou de schema.sql
// tant que classement.sql n'a pas été lancé, comme avant).
export async function creerProfil({ pseudo, anneeNaissance, couleur, pays, accordParental }) {
  const p = normaliserPseudo(pseudo), mineur = estMineur(anneeNaissance);
  const probleme = verifierPseudo(p) || verifierAge(anneeNaissance) || (mineur ? verifierAccordParental(anneeNaissance, accordParental) : '');
  if (probleme) throw erreur('VALIDATION', probleme);
  const sb = await init();
  const id = await exigerId();
  const ligne = { id, pseudo: p, birth_year: Number(anneeNaissance), avatar_color: couleur || '#27e4ff', country: pays || null };
  // parental_consent : colonne ajoutée par classement.sql, avec son propre droit d'écriture. Envoyée
  // seulement pour un mineur (jamais pour 15 ans ou plus), pour ne rien changer au chemin existant tant
  // que classement.sql n'a pas été lancé (une valeur sur une colonne non accordée ferait échouer tout l'insert).
  if (mineur) ligne.parental_consent = !!accordParental;
  return verifierReponse(await sb.from('profiles').insert(ligne).select(COLONNES_PROFIL).single());
}
export async function modifierProfil({ pseudo, couleur, pays } = {}) {
  const sb = await init();
  const id = await exigerId();
  const champs = {};
  if (pseudo !== undefined) {
    const p = normaliserPseudo(pseudo);
    const probleme = verifierPseudo(p);
    if (probleme) throw erreur('VALIDATION', probleme);
    champs.pseudo = p;
  }
  if (couleur !== undefined) champs.avatar_color = couleur;
  if (pays !== undefined) champs.country = pays ? String(pays).toUpperCase() : null;
  return verifierReponse(await sb.from('profiles').update(champs).eq('id', id).select(COLONNES_PROFIL).single());
}
export async function pseudoDisponible(pseudo) {
  const sb = await init();
  return verifierReponse(await sb.rpc('pseudo_disponible', { candidat: normaliserPseudo(pseudo) })) === true;
}

/* ---------- recherche par pseudo (exact ou début, 3 signes au moins) ---------- */
export async function rechercher(texte) {
  const q = normaliserPseudo(texte);
  if (q.length < 3) return [];
  const sb = await init();
  await exigerId();
  return verifierReponse(await sb.rpc('rechercher_joueurs', { recherche: q })) || [];
}

/* ---------- amis ---------- */
// Liste unique : { id, statut: 'ami' | 'recue' | 'envoyee', depuis, joueur: { id, pseudo, avatar_color, country } }
export async function amis() {
  const sb = await init();
  const moi = await exigerId();
  const lignes = verifierReponse(await sb.from('friendships')
    .select('id, status, created_at, requester, addressee, demandeur:profiles!friendships_requester_fkey(' + PROFIL_COURT + '), destinataire:profiles!friendships_addressee_fkey(' + PROFIL_COURT + ')')
    .order('created_at', { ascending: false }));
  return (lignes || []).map((l) => ({
    id: l.id,
    statut: l.status === 'accepted' ? 'ami' : l.addressee === moi ? 'recue' : 'envoyee',
    depuis: l.created_at,
    joueur: l.requester === moi ? l.destinataire : l.demandeur,
  }));
}
// Demande d'ami ; si l'autre m'a déjà demandé, j'accepte sa demande.
export async function demanderAmi(joueurId) {
  const sb = await init();
  const moi = await exigerId();
  if (!joueurId || joueurId === moi) throw erreur('VALIDATION', 'Choisis un autre joueur.');
  const existantes = verifierReponse(await sb.from('friendships').select('id, status, requester, addressee')
    .or('and(requester.eq.' + moi + ',addressee.eq.' + joueurId + '),and(requester.eq.' + joueurId + ',addressee.eq.' + moi + ')'));
  const l = existantes && existantes[0];
  if (l) {
    if (l.status === 'pending' && l.addressee === moi) return accepterAmi(l.id);
    return { id: l.id, statut: l.status === 'accepted' ? 'ami' : 'envoyee', deja: true };
  }
  const n = verifierReponse(await sb.from('friendships').insert({ requester: moi, addressee: joueurId }).select('id').single());
  return { id: n.id, statut: 'envoyee', deja: false };
}
export async function demanderAmiParPseudo(pseudo) {
  const p = normaliserPseudo(pseudo);
  const trouve = (await rechercher(p)).find((j) => normaliserPseudo(j.pseudo) === p);
  if (!trouve) throw erreur('INTROUVABLE', 'Aucun joueur avec ce pseudo exact.');
  return demanderAmi(trouve.id);
}
export async function accepterAmi(amitieId) {
  const sb = await init();
  const moi = await exigerId();
  const l = verifierReponse(await sb.from('friendships').update({ status: 'accepted' }).eq('id', amitieId).eq('addressee', moi).select('id').maybeSingle());
  if (!l) throw erreur('INTROUVABLE', 'Demande introuvable ou déjà traitée.');
  return { id: l.id, statut: 'ami', deja: false };
}
// Refuser une demande reçue, annuler une demande envoyée ou retirer un ami : la ligne disparaît.
export async function retirerAmi(amitieId) {
  const sb = await init();
  await exigerId();
  verifierReponse(await sb.from('friendships').delete().eq('id', amitieId));
  return true;
}
export const refuserAmi = retirerAmi;

/* ---------- invitations dans une salle (le jeu lui même reste sur PeerJS) ---------- */
// Lien de partage d'une salle : même forme que le jeu (?salle=CODE).
export function lienInvitation(codeSalle, base) {
  return (base || (location.origin + location.pathname)) + '?salle=' + encodeURIComponent(String(codeSalle || '').toUpperCase());
}
// Invite un ami (demande acceptée) : annule l'invitation précédente encore en attente, crée la nouvelle
// (valable 10 minutes) et rend aussi le lien de partage, utilisable par n'importe qui.
export async function inviter(joueurId, codeSalle, base) {
  const code = String(codeSalle || '').toUpperCase();
  if (!/^[A-Z0-9]{1,12}$/.test(code)) throw erreur('VALIDATION', 'Code de salle invalide.');
  const sb = await init();
  const moi = await exigerId();
  verifierReponse(await sb.from('invitations').update({ status: 'cancelled' }).eq('from_user', moi).eq('to_user', joueurId).eq('status', 'pending'));
  const r = await sb.from('invitations').insert({ from_user: moi, to_user: joueurId, room_code: code }).select('id, room_code, created_at, expires_at, status').single();
  if (r.error && String(r.error.code) === '42501') throw erreur('PAS_AMI', 'On ne peut inviter que ses amis (demande acceptée). Le lien de partage, lui, marche pour tout le monde.', r.error);
  return { invitation: verifierReponse(r), lien: lienInvitation(code, base) };
}
// Invitations reçues encore valables, avec le pseudo de l'expéditeur.
export async function invitationsRecues() {
  const sb = await init();
  const moi = await exigerId();
  const lignes = verifierReponse(await sb.from('invitations')
    .select('id, room_code, created_at, expires_at, status, from_user, expediteur:profiles!invitations_from_user_fkey(' + PROFIL_COURT + ')')
    .eq('to_user', moi).eq('status', 'pending').gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false }));
  return (lignes || []).map(formerInvitation);
}
function formerInvitation(l) {
  return { id: l.id, code: l.room_code, statut: l.status, creee: l.created_at, expire: l.expires_at, de: l.expediteur || { id: l.from_user } };
}
export async function repondreInvitation(invitationId, accepter) {
  const sb = await init();
  const moi = await exigerId();
  const l = verifierReponse(await sb.from('invitations').update({ status: accepter ? 'accepted' : 'declined' })
    .eq('id', invitationId).eq('to_user', moi).select('id, room_code, status').maybeSingle());
  if (!l) throw erreur('EXPIREE', 'Invitation expirée ou déjà traitée.');
  return { id: l.id, code: l.room_code, statut: l.status };
}
export async function annulerInvitation(invitationId) {
  const sb = await init();
  const moi = await exigerId();
  verifierReponse(await sb.from('invitations').update({ status: 'cancelled' }).eq('id', invitationId).eq('from_user', moi));
  return true;
}

/* ---------- temps réel : invitations en direct ---------- */
const canaux = new Set();
// recue(invitation) : nouvelle invitation pour moi ; reponse({ id, code, statut, a }) : mon ami a répondu.
// Chaque joueur ne reçoit que ses propres lignes (règles d'accès appliquées par le serveur temps réel).
export async function ecouterInvitations({ recue, reponse } = {}) {
  const sb = await init();
  const moi = await exigerId();
  try { await sb.realtime.setAuth(); } catch (e) {}
  const canal = sb.channel('invitations:' + moi)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'invitations', filter: 'to_user=eq.' + moi }, async (m) => {
      if (!recue || !m.new || m.new.status !== 'pending') return;
      const { data } = await sb.from('profiles').select(PROFIL_COURT).eq('id', m.new.from_user).maybeSingle();
      recue(formerInvitation({ ...m.new, expediteur: data || null }));
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'invitations', filter: 'from_user=eq.' + moi }, (m) => {
      if (reponse && m.new && m.new.status !== 'pending') reponse({ id: m.new.id, code: m.new.room_code, statut: m.new.status, a: m.new.to_user });
    });
  return abonner(canal);
}
function abonner(canal) {
  canaux.add(canal);
  return new Promise((ok, ko) => {
    let fini = false;
    canal.subscribe((etat, e) => {
      if (fini) return;
      if (etat === 'SUBSCRIBED') { fini = true; ok(() => fermer(canal)); }
      else if (etat === 'CHANNEL_ERROR' || etat === 'TIMED_OUT') { fini = true; fermer(canal); ko(erreur('TEMPS_REEL', 'Temps réel indisponible (' + etat + ').', e)); }
    });
  });
}
async function fermer(canal) { canaux.delete(canal); try { await client.removeChannel(canal); } catch (e) {} }
async function arreterTempsReel() { for (const c of [...canaux]) await fermer(c); }

/* ---------- temps réel : présence des joueurs connectés ---------- */
// Canal privé sentinelle:presence, réservé aux joueurs qui ont un profil.
// etat : texte libre court, par exemple 'menu', 'salle' ou 'partie'.
// rappel(liste) reçoit à chaque changement [{ id, pseudo, couleur, etat, depuis }].
// L'annonce vient du client : pour un ami, afficher le pseudo de la liste d'amis et ne prendre
// ici que le point EN LIGNE.
export async function presence(etat, rappel) {
  const sb = await init();
  const moi = await exigerId();
  const profil = await monProfil();
  if (!profil) throw erreur('SANS_PROFIL', 'Complète ton profil pour apparaître en ligne.');
  try { await sb.realtime.setAuth(); } catch (e) {}
  const canal = sb.channel(CONFIG.canalPresence, { config: { private: true, presence: { key: moi } } });
  let annonce = { id: moi, pseudo: profil.pseudo, couleur: profil.avatar_color, etat: String(etat || 'menu').slice(0, 20), depuis: new Date().toISOString() };
  const liste = () => Object.entries(canal.presenceState()).map(([id, metas]) => {
    const m = metas[metas.length - 1] || {};
    return { id, pseudo: String(m.pseudo || '').slice(0, 16), couleur: m.couleur, etat: m.etat, depuis: m.depuis };
  });
  canal.on('presence', { event: 'sync' }, () => { if (rappel) rappel(liste()); });
  const arreter = await abonner(canal);
  await canal.track(annonce);
  return {
    liste,
    changer: async (nouvelEtat) => { annonce = { ...annonce, etat: String(nouvelEtat || '').slice(0, 20) }; await canal.track(annonce); },
    quitter: async () => { try { await canal.untrack(); } catch (e) {} await arreter(); },
  };
}

/* ---------- joueurs récents (liste propre à chaque joueur, sur tous ses appareils) ---------- */
export async function joueursRecents(limite = 20) {
  const sb = await init();
  await exigerId();
  const lignes = verifierReponse(await sb.from('recent_players')
    .select('other, last_played_at, joueur:profiles!recent_players_other_fkey(' + PROFIL_COURT + ')')
    .order('last_played_at', { ascending: false }).limit(limite));
  return (lignes || []).map((l) => ({ id: l.other, derniere: l.last_played_at, joueur: l.joueur }));
}
// Après une partie en ligne : identifiants de compte des autres joueurs de la salle.
export async function noterJoueursRecents(ids) {
  const sb = await init();
  const moi = await exigerId();
  const maintenant = new Date().toISOString();
  const lignes = [...new Set((ids || []).map(String))]
    .filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) && id !== moi)
    .slice(0, 16).map((other) => ({ owner: moi, other, last_played_at: maintenant }));
  if (!lignes.length) return 0;
  verifierReponse(await sb.from('recent_players').upsert(lignes, { onConflict: 'owner,other' }));
  return lignes.length;
}

/* ---------- record et classement hebdomadaire (classement.sql, écrit à part, pas encore lancé partout) ----------
   Tant que classement.sql n'a pas été lancé par le propriétaire, la table et les fonctions ci dessous
   n'existent pas encore côté serveur : indisponible(e) le reconnaît et chaque fonction rend un simple
   { dispo: false } au lieu de lever une erreur, pour que l'interface affiche BIENTÔT sans jamais planter. */
function indisponible(e) {
  const code = String((e && e.code) || '');
  const texte = String((e && e.message) || '');
  return code === '42P01' || code === '42703' || code === 'PGRST202' || code === 'PGRST204' || code === 'PGRST205'
    || /schema cache|does not exist|could not find/i.test(texte);
}
// Envoie le score d'une partie terminée (score : touches marquées ; dureeMs : durée réelle de la partie).
// Sans compte, le score reste seulement local (voir best sur l'appareil) : cette fonction suppose déjà
// une session (comme les autres fonctions qui exigent un identifiant).
export async function enregistrerScore(score, dureeMs) {
  const sb = await init();
  const id = await exigerId();
  try {
    verifierReponse(await sb.from('match_scores').insert({ player: id, score: Math.round(Number(score) || 0), duration_ms: Math.round(Number(dureeMs) || 0) }));
    return { ok: true, dispo: true };
  } catch (e) {
    if (indisponible(e)) return { ok: false, dispo: false };
    throw traduire(e);
  }
}
// Meilleur score de toujours du joueur connecté, gardé entre appareils (dispo:false : classement.sql pas
// encore lancé, ou pas de score envoyé pour l'instant).
export async function monRecord() {
  const id = await monId();
  if (!id) return { dispo: false, meilleur: 0, quand: null };
  const sb = await init();
  try {
    const lignes = verifierReponse(await sb.rpc('mon_record'));
    const l = (lignes || [])[0];
    return { dispo: true, meilleur: l ? Number(l.meilleur) : 0, quand: l ? l.le : null };
  } catch (e) {
    if (indisponible(e)) return { dispo: false, meilleur: 0, quand: null };
    throw traduire(e);
  }
}
// Classement de la semaine en cours (reset chaque lundi), du plus haut score au plus bas ; ouvert sans
// compte (dispo:false : classement.sql pas encore lancé). { dispo, lignes: [{ rang, pseudo, couleur, score }] }
export async function classementSemaine(limite = 20) {
  const sb = await init();
  try {
    const lignes = verifierReponse(await sb.rpc('classement_semaine', { limite }));
    return { dispo: true, lignes: (lignes || []).map((l) => ({ rang: Number(l.rang), pseudo: l.pseudo, couleur: l.avatar_color, score: Number(l.score) })) };
  } catch (e) {
    if (indisponible(e)) return { dispo: false, lignes: [] };
    throw traduire(e);
  }
}
// Rang du joueur connecté dans le classement de la semaine, même hors du haut du tableau (rang:null s'il
// n'a pas encore de score cette semaine ; dispo:false : classement.sql pas encore lancé).
export async function monRangSemaine() {
  const id = await monId();
  if (!id) return { dispo: false, rang: null, score: 0 };
  const sb = await init();
  try {
    const lignes = verifierReponse(await sb.rpc('mon_rang_semaine'));
    const l = (lignes || [])[0];
    return { dispo: true, rang: l ? Number(l.rang) : null, score: l ? Number(l.score) : 0 };
  } catch (e) {
    if (indisponible(e)) return { dispo: false, rang: null, score: 0 };
    throw traduire(e);
  }
}

/* ---------- zone d'âge et signalement (mineurs.sql, écrit à part, pas encore lancé) ----------
   Même principe que le bloc précédent : tant que mineurs.sql n'a pas été lancé, ma_zone() et
   la table signalements n'existent pas encore côté serveur ; indisponible(e) le reconnaît et
   chaque fonction rend { dispo: false } au lieu de lever une erreur. Le jeu garde en attendant
   une zone calculée localement (voir nifo-web-sentinelle.html) : ce module ne fait ici que
   préparer l'appel futur, il n'est branché sur aucune table réelle pour l'instant. */
const uuidOk = (u) => typeof u === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(u);
// Zone d'âge du joueur connecté (moins_13, 13_15, 16_17, adulte), calculée côté serveur à
// partir de sa date de naissance, jamais transmise elle même. dispo:false : mineurs.sql pas
// encore lancé, ou joueur non connecté.
export async function maZone() {
  const id = await monId();
  if (!id) return { dispo: false, zone: null };
  const sb = await init();
  try {
    const zone = verifierReponse(await sb.rpc('ma_zone'));
    return { dispo: true, zone: zone || null };
  } catch (e) {
    if (indisponible(e)) return { dispo: false, zone: null };
    throw traduire(e);
  }
}
// Signalement d'un message ou d'un comportement pendant une partie en ligne. signaleId : le
// compte visé si connu (vide pour un joueur sans compte relié) ; signalePseudo : son pseudo
// affiché dans la salle, gardé même sans compte pour qu'une personne puisse instruire le
// signalement. dispo:false : mineurs.sql pas encore lancé (voir l'appel, côté jeu, qui montre
// alors quand même une confirmation « envoyé » au joueur et garde le signalement en attente
// localement, jamais d'erreur affichée pour cette seule raison).
export async function signaler({ signaleId, signalePseudo, salleCode, zone, contenuSignale, motif }) {
  const sb = await init();
  const moi = await exigerId();
  const ligne = {
    signale_par: moi,
    signale: signaleId && uuidOk(String(signaleId)) ? signaleId : null,
    signale_pseudo: signalePseudo ? String(signalePseudo).slice(0, 32) : null,
    salle_code: salleCode ? String(salleCode).slice(0, 24) : null,
    zone: zone && ['moins_13', '13_15', '16_17', 'adulte'].includes(zone) ? zone : null,
    contenu_signale: String(contenuSignale || '').slice(0, 500) || '[contenu non précisé]',
    motif: String(motif || '').slice(0, 200) || 'Non précisé',
  };
  try {
    verifierReponse(await sb.from('signalements').insert(ligne));
    return { ok: true, dispo: true };
  } catch (e) {
    if (indisponible(e)) return { ok: false, dispo: false };
    throw traduire(e);
  }
}

/* ---------- mission quotidienne (missions.sql, écrit à part, pas encore lancé) ----------
   Même principe que les deux blocs précédents : tant que missions.sql n'a pas été lancé, la table
   daily_missions n'existe pas encore côté serveur ; indisponible(e) le reconnaît et la fonction rend
   { dispo: false } au lieu de lever une erreur. Le contenu de la mission (texte, personnage, objectif)
   reste entièrement calculé côté jeu (nifo-web-sentinelle.html) : ce module ne fait que déposer le
   résultat pour le joueur connecté, jamais pour une partie en ligne (mission solo seulement, voir le
   jeu). dateAAAAMMJJ : date calendaire de la mission (AAAA-MM-JJ) ; missionId : le type d'objectif
   (survie, destruction, traversee, survolteur) ; cibleTexte : son paramètre du jour, en texte, pour
   information seulement ; score : touches marquées pendant cette partie, si pertinent (facultatif).
   Rejouer et réussir la même mission le même jour n'ajoute rien (ignoreDuplicates : la ligne déjà
   présente reste telle quelle, aucune erreur montrée au joueur). */
export async function enregistrerMission(dateAAAAMMJJ, missionId, cibleTexte, score) {
  const sb = await init();
  const id = await exigerId();
  try {
    verifierReponse(await sb.from('daily_missions').upsert({
      player: id,
      mission_date: String(dateAAAAMMJJ || ''),
      mission_id: String(missionId || ''),
      target_value: String(cibleTexte || '').slice(0, 40),
      score: Number.isFinite(score) ? Math.round(score) : null,
    }, { onConflict: 'player,mission_date', ignoreDuplicates: true }));
    return { ok: true, dispo: true };
  } catch (e) {
    if (indisponible(e)) return { ok: false, dispo: false };
    throw traduire(e);
  }
}

/* ---------- billet de zone signé, pour le tchat et le vocal (billet-zone.sql, écrit à part, pas encore
   lancé) ----------
   Même principe que les blocs précédents : tant que billet-zone.sql n'a pas été lancé, les deux
   fonctions ci dessous n'existent pas encore côté serveur ; indisponible(e) le reconnaît et chaque
   fonction rend { dispo: false } au lieu de lever une erreur. Un billet certifie la zone RÉELLE d'un
   joueur (calculée côté serveur depuis sa date de naissance, jamais transmise elle même), signée par une
   clé que seul le serveur connaît : aucun appareil ne peut en fabriquer un valide pour une zone qui n'est
   pas la sienne (voir billet-zone.sql pour le mécanisme complet). Ce module ne vérifie jamais lui même la
   signature d'un billet (il n'a pas la clé, et ne doit jamais l'avoir) : verifierBilletZone() demande au
   serveur de le faire, à chaque fois qu'un pilote reçoit le billet d'un autre. */
// Billet pour SA PROPRE zone, valable pour une salle précise (le jeu appelle avec son code de salle
// courant), quelques minutes seulement. dispo:false : billet-zone.sql pas encore lancé, ou joueur non
// connecté ou sans zone connue (compte banni, ou profil pas encore créé) : le jeu garde alors le tchat
// et le vocal fermés avec lui même, exactement comme une zone inconnue aujourd'hui.
export async function demanderBilletZone(salleCode) {
  const id = await monId();
  if (!id) return { dispo: false, billet: '', zone: null, expireDansMs: 0 };
  const sb = await init();
  try {
    const lignes = verifierReponse(await sb.rpc('demander_billet_zone', { p_salle: String(salleCode || '').slice(0, 40) }));
    const l = Array.isArray(lignes) ? lignes[0] : lignes;
    if (!l || !l.billet) return { dispo: false, billet: '', zone: null, expireDansMs: 0 };
    const expireLe = l.expire_le ? new Date(l.expire_le).getTime() : 0;
    return { dispo: true, billet: l.billet, zone: l.zone || null, expireDansMs: expireLe ? Math.max(0, expireLe - Date.now()) : 0 };
  } catch (e) {
    if (indisponible(e)) return { dispo: false, billet: '', zone: null, expireDansMs: 0 };
    throw traduire(e);
  }
}
// Vérifie le billet reçu D'UN AUTRE pilote (jamais le sien : voir demanderBilletZone ci dessus) pour une
// salle donnée. Ne fait confiance à rien d'autre que le résultat de cet appel : la zone rendue vient
// uniquement d'une signature vérifiée côté serveur, jamais du billet lui même relu en clair. dispo:false :
// billet-zone.sql pas encore lancé (le tchat et le vocal restent alors fermés avec ce pilote, exactement
// comme un billet absent ou invalide : voir valide:false, rendu tout de suite sans appel réseau si le
// billet est vide).
export async function verifierBilletZone(billet, salleCode) {
  if (!billet) return { dispo: true, valide: false, zone: null };
  const id = await monId();
  if (!id) return { dispo: true, valide: false, zone: null };
  const sb = await init();
  try {
    const lignes = verifierReponse(await sb.rpc('verifier_billet_zone', { p_billet: String(billet).slice(0, 2000), p_salle: String(salleCode || '').slice(0, 40) }));
    const l = Array.isArray(lignes) ? lignes[0] : lignes;
    return { dispo: true, valide: !!(l && l.valide), zone: (l && l.valide) ? (l.zone || null) : null };
  } catch (e) {
    if (indisponible(e)) return { dispo: false, valide: false, zone: null };
    throw traduire(e);
  }
}

/* ---------- QR code du lien de partage ---------- */
// Rend un SVG sous forme de texte : modules sombres sur fond blanc, lu par tous les téléphones.
export async function qrCodeSvg(texte, taille = 220) {
  await chargerScript(CONFIG.qr, CONFIG.qrEmpreinte, () => typeof window.qrcode === 'function');
  const qr = window.qrcode(0, 'M');
  qr.addData(String(texte));
  qr.make();
  const n = qr.getModuleCount(), marge = 4, cote = n + marge * 2;
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += 'M' + (c + marge) + ' ' + (r + marge) + 'h1v1h-1z';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + cote + ' ' + cote + '" width="' + taille + '" height="' + taille
    + '" shape-rendering="crispEdges" role="img" aria-label="QR code du lien d’invitation"><rect width="' + cote + '" height="' + cote
    + '" fill="#ffffff"/><path d="' + d + '" fill="#05070d"/></svg>';
}

export default {
  CONFIG, init, inscrire, inscrireLienMagique, connecter, lienMagique, renvoyerConfirmation, deconnecter, session, monId, surChangement,
  monProfil, creerProfil, modifierProfil, pseudoDisponible, rechercher,
  amis, demanderAmi, demanderAmiParPseudo, accepterAmi, refuserAmi, retirerAmi,
  lienInvitation, inviter, invitationsRecues, repondreInvitation, annulerInvitation, ecouterInvitations,
  presence, joueursRecents, noterJoueursRecents, qrCodeSvg,
  enregistrerScore, monRecord, classementSemaine, monRangSemaine,
  maZone, signaler,
  enregistrerMission,
  demanderBilletZone, verifierBilletZone,
  normaliserPseudo, verifierPseudo, verifierAge, estMineur, verifierAccordParental, verifierMail, verifierMotDePasse, adresseRetour,
};
