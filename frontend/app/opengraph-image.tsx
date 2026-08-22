import { ImageResponse } from 'next/og';

export const alt = 'Vault · Secure File Storage';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#09090b',
          backgroundImage:
            'radial-gradient(60% 60% at 50% 40%, rgba(16,185,129,0.14) 0%, rgba(9,9,11,0) 70%)',
          color: '#f4f4f5',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 96,
            height: 96,
            borderRadius: 24,
            background: '#10b981',
            marginBottom: 36,
          }}
        >
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2L4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3z"
              fill="#052e1c"
            />
          </svg>
        </div>
        <div style={{ display: 'flex', fontSize: 72, fontWeight: 700, letterSpacing: -2 }}>
          Vault
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 30,
            color: '#a1a1aa',
            marginTop: 18,
          }}
        >
          Secure File Storage
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 22,
            color: '#34d399',
            marginTop: 28,
            padding: '10px 28px',
            borderRadius: 999,
            border: '1px solid rgba(16,185,129,0.35)',
            background: 'rgba(16,185,129,0.12)',
          }}
        >
          Expiring links · Cookie sessions · Magic-byte validation
        </div>
      </div>
    ),
    size
  );
}
