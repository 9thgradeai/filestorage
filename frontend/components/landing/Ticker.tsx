const ITEMS = [
  'AES-256 ENCRYPTED AT REST',
  'MAGIC-BYTE VALIDATION',
  'ROTATING SESSIONS',
  'EXPIRING SHARE LINKS',
  'HTTPONLY COOKIES',
  'DOUBLE-SUBMIT CSRF',
  'TEMP-FILE STREAMING',
  'FORCED DOWNLOAD + NOSNIFF',
];

export default function Ticker() {
  const row = [...ITEMS, ...ITEMS];
  return (
    <div className="ticker" aria-hidden="true">
      <div className="ticker-track">
        {row.map((item, i) => (
          <span key={i} className="ticker-item">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}