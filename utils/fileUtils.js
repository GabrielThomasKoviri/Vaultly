export const MIME_TYPES = {
  pdf: 'application/pdf', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  gif: 'image/gif', webp: 'image/webp',
  mp4: 'video/mp4', mkv: 'video/x-matroska', mov: 'video/quicktime',
  avi: 'video/x-msvideo', mp3: 'audio/mpeg', wav: 'audio/wav',
  aac: 'audio/aac', html: 'text/html', htm: 'text/html',
  zip: 'application/zip', rar: 'application/x-rar-compressed',
};

export const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'doc', label: 'Docs' },
  { key: 'media', label: 'Media' },
  { key: 'web', label: 'Web' },
  { key: 'audio', label: 'Audio' },
  { key: 'other', label: 'Other' },
];

export const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
export const VIDEO_EXTS = ['mp4', 'mkv', 'mov', 'avi'];
export const AUDIO_EXTS = ['mp3', 'wav', 'aac'];
export const DOC_EXTS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt'];
export const WEB_EXTS = ['html', 'htm'];

export function getExt(item) {
  return (item.file_path || '').split('.').pop().toLowerCase();
}

export function getCategory(item) {
  const ext = getExt(item);
  if (item.type === 'image' || item.type === 'scan' || IMAGE_EXTS.includes(ext)) return 'media';
  if (item.type === 'video' || VIDEO_EXTS.includes(ext)) return 'media';
  if (AUDIO_EXTS.includes(ext)) return 'audio';
  if (DOC_EXTS.includes(ext)) return 'doc';
  if (WEB_EXTS.includes(ext)) return 'web';
  return 'other';
}

export function getDocBadge(ext) {
  switch (ext) {
    case 'pdf': return { label: 'PDF', bg: '#e53935', text: '#fff' };
    case 'doc':
    case 'docx': return { label: 'W', bg: '#1565c0', text: '#fff' };
    case 'xls':
    case 'xlsx': return { label: 'X', bg: '#2e7d32', text: '#fff' };
    case 'ppt':
    case 'pptx': return { label: 'P', bg: '#e65100', text: '#fff' };
    case 'txt': return { label: 'TXT', bg: '#546e7a', text: '#fff' };
    case 'zip':
    case 'rar': return { label: 'ZIP', bg: '#6a1b9a', text: '#fff' };
    case 'html':
    case 'htm': return { label: 'HTML', bg: '#00838f', text: '#fff' };
    case 'mp3':
    case 'wav':
    case 'aac': return { label: '♪', bg: '#ad1457', text: '#fff' };
    default: return { label: 'FILE', bg: '#78909c', text: '#fff' };
  }
}

export function formatSize(bytes) {
  if (!bytes) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function getFileTypeLabel(item) {
  const ext = getExt(item).toUpperCase();
  if (item.type === 'image' || item.type === 'scan') return `${ext || 'JPG'} image`;
  if (item.type === 'video') return `${ext || 'MP4'} video`;
  switch (getExt(item)) {
    case 'pdf': return 'PDF document';
    case 'doc': case 'docx': return 'Word document';
    case 'xls': case 'xlsx': return 'Excel spreadsheet';
    case 'ppt': case 'pptx': return 'PowerPoint file';
    case 'txt': return 'Text file';
    case 'mp3': case 'wav': case 'aac': return 'Audio file';
    case 'html': case 'htm': return 'Web page';
    case 'zip': case 'rar': return 'Archive file';
    default: return ext ? `${ext} file` : 'File';
  }
}
