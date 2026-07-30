import React from 'react';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Copy,
  Download,
  Facebook,
  Instagram,
  Linkedin,
  MessageCircle,
  QrCode,
  Send,
  Share2,
  Twitter,
  UserCircle2,
  Upload,
  AlertTriangle,
} from 'lucide-react';
import logoAsset from '@/assets/wwjmrd-logo.png.asset.json';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface PublicationCardData {
  id: string;
  reference_number?: string | null;
  title: string;
  author_id?: string | null;
  author_name?: string | null;
  author_avatar_url?: string | null;
  country?: string | null;
  publication_year?: string | null;
  volume?: string | null;
  issue?: string | null;
  page_number?: string | null;
  published_link?: string | null;
  keywords?: string[] | null;
  abstract?: string | null;
}

const CARD_SIZE = 1200;
const EXPORT_SCALE = 2;

// Compact country → ISO-2 mapping for flags. Fallback: no flag drawn.
const COUNTRY_ISO2: Record<string, string> = {
  india: 'in', 'united states': 'us', 'united states of america': 'us', usa: 'us', 'u.s.a.': 'us',
  'united kingdom': 'gb', uk: 'gb', 'great britain': 'gb', england: 'gb', scotland: 'gb',
  canada: 'ca', australia: 'au', 'new zealand': 'nz', ireland: 'ie',
  germany: 'de', france: 'fr', spain: 'es', italy: 'it', portugal: 'pt', netherlands: 'nl',
  belgium: 'be', switzerland: 'ch', austria: 'at', sweden: 'se', norway: 'no', denmark: 'dk',
  finland: 'fi', poland: 'pl', 'czech republic': 'cz', czechia: 'cz', greece: 'gr',
  hungary: 'hu', romania: 'ro', bulgaria: 'bg', ukraine: 'ua', russia: 'ru',
  turkey: 'tr', 'saudi arabia': 'sa', uae: 'ae', 'united arab emirates': 'ae',
  qatar: 'qa', kuwait: 'kw', bahrain: 'bh', oman: 'om', jordan: 'jo', lebanon: 'lb',
  egypt: 'eg', morocco: 'ma', algeria: 'dz', tunisia: 'tn', libya: 'ly',
  'south africa': 'za', nigeria: 'ng', kenya: 'ke', ghana: 'gh', ethiopia: 'et',
  uganda: 'ug', tanzania: 'tz', zimbabwe: 'zw', rwanda: 'rw', sudan: 'sd',
  china: 'cn', japan: 'jp', 'south korea': 'kr', korea: 'kr', 'north korea': 'kp',
  taiwan: 'tw', 'hong kong': 'hk', singapore: 'sg', malaysia: 'my', indonesia: 'id',
  philippines: 'ph', thailand: 'th', vietnam: 'vn', cambodia: 'kh', laos: 'la',
  myanmar: 'mm', burma: 'mm', bangladesh: 'bd', pakistan: 'pk', nepal: 'np',
  'sri lanka': 'lk', bhutan: 'bt', maldives: 'mv', afghanistan: 'af', iran: 'ir', iraq: 'iq',
  israel: 'il', palestine: 'ps', syria: 'sy', yemen: 'ye',
  mexico: 'mx', brazil: 'br', argentina: 'ar', chile: 'cl', colombia: 'co',
  peru: 'pe', venezuela: 've', ecuador: 'ec', bolivia: 'bo', uruguay: 'uy', paraguay: 'py',
  cuba: 'cu', 'dominican republic': 'do', 'puerto rico': 'pr', jamaica: 'jm',
  kazakhstan: 'kz', uzbekistan: 'uz', azerbaijan: 'az', georgia: 'ge', armenia: 'am',
  serbia: 'rs', croatia: 'hr', slovenia: 'si', slovakia: 'sk', lithuania: 'lt',
  latvia: 'lv', estonia: 'ee', belarus: 'by', moldova: 'md',
};

function countryToIso2(name?: string | null): string | null {
  if (!name) return null;
  const k = name.trim().toLowerCase();
  return COUNTRY_ISO2[k] || null;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Publication month comes from the issue number (issue 7 → July) and the year
 * from publication_year, falling back to the volume (Vol. 12 → 2026).
 */
function publishedOnLabel(article: PublicationCardData) {
  const issueNum = parseInt(String(article.issue ?? '').trim(), 10);
  const month = issueNum >= 1 && issueNum <= 12 ? MONTH_NAMES[issueNum - 1] : '';

  let year = '';
  const yMatch = String(article.publication_year ?? '').match(/\d{4}/);
  if (yMatch) {
    year = yMatch[0];
  } else {
    const volNum = parseInt(String(article.volume ?? '').trim(), 10);
    if (volNum >= 1) year = String(2014 + volNum);
  }

  return [month, year].filter(Boolean).join(' ');
}

function safeFileName(value: string) {
  return value.replace(/[^a-z0-9-_]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'publication-card';
}

function resolveAssetUrl(url: string) {
  if (url.startsWith('http')) return url;
  return `${window.location.origin}${url}`;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines: string[] = [];
  let current = '';

  words.forEach((word) => {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth || !current) {
      current = test;
    } else {
      lines.push(current);
      current = word;
    }
  });

  if (current) lines.push(current);
  return lines;
}

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
) {
  const lines = wrapText(ctx, text, maxWidth);
  const visible = lines.slice(0, maxLines);
  visible.forEach((line, index) => {
    let output = line;
    if (index === maxLines - 1 && lines.length > maxLines) {
      while (ctx.measureText(`${output}…`).width > maxWidth && output.length > 0) {
        output = output.slice(0, -1).trim();
      }
      output = `${output}…`;
    }
    ctx.fillText(output, x, y + index * lineHeight);
  });
  return visible.length * lineHeight;
}

function drawContainedImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const ratio = Math.min(width / img.naturalWidth, height / img.naturalHeight);
  const drawWidth = img.naturalWidth * ratio;
  const drawHeight = img.naturalHeight * ratio;
  ctx.drawImage(img, x, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

function drawCircularAvatar(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  initials: string,
  cx: number,
  cy: number,
  radius: number,
) {
  ctx.save();
  // Outer ring
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2);
  ctx.fillStyle = '#1e6feb';
  ctx.fill();
  // Clip inner circle
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  if (img) {
    const size = radius * 2;
    const scale = Math.max(size / img.naturalWidth, size / img.naturalHeight);
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
  } else {
    ctx.fillStyle = '#dbe6f5';
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    ctx.fillStyle = '#0b3a8f';
    ctx.font = `800 ${Math.round(radius * 0.9)}px Arial, Helvetica, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials || '?', cx, cy + 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }
  ctx.restore();
}

function drawMetaChip(
  ctx: CanvasRenderingContext2D,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
) {
  ctx.save();
  roundRect(ctx, x, y, width, 82, 18);
  ctx.fillStyle = '#f8fbff';
  ctx.fill();
  ctx.strokeStyle = '#dbe6f5';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#1e6feb';
  ctx.font = '700 18px Arial, Helvetica, sans-serif';
  ctx.fillText(label, x + 20, y + 30);
  ctx.fillStyle = '#0f172a';
  ctx.font = '800 22px Arial, Helvetica, sans-serif';
  drawWrappedText(ctx, value, x + 20, y + 60, width - 40, 24, 1);
  ctx.restore();
}

function makeCaption(
  article: PublicationCardData,
  publishedOn: string,
  volume: string,
  issue: string,
  pages: string,
  publishedLink: string,
) {
  return [
    '🎉 Congratulations! Published in WWJMRD',
    '',
    `📄 ${article.title}`,
    article.author_name ? `✍️ ${article.author_name}${article.country ? `, ${article.country}` : ''}` : '',
    publishedOn ? `🗓️ ${publishedOn}` : '',
    volume || issue ? `📚 Vol. ${volume || '—'} · Issue ${issue || '—'}${pages ? ` · Pages ${pages}` : ''}` : '',
    '',
    `Read the full article: ${publishedLink}`,
    '',
    '#WWJMRD #Research #Published #OpenAccess',
  ]
    .filter(Boolean)
    .join('\n');
}

function getInitials(name?: string | null) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] || '') + (parts[1]?.[0] || '');
}

async function createPublicationCanvas(
  article: PublicationCardData,
  publishedLink: string,
  avatarUrl: string | null,
  country: string | null,
) {
  const publishedOn = monthYearFromYearField(article.publication_year);
  const volume = article.volume || '';
  const issue = article.issue || '';
  const pages = article.page_number || '';
  const qrDataUrl = await QRCode.toDataURL(publishedLink, {
    errorCorrectionLevel: 'H',
    margin: 1,
    width: 900,
    color: { dark: '#0b3a8f', light: '#ffffff' },
  });

  const iso2 = countryToIso2(country);
  const flagUrl = iso2 ? `https://flagcdn.com/w160/${iso2}.png` : null;

  const [logo, qr, avatar, flag] = await Promise.all([
    loadImage(resolveAssetUrl(logoAsset.url)),
    loadImage(qrDataUrl),
    avatarUrl ? loadImage(avatarUrl) : Promise.resolve(null),
    flagUrl ? loadImage(flagUrl) : Promise.resolve(null),
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = CARD_SIZE * EXPORT_SCALE;
  canvas.height = CARD_SIZE * EXPORT_SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  ctx.scale(EXPORT_SCALE, EXPORT_SCALE);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const blue = '#0b3a8f';
  const brightBlue = '#1e6feb';
  const text = '#0f172a';

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, CARD_SIZE, CARD_SIZE);

  const panelGradient = ctx.createLinearGradient(830, 0, 1200, 1200);
  panelGradient.addColorStop(0, '#2476ff');
  panelGradient.addColorStop(1, blue);
  ctx.fillStyle = panelGradient;
  ctx.beginPath();
  ctx.moveTo(850, 0);
  ctx.lineTo(1200, 0);
  ctx.lineTo(1200, 1200);
  ctx.lineTo(780, 1200);
  ctx.quadraticCurveTo(660, 430, 850, 0);
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = 0.16;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(1160, 180, 210, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(890, 1070, 260, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  if (logo) drawContainedImage(ctx, logo, 56, 46, 460, 112);

  ctx.fillStyle = '#e6f0ff';
  ctx.textAlign = 'right';
  ctx.font = '600 19px Arial, Helvetica, sans-serif';
  ['Advancing Knowledge', 'Empowering Researchers', 'Impacting the World'].forEach((line, index) => {
    ctx.fillText(line, 1148, 70 + index * 28);
  });
  ctx.textAlign = 'left';

  ctx.fillStyle = brightBlue;
  ctx.font = 'italic 700 48px Georgia, serif';
  ctx.fillText('Congratulations!', 56, 218);

  ctx.fillStyle = blue;
  ctx.font = '900 96px Arial, Helvetica, sans-serif';
  ctx.fillText('PUBLISHED', 56, 318);

  ctx.strokeStyle = brightBlue;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(58, 350);
  ctx.lineTo(146, 350);
  ctx.moveTo(372, 350);
  ctx.lineTo(460, 350);
  ctx.stroke();
  ctx.fillStyle = brightBlue;
  ctx.font = '800 20px Arial, Helvetica, sans-serif';
  ctx.fillText('IN WWJMRD', 165, 357);

  const pillGradient = ctx.createLinearGradient(56, 386, 360, 386);
  pillGradient.addColorStop(0, brightBlue);
  pillGradient.addColorStop(1, '#4a90ff');
  roundRect(ctx, 56, 384, 252, 48, 24);
  ctx.fillStyle = pillGradient;
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 18px Arial, Helvetica, sans-serif';
  ctx.fillText('RESEARCH ARTICLE', 84, 415);

  ctx.fillStyle = text;
  ctx.font = '900 34px Arial, Helvetica, sans-serif';
  let cursorY = 480;
  cursorY += drawWrappedText(ctx, article.title, 56, cursorY, 640, 44, 4);

  cursorY += 30;
  cursorY = Math.min(cursorY, 674);

  // Circular avatar + author block
  const avatarRadius = 44;
  const avatarCx = 56 + avatarRadius;
  const avatarCy = cursorY + avatarRadius - 8;
  drawCircularAvatar(ctx, avatar, getInitials(article.author_name).toUpperCase(), avatarCx, avatarCy, avatarRadius);

  const authorTextX = avatarCx + avatarRadius + 18;
  ctx.fillStyle = brightBlue;
  ctx.font = '800 30px Arial, Helvetica, sans-serif';
  drawWrappedText(ctx, article.author_name || 'Author', authorTextX, cursorY + 20, 520, 36, 1);

  // Country line with flag
  const countryLineY = cursorY + 56;
  let countryX = authorTextX;
  if (flag) {
    const flagW = 34;
    const flagH = 22;
    ctx.save();
    roundRect(ctx, countryX, countryLineY - flagH + 4, flagW, flagH, 3);
    ctx.clip();
    ctx.drawImage(flag, countryX, countryLineY - flagH + 4, flagW, flagH);
    ctx.restore();
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    roundRect(ctx, countryX, countryLineY - flagH + 4, flagW, flagH, 3);
    ctx.stroke();
    countryX += flagW + 10;
  }
  if (country) {
    ctx.fillStyle = '#475569';
    ctx.font = '700 20px Arial, Helvetica, sans-serif';
    ctx.fillText(country, countryX, countryLineY);
  }

  const chipY = 770;
  drawMetaChip(ctx, 'PUBLISHED IN', publishedOn || '—', 56, chipY, 224);
  drawMetaChip(ctx, 'VOLUME · ISSUE', `Vol. ${volume || '—'} · Issue ${issue || '—'}`, 298, chipY, 250);
  drawMetaChip(ctx, 'PAGES', pages || '—', 566, chipY, 154);

  const highlightY = chipY + 112;
  roundRect(ctx, 56, highlightY, 664, 164, 22);
  ctx.fillStyle = '#f1f5fb';
  ctx.fill();
  ctx.strokeStyle = '#dbe6f5';
  ctx.lineWidth = 2;
  ctx.stroke();
  roundRect(ctx, 78, highlightY + 18, 230, 34, 10);
  ctx.fillStyle = blue;
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 15px Arial, Helvetica, sans-serif';
  ctx.fillText('RESEARCH HIGHLIGHTS', 94, highlightY + 41);

  const highlights = article.keywords?.length
    ? article.keywords.slice(0, 3)
    : article.abstract
      ? [article.abstract]
      : ['Open access publication', 'Peer-reviewed research', 'Global multidisciplinary readership'];
  ctx.font = '700 20px Arial, Helvetica, sans-serif';
  let hY = highlightY + 82;
  highlights.slice(0, 3).forEach((item) => {
    ctx.fillStyle = brightBlue;
    ctx.fillText('✓', 80, hY);
    ctx.fillStyle = '#334155';
    const used = drawWrappedText(ctx, item, 112, hY, 570, 26, 1);
    hY += Math.max(used, 26) + 8;
  });

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = '900 30px Arial, Helvetica, sans-serif';
  ctx.fillText('SCAN TO READ', 1010, 292);
  ctx.font = '700 20px Arial, Helvetica, sans-serif';
  ctx.fillText('THE FULL ARTICLE', 1010, 324);

  roundRect(ctx, 846, 358, 328, 328, 24);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  if (qr) ctx.drawImage(qr, 868, 380, 284, 284);

  const siteGradient = ctx.createLinearGradient(840, 725, 1160, 725);
  siteGradient.addColorStop(0, '#4a90ff');
  siteGradient.addColorStop(1, brightBlue);
  roundRect(ctx, 850, 724, 320, 52, 26);
  ctx.fillStyle = siteGradient;
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 20px Arial, Helvetica, sans-serif';
  ctx.fillText('www.wwjmrd.online', 1010, 758);
  ctx.textAlign = 'left';

  ctx.fillStyle = blue;
  ctx.fillRect(0, 1112, CARD_SIZE, 88);
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 23px Arial, Helvetica, sans-serif';
  ctx.fillText('www.wwjmrd.online', 56, 1146);
  ctx.font = '600 16px Arial, Helvetica, sans-serif';
  ctx.fillText('Your Research. Our Platform. Global Impact.', 56, 1172);
  ctx.textAlign = 'right';
  ctx.font = '800 17px Arial, Helvetica, sans-serif';
  ctx.fillText('Indexed | Peer Reviewed', 1144, 1146);
  ctx.fillText('Multidisciplinary | Open Access', 1144, 1172);
  ctx.textAlign = 'left';

  return canvas;
}

export function PublicationCard({ article }: { article: PublicationCardData }) {
  const { user } = useAuth();
  const [busy, setBusy] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [previewUrl, setPreviewUrl] = React.useState<string>('');
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(article.author_avatar_url || null);
  const [country, setCountry] = React.useState<string | null>(article.country || null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const isOwner = !!user && !!article.author_id && user.id === article.author_id;

  // Fetch author profile (avatar + country) if we don't have them
  React.useEffect(() => {
    let cancelled = false;
    if (!article.author_id) return;
    if (article.author_avatar_url && article.country) {
      setAvatarUrl(article.author_avatar_url);
      setCountry(article.country);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('avatar_url, country')
        .eq('id', article.author_id!)
        .maybeSingle();
      if (cancelled || !data) return;
      setAvatarUrl((prev) => prev || data.avatar_url || null);
      setCountry((prev) => prev || data.country || null);
    })();
    return () => {
      cancelled = true;
    };
  }, [article.author_id, article.author_avatar_url, article.country]);

  const publishedLink =
    article.published_link ||
    `${window.location.origin}/articles/${encodeURIComponent(article.reference_number || article.id)}`;
  const publishedOn = monthYearFromYearField(article.publication_year);
  const volume = article.volume || '';
  const issue = article.issue || '';
  const pages = article.page_number || '';

  const caption = React.useMemo(
    () => makeCaption(article, publishedOn, volume, issue, pages, publishedLink),
    [article, publishedOn, volume, issue, pages, publishedLink],
  );

  const fileName = `WWJMRD-${safeFileName(article.reference_number || article.id)}.png`;

  const getCardFile = async (): Promise<{ blob: Blob; file: File; url: string }> => {
    const canvas = await createPublicationCanvas(article, publishedLink, avatarUrl, country);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png', 1));
    if (!blob) throw new Error('Failed to create card image');
    const file = new File([blob], fileName, { type: 'image/png' });
    return { blob, file, url: URL.createObjectURL(blob) };
  };

  React.useEffect(() => {
    let cancelled = false;
    createPublicationCanvas(article, publishedLink, avatarUrl, country)
      .then((canvas) => {
        if (!cancelled) setPreviewUrl(canvas.toDataURL('image/png', 1));
      })
      .catch(() => {
        if (!cancelled) setPreviewUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, [article, publishedLink, avatarUrl, country]);

  const handleAvatarUpload = async (file: File) => {
    if (!user) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5MB');
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      const publicUrl = urlData.publicUrl;
      const { error: profErr } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id);
      if (profErr) throw profErr;
      setAvatarUrl(publicUrl);
      toast.success('Profile picture updated');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to upload picture');
    } finally {
      setUploading(false);
    }
  };

  const copyCaption = async () => {
    try {
      await navigator.clipboard.writeText(caption);
      toast.success('Caption copied');
    } catch {
      toast.error('Could not copy caption');
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publishedLink);
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy link');
    }
  };

  const downloadImage = async () => {
    try {
      setBusy(true);
      const res = await getCardFile();
      const link = document.createElement('a');
      link.download = fileName;
      link.href = res.url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(res.url), 1000);
      toast.success('Screenshot card downloaded with QR code');
    } catch {
      toast.error('Failed to create screenshot card');
    } finally {
      setBusy(false);
    }
  };

  const shareNative = async () => {
    try {
      setBusy(true);
      const res = await getCardFile();
      const shareData: ShareData & { files?: File[] } = {
        title: article.title,
        text: caption,
        url: publishedLink,
      };
      if ((navigator as any).canShare?.({ files: [res.file] })) {
        shareData.files = [res.file];
      }
      if (navigator.share) {
        await navigator.share(shareData);
        toast.success('Card and caption shared');
      } else {
        const link = document.createElement('a');
        link.download = fileName;
        link.href = res.url;
        link.click();
        await navigator.clipboard.writeText(caption);
        toast.success('Card downloaded and caption copied');
      }
      setTimeout(() => URL.revokeObjectURL(res.url), 1000);
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') toast.error('Sharing was not completed');
    } finally {
      setBusy(false);
    }
  };

  const shareToPlatform = async (
    platform: 'whatsapp' | 'facebook' | 'twitter' | 'linkedin' | 'telegram' | 'instagram',
  ) => {
    const popup = window.open('', '_blank');
    if (popup) popup.opener = null;
    try {
      setBusy(true);
      const res = await getCardFile();
      try {
        await navigator.clipboard.writeText(caption);
      } catch {}

      if (platform === 'instagram' && navigator.share && (navigator as any).canShare?.({ files: [res.file] })) {
        popup?.close();
        await navigator.share({ title: article.title, text: caption, files: [res.file] } as ShareData & { files: File[] });
        toast.success('Choose Instagram and paste the copied caption');
        setTimeout(() => URL.revokeObjectURL(res.url), 1000);
        return;
      }

      if (navigator.share && (navigator as any).canShare?.({ files: [res.file] })) {
        popup?.close();
        await navigator.share({ title: article.title, text: caption, files: [res.file] } as ShareData & { files: File[] });
        toast.success('Card PNG and caption shared');
        setTimeout(() => URL.revokeObjectURL(res.url), 1000);
        return;
      }

      const link = document.createElement('a');
      link.download = fileName;
      link.href = res.url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      const urls: Record<typeof platform, string> = {
        whatsapp: `https://api.whatsapp.com/send?text=${encodeURIComponent(caption)}`,
        facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(publishedLink)}&quote=${encodeURIComponent(caption)}`,
        twitter: `https://twitter.com/intent/tweet?url=${encodeURIComponent(publishedLink)}&text=${encodeURIComponent(`Published in WWJMRD: ${article.title}`)}`,
        linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(publishedLink)}`,
        telegram: `https://t.me/share/url?url=${encodeURIComponent(publishedLink)}&text=${encodeURIComponent(caption)}`,
        instagram: 'https://www.instagram.com/',
      };
      if (popup) {
        popup.location.href = urls[platform];
      } else {
        window.open(urls[platform], '_blank', 'noopener,noreferrer');
      }
      toast.success('Screenshot card downloaded and caption copied — upload the PNG in the opened app');
      setTimeout(() => URL.revokeObjectURL(res.url), 1000);
    } catch (error) {
      popup?.close();
      if ((error as Error)?.name !== 'AbortError') toast.error('Could not prepare share card');
    } finally {
      setBusy(false);
    }
  };

  const showMissingAvatarBanner = isOwner && !avatarUrl;

  return (
    <div className="space-y-4">
      {showMissingAvatarBanner && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-amber-700 dark:text-amber-300">
              Add a profile picture for a more personal card
            </p>
            <p className="text-xs text-muted-foreground">
              Your publication card is showing your initials. Upload a photo to make it stand out.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <Upload className="w-4 h-4 mr-1" />
            {uploading ? 'Uploading…' : 'Add Profile Picture'}
          </Button>
        </div>
      )}

      {isOwner && avatarUrl && (
        <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-background/40 p-2 text-xs">
          <img src={avatarUrl} alt="Your profile" className="w-8 h-8 rounded-full object-cover" />
          <span className="text-muted-foreground flex-1">Profile picture on card</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="h-7 px-2 text-xs"
          >
            <Upload className="w-3 h-3 mr-1" />
            {uploading ? 'Uploading…' : 'Change'}
          </Button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleAvatarUpload(f);
          e.target.value = '';
        }}
      />

      <div className="w-full overflow-auto">
        <div className="mx-auto w-[900px] max-w-full">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt={`Publication card for ${article.title}`}
              className="block w-full rounded-lg border border-border/50 bg-white"
            />
          ) : (
            <div className="flex aspect-square w-full items-center justify-center rounded-lg border border-border/50 bg-background/40 text-sm text-muted-foreground">
              Creating screenshot card…
            </div>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border/50 bg-background/40 p-3">
        <div className="mb-2 flex items-center justify-between text-xs font-semibold text-muted-foreground">
          <span>Caption</span>
          <Button variant="ghost" size="sm" onClick={copyCaption} className="h-7 px-2 text-xs">
            <Copy className="mr-1 h-3 w-3" /> Copy
          </Button>
        </div>
        <pre className="whitespace-pre-wrap font-sans text-xs text-foreground/90">{caption}</pre>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={downloadImage} disabled={busy}>
          <Download className="mr-1 h-4 w-4" /> Download PNG
        </Button>
        <Button size="sm" variant="outline" onClick={shareNative} disabled={busy}>
          <Share2 className="mr-1 h-4 w-4" /> Share Card + Caption
        </Button>
        <Button size="sm" variant="outline" onClick={() => shareToPlatform('whatsapp')} disabled={busy}>
          <MessageCircle className="mr-1 h-4 w-4" /> WhatsApp
        </Button>
        <Button size="sm" variant="outline" onClick={() => shareToPlatform('facebook')} disabled={busy}>
          <Facebook className="mr-1 h-4 w-4" /> Facebook
        </Button>
        <Button size="sm" variant="outline" onClick={() => shareToPlatform('twitter')} disabled={busy}>
          <Twitter className="mr-1 h-4 w-4" /> X / Twitter
        </Button>
        <Button size="sm" variant="outline" onClick={() => shareToPlatform('linkedin')} disabled={busy}>
          <Linkedin className="mr-1 h-4 w-4" /> LinkedIn
        </Button>
        <Button size="sm" variant="outline" onClick={() => shareToPlatform('instagram')} disabled={busy}>
          <Instagram className="mr-1 h-4 w-4" /> Instagram
        </Button>
        <Button size="sm" variant="outline" onClick={() => shareToPlatform('telegram')} disabled={busy}>
          <Send className="mr-1 h-4 w-4" /> Telegram
        </Button>
        <Button size="sm" variant="ghost" onClick={copyLink}>
          <QrCode className="mr-1 h-4 w-4" /> Copy Link
        </Button>
      </div>
    </div>
  );
}
