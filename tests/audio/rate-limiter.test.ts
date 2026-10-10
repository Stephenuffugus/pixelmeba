/**
 * P3.10 rate limiter (UX §8.1, CT §12.10 "sound cues ≤ 4/s"): a fake clock drives
 * src/audio/rateLimiter.ts with the shipped world-cue classification (src/audio/patches.ts).
 */
import { describe, expect, it } from 'vitest';
import { CueRateLimiter, WORLD_CUES_PER_SECOND } from '@audio/rateLimiter';
import { coalesceMsOf, isWorldCue, WORLD_CUE_COALESCE_MS, WORLD_CUES } from '@audio/patches';

function rig() {
  let t = 0;
  const lim = new CueRateLimiter({ now: () => t, isWorld: isWorldCue, coalesceOf: coalesceMsOf });
  const plays: { id: string; at: number }[] = [];
  const ask = (id: string, at: number, count = 1) => {
    t = at;
    const d = lim.request(id, count);
    if (d.play) plays.push({ id, at });
    return d;
  };
  return { lim, plays, ask };
}

describe('world cue rate limiter', () => {
  it('classifies division, wake and discovery as world cues and the rest as UI cues', () => {
    expect([...WORLD_CUES].sort()).toEqual(['discovery', 'division', 'wake']);
    for (const ui of ['drop', 'placement_error', 'select', 'save', 'compare_result', 'card_open'])
      expect(isWorldCue(ui)).toBe(false);
    expect(WORLD_CUES_PER_SECOND).toBe(4);
  });

  it('10 division cues spread over 1 s give at most 4 plays whose coalesced counts add up to 10', () => {
    const { lim, plays, ask } = rig();
    const entries = new Set<object>();
    for (let i = 0; i < 10; i++) {
      const d = ask('division', i * 100);
      entries.add(d.play ? d.entry : d.joined!);
    }
    expect(plays.length).toBeGreaterThanOrEqual(1);
    expect(plays.length).toBeLessThanOrEqual(4);
    const total = [...entries].reduce((n, e) => n + (e as { count: number }).count, 0);
    expect(total).toBe(10);
    expect(lim.suppressed).toBe(0);
  });

  it('10 division cues in one burst are one play with a count of 10', () => {
    const { plays, ask } = rig();
    let last = ask('division', 0);
    for (let i = 1; i < 10; i++) last = ask('division', i * 5);
    expect(plays).toHaveLength(1);
    expect(last.play).toBe(false);
    expect(!last.play && last.joined?.count).toBe(10);
  });

  it('a request standing for several births counts them all', () => {
    const { lim, ask } = rig();
    ask('division', 0, 7);
    ask('division', 50, 3);
    expect(lim.playsInWindow()[0]!.count).toBe(10);
  });

  it('never more than 4 world plays in any rolling second, whatever the stream', () => {
    const { plays, ask } = rig();
    const ids = ['division', 'wake', 'discovery'];
    for (let i = 0; i < 600; i++) ask(ids[(i * 7) % 3]!, i * 17);
    for (const p of plays)
      expect(plays.filter((q) => q.at >= p.at && q.at < p.at + 1000).length).toBeLessThanOrEqual(4);
    expect(plays.length).toBeGreaterThan(20);
  });

  it('different world cues share the 4 per second budget', () => {
    const { lim, plays, ask } = rig();
    expect(ask('division', 0).play).toBe(true);
    expect(ask('wake', 10).play).toBe(true);
    expect(ask('discovery', 20).play).toBe(true);
    expect(ask('discovery', 300).play).toBe(true); // 4th play in the second
    // Discovery is past its coalescing gap, but the shared budget is spent: it joins discovery's last play.
    const w = ask('discovery', 600);
    expect(w.play).toBe(false);
    expect(!w.play && w.joined?.id).toBe('discovery');
    expect(!w.play && w.joined?.count).toBe(2);
    expect(plays).toHaveLength(4);
    // A world cue with no play to join in the window is not played (counted as suppressed).
    const lim2 = rig();
    lim2.ask('discovery', 0);
    lim2.ask('discovery', 300);
    lim2.ask('discovery', 600);
    lim2.ask('discovery', 900);
    const d = lim2.ask('wake', 950);
    expect(d.play).toBe(false);
    expect(lim2.lim.suppressed).toBe(1);
    // Once the oldest play leaves the rolling second, the budget frees again.
    expect(ask('discovery', 1001).play).toBe(true);
    expect(lim.playsInWindow().length).toBeLessThanOrEqual(4);
  });

  it('the shared mechanics with one 250 ms gap for every cue (option defaults)', () => {
    let t = 0;
    const lim = new CueRateLimiter({ now: () => t, isWorld: isWorldCue });
    const at = (id: string, ms: number) => ((t = ms), lim.request(id).play);
    expect([at('division', 0), at('wake', 10), at('discovery', 20), at('division', 300)]).toEqual([true, true, true, true]);
    expect(at('wake', 400)).toBe(false); // budget spent: joins wake's play
    expect(lim.suppressed).toBe(0);
  });

  it('UI cues are not limited and do not use the world budget', () => {
    const { lim, plays, ask } = rig();
    for (let i = 0; i < 20; i++) expect(ask('select', i).play).toBe(true);
    for (let i = 0; i < 20; i++) expect(ask('drop', 20 + i).play).toBe(true);
    expect(lim.playsInWindow()).toHaveLength(0);
    // The world budget is untouched: four different world plays still go through in the same second.
    expect(ask('division', 50).play).toBe(true);
    expect(ask('wake', 60).play).toBe(true);
    expect(ask('discovery', 70).play).toBe(true);
    expect(ask('discovery', 400).play).toBe(true);
    expect(plays.filter((p) => isWorldCue(p.id))).toHaveLength(4);
  });
});

describe('division is never a click track (UX §8.1 "No sound per bacterial division burst")', () => {
  it('gaps: division 5 s, wake 1 s, discovery 250 ms', () => {
    expect(WORLD_CUE_COALESCE_MS).toEqual({ division: 5000, wake: 1000, discovery: 250 });
    expect(coalesceMsOf('select')).toBeUndefined();
  });

  it('births in every 100 ms snapshot for 60 s: at most one division click per 5 s, every birth counted', () => {
    const { lim, plays, ask } = rig();
    const entries = new Set<object>();
    for (let t = 0; t < 60_000; t += 100) {
      const d = ask('division', t, 3);
      entries.add(d.play ? d.entry : d.joined!);
    }
    expect(plays.length).toBe(12); // was ~3.3 per second (about 200 in 60 s) before fix 1
    for (let i = 1; i < plays.length; i++) expect(plays[i]!.at - plays[i - 1]!.at).toBeGreaterThanOrEqual(5000);
    const total = [...entries].reduce((n, e) => n + (e as { count: number }).count, 0);
    expect(total + lim.suppressed).toBe(600 * 3);
  });

  it('a growing dish does not crowd out discovery or wake (the verifier\'s starve repro)', () => {
    const { lim, ask } = rig();
    let divPlays = 0;
    for (let t = 0; t < 5000; t += 100) if (ask('division', t, 3).play) divPlays++;
    expect(divPlays).toBe(1);
    expect(ask('discovery', 5050).play).toBe(true);
    expect(ask('wake', 5070).play).toBe(true);
    expect(lim.suppressed).toBe(0);
  });

  it('births every snapshot leave wake and discovery exactly as they play in a quiet dish', () => {
    const run = (withBirths: boolean) => {
      const { lim, plays, ask } = rig();
      for (let t = 0; t < 10_000; t += 100) {
        if (withBirths) ask('division', t, 2);
        if (t % 600 === 0) ask('wake', t + 1);
        if (t % 500 === 0) ask('discovery', t + 2);
      }
      return { others: plays.filter((p) => p.id !== 'division'), divisions: plays.length - plays.filter((p) => p.id !== 'division').length, suppressed: lim.suppressed };
    };
    const quiet = run(false);
    const growing = run(true);
    expect(growing.others).toEqual(quiet.others);
    expect(growing.suppressed).toBe(0);
    expect(growing.divisions).toBe(2); // t = 0 and t = 5000
  });
});
