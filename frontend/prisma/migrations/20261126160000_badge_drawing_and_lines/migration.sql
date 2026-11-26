/*
  Warnings:

  - The columns `shape`, `icon`, `text`, `backgroundColor`, `ringColor`,
    `ringDashed` and `iconColor` on `Badge_Definition` are dropped. No look is
    lost: each badge's is first drawn into the new `art` column from them, the
    outline, pictogram, colours and text it had.

*/

-- A badge is drawn by one SVG, written over the API (#551), instead of being
-- composed from an outline, a pictogram and colours picked from closed lists
-- (#448), none of which could draw the mockup's stickers.
ALTER TABLE "Badge_Definition" ADD COLUMN "art" TEXT;

-- The badges written before this migration, on an environment ahead of
-- production (#448 never reached it), are drawn from the look they had: the
-- outline in its fill and ring, the mockup's pictogram (its 24-unit path,
-- scaled into the 80-unit frame), and the text under it when there was one.
-- The text is escaped, as it lands inside markup; the colours were held to
-- #rrggbb at write, and the shape and pictogram to closed lists.
UPDATE "Badge_Definition"
SET "art" =
    CASE "shape"
      WHEN 'hexagon' THEN '<path d="M40 3l33 19v36L40 77 7 58V22z"'
      WHEN 'shield' THEN '<path d="M40 4l32 10v26c0 18-14 30-32 36C22 70 8 58 8 40V14z"'
      ELSE '<circle cx="40" cy="40" r="36"'
    END
    || ' fill="' || "backgroundColor" || '" stroke="' || "ringColor" || '" stroke-width="5" stroke-linejoin="round"'
    || CASE WHEN "ringDashed" THEN ' stroke-dasharray="6 4"' ELSE '' END
    || CASE "shape" WHEN 'hexagon' THEN '></path>' WHEN 'shield' THEN '></path>' ELSE '></circle>' END
    || '<g transform="'
    || CASE WHEN "text" IS NULL THEN 'translate(20.8 20.8) scale(1.6)' ELSE 'translate(25 12) scale(1.25)' END
    || '" fill="none" stroke="' || "iconColor" || '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="'
    || CASE "icon"
      WHEN 'car' THEN 'M4 14l2-5h12l2 5v3H4zM4 14h16M7 17v1.5M17 17v1.5M8.5 11.5h7'
      WHEN 'flag' THEN 'M6 21V4M6 4h11l-2 3.5 2 3.5H6M9 4v7M12 4v7M6 7.5h9'
      WHEN 'zombie' THEN 'M6 10a6 6 0 0 1 12 0v6a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3zM8.5 10l2 2M10.5 10l-2 2M13.5 10l2 2M15.5 10l-2 2M9 16h6M10.5 15v2M13.5 15v2'
      WHEN 'code' THEN 'M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16'
      WHEN 'check' THEN 'M5 12l4.5 4.5L19 7'
      WHEN 'lock' THEN 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3M12 15v2'
      WHEN 'chip' THEN 'M7 7h10v10H7zM10 10h4v4h-4zM9 3v4M15 3v4M9 17v4M15 17v4M3 9h4M3 15h4M17 9h4M17 15h4'
      WHEN 'robot' THEN 'M6 9h12v10H6zM12 9V5.5M12 4h.01M9.5 13h.01M14.5 13h.01M9.5 16h5M3 13v2M21 13v2'
      WHEN 'app' THEN 'M3 5h18v14H3zM3 9h18M6 7h.01M8.5 7h.01M8 13l-2 2 2 2M16 13l2 2-2 2'
      WHEN 'trophy' THEN 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v3M9 20h6M10 16h4v4h-4z'
      WHEN 'duck' THEN 'M7.5 9.5a3 3 0 1 1 5.3 1.9c2.2-.4 6.2.4 7.7 2.9-1 4-4.6 5.7-8.3 5.7-4 0-6.7-2-6.7-5 0-1.4.8-2.6 2-3.4zM9.8 8.6h.01M4.8 9.8l-2.3.6 2.4.9'
      WHEN 'flame' THEN 'M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-4 2.5-5 .3 1.5 1 2.5 2 3 0-3 .5-5.5.5-8z'
      WHEN 'gamepad' THEN 'M6 9h12a4 4 0 0 1 4 4v1a3 3 0 0 1-5.4 1.8L15 14H9l-1.6 1.8A3 3 0 0 1 2 14v-1a4 4 0 0 1 4-4zM7 11v4M5 13h4M15.5 12h.01M17.5 14h.01'
      ELSE ''
    END
    || '"></path></g>'
    || CASE WHEN "text" IS NULL THEN '' ELSE
         '<text x="40" y="62" text-anchor="middle" fill="' || "iconColor" || '" font-family="Anton" font-size="14">'
         || replace(replace(replace("text", '&', '&amp;'), '<', '&lt;'), '>', '&gt;')
         || '</text>'
       END;

ALTER TABLE "Badge_Definition" ALTER COLUMN "art" SET NOT NULL;

-- AlterTable
ALTER TABLE "Badge_Definition" DROP COLUMN "backgroundColor",
DROP COLUMN "icon",
DROP COLUMN "iconColor",
DROP COLUMN "ringColor",
DROP COLUMN "ringDashed",
DROP COLUMN "shape",
DROP COLUMN "text";

-- A line the duck says of one badge, when a talent clicks it (#551). Gone with
-- its badge, which is only deleted while nobody holds it.
ALTER TABLE "Mascot_Line" ADD COLUMN "badgeKey" TEXT;

-- CreateIndex
CREATE INDEX "Mascot_Line_badgeKey_idx" ON "Mascot_Line"("badgeKey");

-- AddForeignKey
ALTER TABLE "Mascot_Line" ADD CONSTRAINT "Mascot_Line_badgeKey_fkey" FOREIGN KEY ("badgeKey") REFERENCES "Badge_Definition"("key") ON DELETE CASCADE ON UPDATE CASCADE;
