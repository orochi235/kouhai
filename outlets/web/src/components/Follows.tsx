import type { Item } from '../api.ts';
import { renderPreview } from '../markdown.ts';
import './Follows.css';

/** The line above a follow-up that opens the item it responds to. */
export function Follows({
  of,
  parent,
  onSelect,
}: {
  of: string;
  parent: Item | null;
  onSelect: (ref: string) => void;
}) {
  return (
    <button type="button" className="follows" onClick={() => onSelect(of)}>
      Follows up on {of}
      {parent && (
        <>
          : <span dangerouslySetInnerHTML={{ __html: renderPreview(parent.text) }} />
        </>
      )}
    </button>
  );
}
