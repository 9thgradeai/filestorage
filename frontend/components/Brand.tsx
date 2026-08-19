import { LockKey } from '@phosphor-icons/react';

export function Brand({ tagline = true }: { tagline?: boolean }) {
  return (
    <span className="brand">
      <span className="brand-mark" aria-hidden="true">
        <LockKey weight="fill" size={15} />
      </span>
      Vault
      {tagline && <span className="brand-mono">SECURE FILE STORAGE</span>}
    </span>
  );
}