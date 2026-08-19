import {
  LockKey,
  LinkSimple,
  Users,
  ClockCounterClockwise,
  DownloadSimple,
  ShareNetwork,
  CloudArrowUp,
} from '@phosphor-icons/react';
import { FileTypeIcon, extensionOf } from './FileTypeIcon';

const FILES = [
  { name: 'contract-signed.pdf', size: '2.4 MB', public: true },
  { name: 'q3-revenue.csv', size: '18.2 KB', public: false },
  { name: 'launch-assets.zip', size: '86.7 MB', public: false },
  { name: 'roadmap-notes.txt', size: '3.1 KB', public: false },
  { name: 'brand-guidelines.pdf', size: '9.8 MB', public: true },
];

export function ProductPreview() {
  return (
    <div className="preview-shell">
      <div className="preview-bar">
        <span className="preview-dot" />
        <span className="preview-dot" />
        <span className="preview-dot" />
        <span className="preview-url">vault.app/dashboard</span>
      </div>
      <div className="preview-body">
        <div className="preview-side">
          <span className="side-icon active" title="Files">
            <LockKey size={17} weight="duotone" />
          </span>
          <span className="side-icon" title="Share links">
            <LinkSimple size={17} weight="duotone" />
          </span>
          <span className="side-icon" title="Team">
            <Users size={17} weight="duotone" />
          </span>
          <span className="side-icon" title="Activity">
            <ClockCounterClockwise size={17} weight="duotone" />
          </span>
        </div>
        <div className="preview-main">
          <div className="preview-head">
            <span className="preview-title">My Files</span>
            <span className="btn btn-primary btn-sm">
              <CloudArrowUp size={15} weight="bold" />
              Upload
            </span>
          </div>
          <div className="preview-stats">
            <span className="stat-chip">48 FILES</span>
            <span className="stat-chip">2.4 GB</span>
            <span className="stat-chip">6 PUBLIC</span>
          </div>
          {FILES.map((f) => (
            <div key={f.name} className="file-row">
              <span className="file-type">
                <FileTypeIcon name={f.name} size={18} />
              </span>
              <span className="grow">
                <div className="file-name">{f.name}</div>
                <div className="file-meta">
                  {f.size} · {extensionOf(f.name)}
                </div>
              </span>
              <span className={`badge ${f.public ? 'badge-green' : 'badge-yellow'}`}>
                {f.public ? 'Public' : 'Private'}
              </span>
              <span className="row" style={{ gap: '0.35rem' }}>
                <span className="side-icon">
                  <DownloadSimple size={15} weight="bold" />
                </span>
                <span className="side-icon">
                  <ShareNetwork size={15} weight="bold" />
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="preview-overlay">
        <span className="pulse-dot" />
        <span>Share link copied · expires in 7 days</span>
      </div>
    </div>
  );
}