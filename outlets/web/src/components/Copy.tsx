import { useState } from 'react';

type Props = { text: string; label: string; className?: string; title?: string };

/** A button that copies `text` and says so for a moment in place of its label. */
export function Copy({ text, label, className = 'quiet', title }: Props) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={className}
      title={title}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1400);
      }}
    >
      {done ? 'Copied' : label}
    </button>
  );
}
