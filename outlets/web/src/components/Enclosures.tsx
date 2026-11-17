import type { Attachment, Item } from '../api.ts';
import { imageUrl, isImagePath } from '../images.ts';
import './Enclosures.css';

const KIND: Record<Attachment['kind'], string> = {
  artifact: 'Artifact',
  url: 'Link',
  file: 'File',
  transom: 'On the wall',
};

/** What Claude attached when settling the item: links, files, and screenshots shown inline. */
export function Enclosures({
  item: q,
  onReveal,
}: {
  item: Item;
  onReveal: (q: Item, ref: string) => void;
}) {
  if (q.attachments.length === 0) return null;
  return (
    <section className="enclosures">
      <h3>Enclosed</h3>
      <ul>
        {q.attachments.map((a) => (
          <li key={`${a.kind}:${a.ref}`}>
            <span className="kind">{KIND[a.kind]}</span>
            {a.kind === 'artifact' || a.kind === 'url' ? (
              <a href={a.ref} target="_blank" rel="noreferrer">
                {a.label ?? a.ref}
              </a>
            ) : (
              <>
                <span className="path">{a.label ?? a.ref}</span>
                <button type="button" className="quiet" onClick={() => onReveal(q, a.ref)}>
                  Show in Finder
                </button>
                {isImagePath(a.ref) && (
                  <img className="shot" src={imageUrl(q.ref, a.ref)} alt={a.label ?? ''} />
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
