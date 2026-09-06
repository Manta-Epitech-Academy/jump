# lint-design.ts : Vérification du contrat visuel

Script TypeScript qui vérifie que les composants respectent le contrat défini dans [`DESIGN.md`](../../DESIGN.md) (racine du dépôt).

## Usage

```bash
bun run lint:design
```

Le script retourne `0` si tout est OK, `1` si des violations sont trouvées. Il n'y a pas de warnings : une règle est une règle.

## Ce qu'il ne fait pas

Il est **lexical** : il cherche des classes interdites dans les composants. La partie **numérique** (les valeurs des tokens et leurs contrastes) est couverte par `src/lib/design/contract.test.ts`, qui lit `layout.css` et le front matter de `DESIGN.md` et échoue quand les deux divergent. Le calcul de contraste n'existe donc qu'à un seul endroit, et ce n'est pas ici.

## Règles vérifiées

| #   | Règle                                                | Pourquoi                                                                                      | Référence DESIGN.md |
| --- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------- |
| 1   | Aucune famille de couleur Tailwind hors palette      | `slate` était une deuxième rampe neutre concurrente des tokens ; `amber` une palette inventée | § Colors            |
| 2   | Aucune taille de police arbitraire (`text-[Npx]`)    | 210 occurrences réinventaient la couche overline, dont une à 8 px                             | § Typography        |
| 3   | Aucun `font-black` / `font-extrabold`                | IBM Plex Sans Variable est `font-weight: 100 700` : 900 rend 700                              | § Typography        |
| 4   | Aucun `backdrop-blur`                                | La charte préfère les bords francs                                                            | § Elevation & Depth |
| 5   | Aucun fond en dégradé                                | La texture de marque est `blueprint-grid` + carrés pixel (un fondu de troncature est permis)  | § Elevation & Depth |
| 6   | Aucune ombre hors des trois niveaux                  | `shadow-raised` / `shadow-overlay`, ou rien                                                   | § Elevation & Depth |
| 7   | Aucun rayon hors échelle (`rounded-2xl`, `3xl`, nu)  | 16 px est le plafond, y compris dans les espaces souples                                      | § Shapes            |
| 8   | Aucune ombre teintée                                 | La lueur colorée se traite en photo, pas en `box-shadow`                                      | § Elevation & Depth |
| 9   | Aucun `transition-all`                               | Anime aussi les propriétés de layout ; `transition-ui` nomme les siennes                      | § Motion            |
| 10  | Aucune durée > 320 ms                                | Plafond d'une transition d'état (une animation de célébration annonce sa propre durée)        | § Motion            |
| 11  | Aucune image de fond en style inline                 | La grille blueprint est un utilitaire, pas un `style=` recopié                                | § Layout            |
| 12  | Aucun accent brut en remplissage de bouton           | Blanc sur `epi-tomorrow` est à 3,10:1                                                         | § Components        |
| 13  | Aucun `outline-none` sans indicateur de remplacement | Deux éditeurs inline n'avaient aucun indicateur de focus                                      | § Accessibility     |

Pour la règle 13, le script accepte un indicateur de remplacement (`focus:border-`, `focus-visible:border-`, `focus-within:border-`) trouvé sur la ligne fautive ou les cinq suivantes.

## Exceptions

Une exception se déclare **sur place**, au-dessus de l'élément concerné, et **doit porter sa raison** :

```svelte
<!-- design-lint-ignore: dans une surface de saisie riche, le curseur est
     l'indicateur de focus ; un outline autour d'un éditeur de 300 px est pire. -->
```

Un marqueur sans raison ne compte pas. Il n'y a **pas** de fichier d'exemptions : une liste centralisée devient une dette qu'on ne relit plus, alors qu'une raison écrite à côté du code se juge.

Les trois exceptions actuelles sont l'éditeur CMS, le contenu d'un `DropdownMenu` et celui d'un `Tabs` : les deux derniers reçoivent le focus par programme pour le piéger, donc un outline entourerait tout le panneau ouvert.

## Fichiers hors périmètre

`ErrorTerminal.svelte` et les templates PDF de `server/templates/` : ce sont des artefacts autonomes avec leur propre feuille de style, rendus hors du shell de l'application (une page de crash, une page Puppeteer), et ils ne peuvent pas lire les tokens.

## Quand le lancer ?

- **Avant de commit** un changement visuel.
- Dans la liste des vérifications statiques de la Definition of Done (voir [`pull_request_template.md`](../../.github/pull_request_template.md)).

## Limites connues

- **Pas de parsing** : regex ligne par ligne, comme `lint-tests.ts`. Une classe construite dynamiquement (`` `bg-${hue}-500` ``) passe à travers.
- **Fenêtre de contexte** : les règles qui cherchent un indicateur de remplacement regardent 5 lignes en avant, et une exception 12 lignes en arrière. Un élément avec une très longue liste d'attributs peut donc échapper à la règle 13, ou nécessiter que le commentaire d'exception soit rapproché.
