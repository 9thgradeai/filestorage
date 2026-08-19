import {
  File,
  FilePdf,
  FileDoc,
  FileXls,
  FileZip,
  FileImage,
  FileText,
  FileVideo,
  type Icon,
} from '@phosphor-icons/react';

const KIND_ICONS: Record<string, Icon> = {
  pdf: FilePdf,
  doc: FileDoc,
  xls: FileXls,
  zip: FileZip,
  img: FileImage,
  video: FileVideo,
  text: FileText,
  file: File,
};

export function fileKind(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['pdf'].includes(ext)) return 'pdf';
  if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) return 'doc';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'xls';
  if (['zip', 'gz', 'tar', 'rar', '7z'].includes(ext)) return 'zip';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return 'img';
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return 'video';
  if (['txt', 'md', 'log', 'json'].includes(ext)) return 'text';
  return 'file';
}

export function FileTypeIcon({ name, size = 20 }: { name: string; size?: number }) {
  const IconComponent = KIND_ICONS[fileKind(name)] ?? File;
  return <IconComponent weight="duotone" size={size} />;
}

export function extensionOf(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return ext.length <= 6 ? ext.toUpperCase() : '';
}