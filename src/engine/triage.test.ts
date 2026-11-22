import { describe, expect, it } from 'vitest';
import { Store } from './store.ts';
import { applyTriage, provisionalTitle, setAsked, TITLE_WAIT_MS, untriaged } from './triage.ts';

const ctx = {
  session: 's1',
  harness: 'claude-msb',
  cwd: null,
  root: null,
  repo: null,
  transcript: null,
};

describe('provisionalTitle', () => {
  it('picks the question sentence sharing most words with the slug', () => {
    const asked = 'Nice work. Does the cache expire? And what does take cost per call?';
    expect(provisionalTitle(asked, 'take-cost-per-call')).toBe('And what does take cost per call?');
    expect(provisionalTitle('no question here', 'x')).toBe('no question here');
  });
});

describe('triage', () => {
  it('retitles a chat-filed question, keeps what the agent set, and marks a keeper', () => {
    const s = new Store(':memory:');
    const [chat] = s.take([{ kind: 'question', text: 'provisional', via: 'chat' }], null, ctx);
    const [took] = s.take([{ kind: 'question', text: 'quoted?' }], null, ctx);
    if (!chat || !took) throw new Error('not filed');
    setAsked(s.db, chat.id, 'the whole message');
    s.settle(chat.id, 'answered', 'A.');
    s.settle(took.id, 'answered', 'B.', [], { verdict: 'Mine.' });
    expect(untriaged(s.db, 0).map((i) => [i.id, i.chat, i.asked])).toEqual([
      [chat.id, true, 'the whole message'],
      [took.id, false, 'quoted?'],
    ]);
    applyTriage(s.db, 1, { id: chat.id, question: 'clean?', verdict: 'Yes.', keep: false });
    applyTriage(s.db, 1, { id: took.id, question: 'ignored?', verdict: 'Theirs.', keep: true });
    expect(s.get(chat.id)).toMatchObject({ text: 'clean?', verdict: 'Yes.', scope: 'session' });
    expect(s.get(took.id)).toMatchObject({ text: 'quoted?', verdict: 'Mine.', scope: null });
    expect(untriaged(s.db, 0)).toEqual([]);
  });

  it('holds a chat-filed item from adapters until it is titled, or the wait runs out', () => {
    let now = 1_000_000;
    const s = new Store(':memory:', () => now);
    const [chat] = s.take([{ kind: 'question', text: 'provisional', via: 'chat' }], null, ctx);
    s.take([{ kind: 'task', text: 'plain' }], null, ctx);
    if (!chat) throw new Error('not filed');
    expect(s.outbox.due().map((e) => e.item)).not.toContain(chat.id);
    now += TITLE_WAIT_MS + 1;
    expect(s.outbox.due().map((e) => e.item)).toContain(chat.id);
  });
});
