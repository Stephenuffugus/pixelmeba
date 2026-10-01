/**
 * Fungal and adhesion links (Phase 3 foundation; SPEC §6.8, §7.7, §9.12, §9.19; src/sim/links.ts):
 * symmetric add/remove, the degree limits, removal of every incident link at death through both death
 * paths (killEntity and the predation capture), re-keying across a division, birthId-checked
 * references (a reused slot is never linked) and deterministic component walks.
 */
import { describe, expect, it } from 'vitest';
import { consumePrey } from '../../src/sim/contacts';
import { killEntity } from '../../src/sim/maintenance';
import { R } from '../../src/sim/reasons';
import { run } from '../../src/sim/tick';
import {
  addAdhesionLink,
  addFungalLink,
  adhesionComponent,
  adhesionDegree,
  adhesionNeighbors,
  fungalComponent,
  fungalDegree,
  fungalLinkKind,
  fungalNeighbors,
  LINK_TRANSPORT,
  LINK_VISUAL,
  linkProblem,
  linksValid,
  removeAdhesionLink,
  removeAllLinks,
  removeFungalLink,
} from '../../src/sim/links';
import type { World } from '../../src/sim/world';
import { aliveOf, clearWater, linkAdhesion, linkFungal, place } from '../helpers/world';

/** n B01 organisms in a row, low energy so none divides; returns their slots. */
function row(w: World, n: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < n; k++) out.push(place(w, 'B01', 40.5 + k * 3, 64.5, { E: 5 }));
  return out;
}

describe('links: add and remove', () => {
  it('a fungal link is stored on both ends with both birthIds and its kind; removal clears both ends', () => {
    const w = clearWater();
    const [a, b] = row(w, 2) as [number, number];
    expect(addFungalLink(w, a, b, LINK_VISUAL)).toBe(true);
    const c = w.ents.cols;
    expect([c.fLink0[a], c.fLinkB0[a], c.fLinkKind0[a]]).toEqual([b, c.birthId[b], LINK_VISUAL]);
    expect([c.fLink0[b], c.fLinkB0[b], c.fLinkKind0[b]]).toEqual([a, c.birthId[a], LINK_VISUAL]);
    expect(fungalNeighbors(w, a)).toEqual([b]);
    expect(fungalNeighbors(w, b)).toEqual([a]);
    expect(fungalLinkKind(w, a, b)).toBe(LINK_VISUAL);
    expect(fungalLinkKind(w, b, a)).toBe(LINK_VISUAL);
    expect(linksValid(w)).toBe(true);
    // A duplicate, a self link and an unknown kind are refused.
    expect(addFungalLink(w, b, a, LINK_TRANSPORT)).toBe(false);
    expect(addFungalLink(w, a, a, LINK_VISUAL)).toBe(false);
    expect(addFungalLink(w, a, b, 3 as typeof LINK_VISUAL)).toBe(false);
    expect(removeFungalLink(w, b, a)).toBe(true);
    expect([c.fLink0[a], c.fLinkB0[a], c.fLinkKind0[a], c.fLink0[b], c.fLinkB0[b], c.fLinkKind0[b]]).toEqual([
      -1, 0, 0, -1, 0, 0,
    ]);
    expect(fungalDegree(w, a)).toBe(0);
    expect(removeFungalLink(w, a, b)).toBe(false);
    expect(linksValid(w)).toBe(true);
  });

  it('an adhesion link is symmetric and is not a fungal link', () => {
    const w = clearWater();
    const [a, b] = row(w, 2) as [number, number];
    expect(addAdhesionLink(w, a, b)).toBe(true);
    expect(adhesionNeighbors(w, a)).toEqual([b]);
    expect(adhesionNeighbors(w, b)).toEqual([a]);
    expect(fungalDegree(w, a)).toBe(0);
    expect(fungalLinkKind(w, a, b)).toBe(0);
    expect(linksValid(w)).toBe(true);
    expect(removeAdhesionLink(w, a, b)).toBe(true);
    expect(adhesionDegree(w, a) + adhesionDegree(w, b)).toBe(0);
    expect(linksValid(w)).toBe(true);
  });

  it('the 5th fungal link and the 3rd adhesion link are refused and change nothing', () => {
    const w = clearWater();
    const [hub, ...rest] = row(w, 6) as [number, ...number[]];
    for (const p of rest.slice(0, 4)) expect(addFungalLink(w, hub, p, LINK_TRANSPORT)).toBe(true);
    expect(fungalDegree(w, hub)).toBe(4);
    const before = Array.from(w.ents.cols.fLink0.subarray(0, w.ents.highWater));
    expect(addFungalLink(w, hub, rest[4]!, LINK_TRANSPORT)).toBe(false);
    expect(addFungalLink(w, rest[4]!, hub, LINK_TRANSPORT)).toBe(false); // either end full
    expect(fungalDegree(w, rest[4]!)).toBe(0);
    expect(Array.from(w.ents.cols.fLink0.subarray(0, w.ents.highWater))).toEqual(before);
    expect(addAdhesionLink(w, hub, rest[0]!)).toBe(true);
    expect(addAdhesionLink(w, hub, rest[1]!)).toBe(true);
    expect(addAdhesionLink(w, hub, rest[2]!)).toBe(false);
    expect(adhesionDegree(w, hub)).toBe(2);
    expect(adhesionDegree(w, rest[2]!)).toBe(0);
    expect(linksValid(w)).toBe(true);
    // A freed position is reused.
    expect(removeFungalLink(w, hub, rest[1]!)).toBe(true);
    expect(addFungalLink(w, hub, rest[4]!, LINK_VISUAL)).toBe(true);
    expect(fungalNeighbors(w, hub)).toEqual([rest[0], rest[4], rest[2], rest[3]]); // position order
    expect(linksValid(w)).toBe(true);
  });
});

describe('links: death, division and slot reuse', () => {
  it('killEntity removes every incident link from both endpoints in the same tick', () => {
    const w = clearWater();
    const [a, b, d, e] = row(w, 4) as [number, number, number, number];
    linkFungal(w, a, b);
    linkFungal(w, b, d, LINK_VISUAL);
    linkAdhesion(w, b, e);
    linkAdhesion(w, a, d);
    killEntity(w, b, R.DEATH_STARVATION);
    expect(w.ents.isAlive(b)).toBe(false);
    expect(fungalDegree(w, a)).toBe(0);
    expect(fungalDegree(w, d)).toBe(0);
    expect(adhesionDegree(w, e)).toBe(0);
    expect(adhesionNeighbors(w, a)).toEqual([d]); // links not incident to b stay
    // No stale reference remains anywhere (not just none that reads as valid).
    expect(w.ents.cols.fLink0[a]).toBe(-1);
    expect(w.ents.cols.fLink0[d]).toBe(-1);
    expect(w.ents.cols.aLink0[e]).toBe(-1);
    expect(linkProblem(w.ents.cols as never, w.ents.highWater)).toBeNull();
  });

  it('a predation capture (consumePrey) removes the prey’s links from both endpoints', () => {
    const w = clearWater();
    const [prey, partner, colony] = row(w, 3) as [number, number, number];
    const pred = place(w, 'P01', w.ents.cols.x[prey]!, 64.5, { E: 30 });
    linkFungal(w, prey, partner);
    linkAdhesion(w, prey, colony);
    consumePrey(w, pred, prey);
    expect(w.ents.isAlive(prey)).toBe(false);
    expect(fungalDegree(w, partner)).toBe(0);
    expect(adhesionDegree(w, colony)).toBe(0);
    expect(w.ents.cols.fLink0[partner]).toBe(-1);
    expect(w.ents.cols.aLink0[colony]).toBe(-1);
    expect(linksValid(w)).toBe(true);
  });

  it('without removeAllLinks a freed partner leaves a dangling reference that linksValid reports', () => {
    const w = clearWater();
    const [a, b] = row(w, 2) as [number, number];
    linkFungal(w, a, b);
    w.ents.free(b); // a removal path that forgot removeAllLinks
    expect(linksValid(w)).toBe(false);
    expect(linkProblem(w.ents.cols as never, w.ents.highWater)).toMatch(/dangling/);
    expect(fungalNeighbors(w, a)).toEqual([]); // and it never reads as linked
  });

  it('a division re-keys the retained daughter’s partner rows, so the links survive and stay valid', () => {
    const w = clearWater();
    const s = place(w, 'B01', 64.5, 64.5, { B: 2, N: 0.2, E: 90, H: 100, age: 20 });
    const [p, q] = [place(w, 'B01', 30.5, 64.5, { E: 5 }), place(w, 'B01', 98.5, 64.5, { E: 5 })];
    linkFungal(w, s, p);
    linkAdhesion(w, s, q);
    const parentBirth = w.ents.cols.birthId[s]!;
    run(w, 1);
    expect(aliveOf(w, 'B01')).toHaveLength(4); // s divided; p and q did not
    const c = w.ents.cols;
    expect(c.birthId[s]).not.toBe(parentBirth);
    // The partners now hold the retained daughter's new birthId.
    expect(c.fLinkB0[p]).toBe(c.birthId[s]);
    expect(c.aLinkB0[q]).toBe(c.birthId[s]);
    expect(fungalNeighbors(w, p)).toEqual([s]);
    expect(fungalNeighbors(w, s)).toEqual([p]);
    expect(adhesionNeighbors(w, q)).toEqual([s]);
    expect(linksValid(w)).toBe(true);
    // The new daughter starts unlinked.
    const daughter = aliveOf(w, 'B01').find((k) => k !== s && k !== p && k !== q)!;
    expect(fungalDegree(w, daughter) + adhesionDegree(w, daughter)).toBe(0);
  });

  it('a reused slot with a new birthId is never treated as linked', () => {
    const w = clearWater();
    const [a, b] = row(w, 2) as [number, number];
    linkFungal(w, a, b);
    linkAdhesion(w, a, b);
    const oldBirth = w.ents.cols.birthId[b]!;
    w.ents.free(b); // stale reference on a (as if a removal path had skipped removeAllLinks)
    const b2 = place(w, 'B01', 70.5, 64.5, { E: 5 });
    expect(b2).toBe(b); // lowest free slot is reused
    expect(w.ents.cols.birthId[b2]).not.toBe(oldBirth);
    expect(w.ents.cols.fLink0[a]).toBe(b); // the stale slot is still stored …
    expect(fungalNeighbors(w, a)).toEqual([]); // … but never read as a link
    expect(adhesionNeighbors(w, a)).toEqual([]);
    expect(fungalLinkKind(w, a, b2)).toBe(0);
    expect(fungalComponent(w, a)).toEqual([a]);
    expect(linksValid(w)).toBe(false);
    // removeAllLinks clears the stale positions on a without touching the newcomer.
    removeAllLinks(w, a);
    expect(linksValid(w)).toBe(true);
    expect(addFungalLink(w, a, b2, LINK_VISUAL)).toBe(true);
    expect(linksValid(w)).toBe(true);
  });
});

describe('links: components', () => {
  it('component walks are deterministic: the same sorted members from every start, over the chosen kind', () => {
    const build = () => {
      const w = clearWater();
      const s = row(w, 8);
      // Fungal: 0–3 (transport), 3–1 (visual), 1–5 (transport); 2–6 (transport); 4, 7 alone.
      linkFungal(w, s[0]!, s[3]!, LINK_TRANSPORT);
      linkFungal(w, s[3]!, s[1]!, LINK_VISUAL);
      linkFungal(w, s[1]!, s[5]!, LINK_TRANSPORT);
      linkFungal(w, s[2]!, s[6]!, LINK_TRANSPORT);
      // Adhesion: 7–4–2.
      linkAdhesion(w, s[7]!, s[4]!);
      linkAdhesion(w, s[4]!, s[2]!);
      return { w, s };
    };
    const { w, s } = build();
    const comp = [s[0]!, s[1]!, s[3]!, s[5]!].sort((x, y) => x - y);
    for (const start of comp) expect(fungalComponent(w, start)).toEqual(comp);
    expect(fungalComponent(w, s[0]!, LINK_TRANSPORT)).toEqual([s[0]!, s[3]!].sort((x, y) => x - y));
    expect(fungalComponent(w, s[1]!, LINK_TRANSPORT)).toEqual([s[1]!, s[5]!].sort((x, y) => x - y));
    expect(fungalComponent(w, s[2]!)).toEqual([s[2]!, s[6]!].sort((x, y) => x - y));
    expect(fungalComponent(w, s[7]!)).toEqual([s[7]!]);
    const colony = [s[2]!, s[4]!, s[7]!].sort((x, y) => x - y);
    for (const start of colony) expect(adhesionComponent(w, start)).toEqual(colony);
    // An independent build gives identical results.
    const again = build();
    for (let k = 0; k < 8; k++) {
      expect(fungalComponent(again.w, again.s[k]!)).toEqual(fungalComponent(w, s[k]!));
      expect(adhesionComponent(again.w, again.s[k]!)).toEqual(adhesionComponent(w, s[k]!));
    }
    expect(fungalComponent(w, 5999)).toEqual([]); // a dead slot has no component
  });
});
