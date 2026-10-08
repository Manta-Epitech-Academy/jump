/**
 * A certificate the generator authors, beside the two the migrations carry.
 *
 * The migration designs (`stage`, `coding-club`) predate inline SVG and draw
 * nothing, so without this one no generated dataset holds a design with a
 * drawing, and the PO has no event whose export shows what one looks like
 * printed. It is attached to every Coding Club session, which is how the live
 * catalogue is used: one design per series, issued by each of its events.
 *
 * Written the way an author writes one over `write_diploma_template`: ornaments
 * as SVG in the markup, a word inside the badge in the brand face. The scenario
 * stores it as written, and `assert/designs.ts` checks those bytes are the ones
 * the API would have kept, so it is written the way the sanitiser serialises
 * (explicit closing tags, no self-closing SVG).
 */

export const CLUB_CERTIFICATE = {
  code: 'coding-club-illustre',
  label: 'Certificat Coding Club illustré',
  styleCss: `.page {
  background-color: #1f33b5;
  font-family: 'IBM Plex Sans', sans-serif;
  color: #ffffff;
}
.waves { position: absolute; left: 0; bottom: 0; width: 100%; height: auto; }
.badge { position: absolute; top: 48px; right: 72px; width: 150px; height: 150px; }
.content { position: relative; height: 100%; padding: 56px 72px; display: flex; flex-direction: column; }
.logo { width: 200px; height: 44px; background-image: var(--epitech-logo); background-size: contain; background-repeat: no-repeat; filter: brightness(0) invert(1); }
.kicker { margin: 40px 0 0; font-size: 13px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: #f4895f; }
.title { font-family: 'Anton', sans-serif; font-size: 72px; line-height: 1; text-transform: uppercase; margin: 8px 0 0; }
.name { font-family: 'Anton', sans-serif; font-size: 44px; text-transform: uppercase; color: #4ade80; margin: 28px 0 0; }
.desc { max-width: 640px; margin: 12px 0 0; font-size: 15px; line-height: 1.6; color: #dfe3ff; }
.signatures { margin-top: auto; display: flex; gap: 24px; align-self: flex-start; padding: 12px 22px 10px; border-radius: 14px; background-color: #ffffff; }
.sig-block { display: flex; flex-direction: column; align-items: center; min-width: 150px; }
.sig-img { width: 140px; height: 48px; background-size: contain; background-repeat: no-repeat; background-position: center bottom; }
.sig-name { margin: 0; font-size: 13px; font-weight: 700; color: #131c6a; }
.sig-role { margin: 2px 0 0; font-size: 11px; color: #64748b; }
.footer { margin-top: 14px; font-size: 11px; font-style: italic; color: rgba(255, 255, 255, 0.75); }`,
  bodyHtml: `<svg class="waves" viewBox="0 0 1123 220"><path d="M0 80c140-60 280 60 420 0s280-60 420 0 200 40 283 10V220H0z" fill="#2c47d8"></path><path d="M0 140c160-50 300 50 460 0s300-50 460 0 140 30 203 10V220H0z" fill="#131c6a"></path></svg>
<svg class="badge" viewBox="0 0 100 100"><defs><linearGradient id="orange" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4895f"></stop><stop offset="1" stop-color="#e879f9"></stop></linearGradient><path id="chevron" d="M22 24 8 40l14 16" fill="none" stroke-width="8" stroke-linecap="square"></path></defs><circle cx="50" cy="50" r="48" fill="#131c6a"></circle><use href="#chevron" x="12" stroke="url(#orange)"></use><use href="#chevron" x="12" stroke="url(#orange)" transform="rotate(180 50 40)"></use><text x="50" y="80" text-anchor="middle" font-family="Anton" font-size="14" fill="#ffffff">CLUB</text></svg>
<div class="content">
  <div class="logo"></div>
  <p class="kicker">Certificat de participation</p>
  <h1 class="title">Coding Club</h1>
  <h2 class="name">{prenom} {nom}</h2>
  <p class="desc">a participé à une séance du Coding Club d'Epitech {ville} le {dateDebut}, et a écrit ses premières lignes de code avec l'équipe.</p>
  <div class="signatures">{signatures}</div>
  <p class="footer">Fait à {ville}, le {dateDuJour}</p>
</div>`,
} as const;
