import { type KeySpec, useCommand } from '@weasel-js/core';
import type { Item, Kind } from './api.ts';

const key = (k: string | readonly string[]): KeySpec => ({ kind: 'key', key: k as string });
const needs = (q: Item | null) => () => (q ? true : 'Select an item first');

type Inbox = {
  current: Item | null;
  move: (step: number) => void;
  search: () => void;
  archive: (q: Item) => void;
  toggleRead: (q: Item) => void;
  pin: (q: Item) => void;
  misfile: () => void;
  box: (kind: Kind) => void;
};

/** The page's keys, as named commands, so the shortcut sheet lists each one. */
export function useInboxKeys({
  current,
  move,
  search,
  archive,
  toggleRead,
  pin,
  misfile,
  box,
}: Inbox) {
  const group = 'Inbox';
  useCommand('inbox.next', 'Next item', () => move(1), {
    group,
    keys: [key('j'), key('ArrowDown')],
  });
  useCommand('inbox.previous', 'Previous item', () => move(-1), {
    group,
    keys: [key('k'), key('ArrowUp')],
  });
  useCommand('inbox.search', 'Search', search, { group, keys: key('/') });
  useCommand('inbox.questions', 'Questions inbox', () => box('question'), {
    group,
    keys: key('1'),
  });
  useCommand('inbox.tasks', 'Tasks inbox', () => box('task'), { group, keys: key('2') });
  const item = 'Item';
  useCommand('item.archive', 'Archive or unarchive', () => current && archive(current), {
    group: item,
    keys: [key('x'), key('Backspace'), key('Delete')],
    enabled: needs(current),
  });
  useCommand('item.read', 'Mark read or unread', () => current && toggleRead(current), {
    group: item,
    keys: key('u'),
    enabled: needs(current),
  });
  useCommand('item.pin', 'Pin or unpin', () => current && pin(current), {
    group: item,
    keys: key('p'),
    enabled: needs(current),
  });
  useCommand('item.misfile', 'Mark misfiled', misfile, {
    group: item,
    keys: key('m'),
    enabled: needs(current),
  });
}
