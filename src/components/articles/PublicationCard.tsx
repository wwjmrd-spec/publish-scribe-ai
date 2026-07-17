import React from 'react';
import QRCode from 'qrcode';
import html2canvas from 'html2canvas';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Download,
  Share2,
  Copy,
  Facebook,
  Linkedin,
  Twitter,
  MessageCircle,
  Send,
  QrCode,
} from 'lucide-react';
import logoAsset from '@/assets/wwjmrd-logo.png.asset.json';

export interface PublicationCardData {
  id: string;
  reference_number?: string | null;
  title: string;
  author_name?: string | null;
  country?: string | null;
  publication_year?: string | null;
  volume?: string | null;
  issue?: string | null;
  page_number?: string | null;
  published_link?: string | null;
  keywords?: string[] | null;
  abstract?: string | null;
}

function monthYearFromYearField(y?: string | null) {
  if (!y) return '';
  const d = new Date(y);
  if (!isNaN(d.getTime())) {
    return d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  }
  return y;
}

export function PublicationCard({ article }: { article: PublicationCardData }) {
  const cardRef = React.useRef<HTMLDivElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [qrDataUrl, setQrDataUrl] = React.useState<string>('');

  const publishedLink =
    article.published_link ||
    `${window.location.origin}/articles/${encodeURIComponent(article.reference_number || article.id)}`;

  const publishedOn = monthYearFromYearField(article.publication_year);
  const volume = article.volume || '';
  const issue = article.issue || '';
  const pages = article.page_number || '';

  // Generate QR as PNG data URL so html2canvas captures it reliably.
  React.useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(publishedLink, {
      errorCorrectionLevel: 'H',
      margin: 1,
      width: 512,
      color: { dark: '#0b3a8f', light: '#ffffff' },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [publishedLink]);

  const caption = React.useMemo(() => {
    const parts = [
      `🎉 Congratulations! Published in WWJMRD`,
      ``,
      `📄 ${article.title}`,
      article.author_name ? `✍️ ${article.author_name}${article.country ? `, ${article.country}` : ''}` : '',
      publishedOn ? `🗓️ ${publishedOn}` : '',
      volume || issue ? `📚 Vol. ${volume || '—'} · Issue ${issue || '—'}${pages ? ` · Pages ${pages}` : ''}` : '',
      ``,
      `Read the full article: ${publishedLink}`,
      ``,
      `#WWJMRD #Research #Published #OpenAccess`,
    ].filter(Boolean);
    return parts.join('\n');
  }, [article, publishedOn, volume, issue, pages, publishedLink]);

  const waitForImages = async (root: HTMLElement) => {
    const imgs = Array.from(root.querySelectorAll('img')) as HTMLImageElement[];
    await Promise.all(
      imgs.map(
        (img) =>
          new Promise<void>((resolve) => {
            if (img.complete && img.naturalWidth > 0) return resolve();
            const done = () => resolve();
            img.addEventListener('load', done, { once: true });
            img.addEventListener('error', done, { once: true });
            setTimeout(done, 4000);
          }),
      ),
    );
  };

  const renderCanvas = async () => {
    if (!cardRef.current) return null;
    await waitForImages(cardRef.current);
    return await html2canvas(cardRef.current, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      allowTaint: true,
      logging: false,
      windowWidth: cardRef.current.scrollWidth,
      windowHeight: cardRef.current.scrollHeight,
    });
  };

  const getBlob = async (): Promise<{ blob: Blob; file: File } | null> => {
    const canvas = await renderCanvas();
    if (!canvas) return null;
    const blob: Blob | null = await new Promise((r) => canvas.toBlob((b) => r(b), 'image/png', 1));
    if (!blob) return null;
    const file = new File(
      [blob],
      `WWJMRD-${article.reference_number || article.id}.png`,
      { type: 'image/png' },
    );
    return { blob, file };
  };

  const downloadImage = async () => {
    try {
      setBusy(true);
      const res = await getBlob();
      if (!res) return;
      const url = URL.createObjectURL(res.blob);
      const link = document.createElement('a');
      link.download = res.file.name;
      link.href = url;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success('Card downloaded');
    } catch (e) {
      toast.error('Failed to generate image');
    } finally {
      setBusy(false);
    }
  };

  const copyCaption = async () => {
    try {
      await navigator.clipboard.writeText(caption);
      toast.success('Caption copied');
    } catch {
      toast.error('Could not copy');
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publishedLink);
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy');
    }
  };

  const nativeShare = async () => {
    try {
      setBusy(true);
      const res = await getBlob();
      const files = res ? [res.file] : [];
      const shareData: any = { title: article.title, text: caption, url: publishedLink };
      if (files.length && (navigator as any).canShare?.({ files })) {
        shareData.files = files;
      }
      if ((navigator as any).share) {
        await (navigator as any).share(shareData);
      } else {
        // Fallback: download image and copy caption so user can paste anywhere
        if (res) {
          const url = URL.createObjectURL(res.blob);
          const link = document.createElement('a');
          link.download = res.file.name;
          link.href = url;
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
        await copyCaption();
        toast.success('Card downloaded & caption copied — paste it with the image');
      }
    } catch {
      /* user cancelled */
    } finally {
      setBusy(false);
    }
  };

  // For platforms that don't support attaching a file via URL scheme,
  // download the PNG first and copy the caption so the user can attach + paste.
  const shareToPlatform = async (
    platform: 'whatsapp' | 'facebook' | 'twitter' | 'linkedin' | 'telegram',
  ) => {
    try {
      setBusy(true);
      const res = await getBlob();
      if (res) {
        const url = URL.createObjectURL(res.blob);
        const link = document.createElement('a');
        link.download = res.file.name;
        link.href = url;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      try {
        await navigator.clipboard.writeText(caption);
      } catch {}
      const urls: Record<string, string> = {
        whatsapp: `https://api.whatsapp.com/send?text=${encodeURIComponent(caption)}`,
        facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(publishedLink)}&quote=${encodeURIComponent(caption)}`,
        twitter: `https://twitter.com/intent/tweet?url=${encodeURIComponent(publishedLink)}&text=${encodeURIComponent(`Published in WWJMRD: ${article.title}`)}`,
        linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(publishedLink)}`,
        telegram: `https://t.me/share/url?url=${encodeURIComponent(publishedLink)}&text=${encodeURIComponent(caption)}`,
      };
      window.open(urls[platform], '_blank', 'noopener,noreferrer');
      toast.success('Card downloaded & caption copied — attach the image and paste the caption');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* The card that will be exported */}
      <div className="w-full overflow-auto">
        <div
          ref={cardRef}
          className="mx-auto"
          style={{
            width: 900,
            height: 900,
            background: '#ffffff',
            color: '#0f172a',
            fontFamily: 'Arial, Helvetica, sans-serif',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Right decorative panel */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: 360,
              height: '100%',
              background: 'linear-gradient(180deg, #1e6feb 0%, #0b3a8f 100%)',
              borderTopLeftRadius: 220,
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: 40,
              right: 30,
              color: '#e6f0ff',
              textAlign: 'right',
              lineHeight: '1.35',
              fontSize: 14,
              fontWeight: 500,
              width: 300,
            }}
          >
            Advancing Knowledge<br />
            Empowering Researchers<br />
            Impacting the World
          </div>

          {/* Header with logo */}
          <div style={{ padding: '32px 40px 0 40px' }}>
            <img
              src={logoAsset.url}
              alt="WWJMRD"
              crossOrigin="anonymous"
              style={{ height: 70, width: 'auto', display: 'block' }}
            />
          </div>

          {/* Congratulations block */}
          <div style={{ padding: '20px 40px 0 40px' }}>
            <div
              style={{
                fontFamily: 'Georgia, serif',
                fontStyle: 'italic',
                fontSize: 34,
                color: '#1e6feb',
                lineHeight: '1',
              }}
            >
              Congratulations!
            </div>
            <div
              style={{
                fontSize: 72,
                fontWeight: 900,
                color: '#0b3a8f',
                lineHeight: '1',
                letterSpacing: '-2px',
                marginTop: 8,
              }}
            >
              PUBLISHED
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
              <div style={{ height: 2, width: 60, background: '#1e6feb' }} />
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1e6feb', letterSpacing: '4px' }}>
                IN WWJMRD
              </div>
              <div style={{ height: 2, width: 60, background: '#1e6feb' }} />
            </div>

            <div
              style={{
                display: 'inline-block',
                marginTop: 18,
                background: 'linear-gradient(90deg, #1e6feb, #4a90ff)',
                color: '#ffffff',
                padding: '8px 22px',
                borderRadius: 30,
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: '2px',
              }}
            >
              RESEARCH ARTICLE
            </div>

            {/* Title */}
            <div
              style={{
                marginTop: 18,
                fontSize: 24,
                fontWeight: 800,
                color: '#0f172a',
                lineHeight: '1.3',
                maxWidth: 480,
              }}
            >
              {article.title}
            </div>

            {/* Author */}
            <div style={{ marginTop: 18, maxWidth: 480 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#1e6feb', lineHeight: '1.2' }}>
                {article.author_name || 'Author'}
              </div>
              {article.country && (
                <div style={{ fontSize: 13, color: '#475569', fontWeight: 600, marginTop: 4 }}>
                  {article.country}
                </div>
              )}
            </div>

            {/* Meta pills */}
            <div
              style={{
                marginTop: 18,
                display: 'flex',
                gap: 10,
                flexWrap: 'wrap',
                maxWidth: 500,
              }}
            >
              <MetaChip label="PUBLISHED IN" value={publishedOn || '—'} />
              <MetaChip label="VOLUME · ISSUE" value={`Vol. ${volume || '—'} · Issue ${issue || '—'}`} />
              <MetaChip label="PAGES" value={pages || '—'} />
            </div>

            {/* Highlights */}
            {(article.keywords?.length || article.abstract) && (
              <div
                style={{
                  marginTop: 18,
                  padding: '14px 16px',
                  background: '#f1f5fb',
                  border: '1px solid #dbe6f5',
                  borderRadius: 10,
                  maxWidth: 500,
                }}
              >
                <div
                  style={{
                    display: 'inline-block',
                    background: '#0b3a8f',
                    color: '#ffffff',
                    padding: '4px 14px',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '1.5px',
                    marginBottom: 10,
                  }}
                >
                  RESEARCH HIGHLIGHTS
                </div>
                <div>
                  {(article.keywords?.slice(0, 3) || []).map((k, i) => (
                    <div
                      key={i}
                      style={{ fontSize: 13, color: '#334155', lineHeight: '1.5', marginBottom: 4 }}
                    >
                      <span style={{ color: '#1e6feb', fontWeight: 700, marginRight: 6 }}>✓</span>
                      {k}
                    </div>
                  ))}
                  {(!article.keywords || article.keywords.length === 0) && article.abstract && (
                    <div style={{ fontSize: 12, color: '#475569', lineHeight: '1.5' }}>
                      {article.abstract.slice(0, 180)}
                      {article.abstract.length > 180 ? '…' : ''}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* QR panel (right) */}
          <div
            style={{
              position: 'absolute',
              top: 200,
              right: 30,
              width: 300,
              textAlign: 'center',
              color: '#ffffff',
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '1px', lineHeight: '1.2' }}>
              SCAN TO READ
            </div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                opacity: 0.9,
                marginTop: 4,
                marginBottom: 14,
              }}
            >
              THE FULL ARTICLE
            </div>
            <div
              style={{
                background: '#ffffff',
                padding: 14,
                borderRadius: 12,
                display: 'inline-block',
              }}
            >
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="QR"
                  style={{ width: 220, height: 220, display: 'block' }}
                />
              ) : (
                <div style={{ width: 220, height: 220, background: '#eee' }} />
              )}
            </div>
            <div
              style={{
                marginTop: 14,
                background: 'linear-gradient(90deg, #4a90ff, #1e6feb)',
                color: '#ffffff',
                padding: '8px 18px',
                borderRadius: 30,
                fontSize: 13,
                fontWeight: 700,
                display: 'inline-block',
              }}
            >
              www.wwjmrd.online
            </div>
          </div>

          {/* Footer bar */}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: 70,
              background: '#0b3a8f',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              padding: '0 40px',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>www.wwjmrd.online</div>
              <div style={{ fontSize: 10, opacity: 0.85, marginTop: 2 }}>
                Your Research. Our Platform. Global Impact.
              </div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 11, lineHeight: '1.4' }}>
              Indexed | Peer Reviewed<br />
              Multidisciplinary | Open Access
            </div>
          </div>
        </div>
      </div>

      {/* Caption */}
      <div className="rounded-lg border border-border/50 bg-background/40 p-3">
        <div className="text-xs font-semibold text-muted-foreground mb-2 flex items-center justify-between">
          <span>Caption</span>
          <Button variant="ghost" size="sm" onClick={copyCaption} className="h-7 px-2 text-xs">
            <Copy className="w-3 h-3 mr-1" /> Copy
          </Button>
        </div>
        <pre className="whitespace-pre-wrap text-xs text-foreground/90 font-sans">{caption}</pre>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={downloadImage} disabled={busy}>
          <Download className="w-4 h-4 mr-1" /> Download Card
        </Button>
        <Button size="sm" variant="outline" onClick={nativeShare} disabled={busy}>
          <Share2 className="w-4 h-4 mr-1" /> Share (image + caption)
        </Button>
        <Button size="sm" variant="outline" onClick={() => shareToPlatform('whatsapp')} disabled={busy}>
          <MessageCircle className="w-4 h-4 mr-1" /> WhatsApp
        </Button>
        <Button size="sm" variant="outline" onClick={() => shareToPlatform('facebook')} disabled={busy}>
          <Facebook className="w-4 h-4 mr-1" /> Facebook
        </Button>
        <Button size="sm" variant="outline" onClick={() => shareToPlatform('twitter')} disabled={busy}>
          <Twitter className="w-4 h-4 mr-1" /> X / Twitter
        </Button>
        <Button size="sm" variant="outline" onClick={() => shareToPlatform('linkedin')} disabled={busy}>
          <Linkedin className="w-4 h-4 mr-1" /> LinkedIn
        </Button>
        <Button size="sm" variant="outline" onClick={() => shareToPlatform('telegram')} disabled={busy}>
          <Send className="w-4 h-4 mr-1" /> Telegram
        </Button>
        <Button size="sm" variant="ghost" onClick={copyLink}>
          <QrCode className="w-4 h-4 mr-1" /> Copy Link
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Tip: WhatsApp/Facebook/X don't accept image uploads via web links. We download the card and copy
        the caption for you — just attach the PNG and paste the caption in the opened compose window.
      </p>
    </div>
  );
}

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: '10px 14px',
        border: '1px solid #dbe6f5',
        borderRadius: 10,
        background: '#f8fbff',
        minWidth: 140,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: '#1e6feb',
          letterSpacing: '1px',
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{value}</div>
    </div>
  );
}
