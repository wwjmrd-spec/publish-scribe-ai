import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
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
  // publication_year may be "2026" or "July 2026" or ISO date
  const d = new Date(y);
  if (!isNaN(d.getTime())) {
    return d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  }
  return y;
}

export function PublicationCard({ article }: { article: PublicationCardData }) {
  const cardRef = React.useRef<HTMLDivElement>(null);
  const [busy, setBusy] = React.useState(false);

  const publishedLink =
    article.published_link ||
    `${window.location.origin}/articles/${encodeURIComponent(article.reference_number || article.id)}`;

  const publishedOn = monthYearFromYearField(article.publication_year);
  const volume = article.volume || '';
  const issue = article.issue || '';
  const pages = article.page_number || '';

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

  const renderCanvas = async () => {
    if (!cardRef.current) return null;
    // Larger scale for HD output
    return await html2canvas(cardRef.current, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
    });
  };

  const downloadImage = async () => {
    try {
      setBusy(true);
      const canvas = await renderCanvas();
      if (!canvas) return;
      const link = document.createElement('a');
      link.download = `WWJMRD-${article.reference_number || article.id}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      toast.success('Card downloaded');
    } catch (e: any) {
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
      const canvas = await renderCanvas();
      const files: File[] = [];
      if (canvas) {
        const blob: Blob | null = await new Promise((r) => canvas.toBlob((b) => r(b), 'image/png'));
        if (blob) files.push(new File([blob], `WWJMRD-${article.reference_number || article.id}.png`, { type: 'image/png' }));
      }
      const shareData: any = {
        title: article.title,
        text: caption,
        url: publishedLink,
      };
      if (files.length && (navigator as any).canShare?.({ files })) {
        shareData.files = files;
      }
      if ((navigator as any).share) {
        await (navigator as any).share(shareData);
      } else {
        await copyCaption();
      }
    } catch {
      /* user cancelled */
    } finally {
      setBusy(false);
    }
  };

  const shareUrls = {
    whatsapp: `https://api.whatsapp.com/send?text=${encodeURIComponent(caption)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(publishedLink)}&quote=${encodeURIComponent(caption)}`,
    twitter: `https://twitter.com/intent/tweet?url=${encodeURIComponent(publishedLink)}&text=${encodeURIComponent(`Published in WWJMRD: ${article.title}`)}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(publishedLink)}`,
    telegram: `https://t.me/share/url?url=${encodeURIComponent(publishedLink)}&text=${encodeURIComponent(caption)}`,
  };

  const openShare = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
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
            minHeight: 900,
            background: '#ffffff',
            color: '#0f172a',
            fontFamily: 'Inter, "Helvetica Neue", Arial, sans-serif',
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
              lineHeight: 1.35,
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            Advancing Knowledge<br />
            Empowering Researchers<br />
            Impacting the World
          </div>

          {/* Header */}
          <div style={{ padding: '32px 40px 0 40px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 10,
                background: '#1e6feb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: 32,
                fontWeight: 700,
              }}
            >
              📖
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#0b3a8f', letterSpacing: -0.5 }}>
                WORLD WIDE <span style={{ color: '#1e6feb' }}>JOURNAL</span>
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#334155', letterSpacing: 1 }}>
                OF MULTIDISCIPLINARY RESEARCH AND DEVELOPMENT
              </div>
              <div style={{ marginTop: 6, fontSize: 9, fontWeight: 700, color: '#1e6feb', letterSpacing: 2 }}>
                RESEARCH TODAY | INNOVATION TOMORROW | IMPACT FOREVER
              </div>
            </div>
          </div>

          {/* Congratulations block */}
          <div style={{ padding: '28px 40px 0 40px' }}>
            <div style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 34, color: '#1e6feb' }}>
              Congratulations!
            </div>
            <div
              style={{
                fontSize: 76,
                fontWeight: 900,
                color: '#0b3a8f',
                lineHeight: 1,
                letterSpacing: -2,
              }}
            >
              PUBLISHED
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 }}>
              <div style={{ height: 2, width: 60, background: '#1e6feb' }} />
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1e6feb', letterSpacing: 4 }}>
                IN WWJMRD
              </div>
              <div style={{ height: 2, width: 60, background: '#1e6feb' }} />
            </div>

            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 18,
                background: 'linear-gradient(90deg, #1e6feb, #4a90ff)',
                color: 'white',
                padding: '8px 22px',
                borderRadius: 30,
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: 2,
              }}
            >
              📄 RESEARCH ARTICLE
            </div>

            {/* Title */}
            <div
              style={{
                marginTop: 18,
                fontSize: 26,
                fontWeight: 800,
                color: '#0f172a',
                lineHeight: 1.25,
                maxWidth: 500,
              }}
            >
              {article.title}
            </div>

            {/* Author */}
            <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: '50%',
                  background: '#e6f0ff',
                  color: '#1e6feb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 22,
                  fontWeight: 700,
                }}
              >
                👤
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#1e6feb' }}>
                  {article.author_name || 'Author'}
                </div>
                {article.country && (
                  <div style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>
                    🌍 {article.country}
                  </div>
                )}
              </div>
            </div>

            {/* Meta pills */}
            <div style={{ marginTop: 18, display: 'flex', gap: 10, flexWrap: 'wrap', maxWidth: 500 }}>
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
                    color: 'white',
                    padding: '4px 14px',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: 1.5,
                    marginBottom: 10,
                  }}
                >
                  RESEARCH HIGHLIGHTS
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(article.keywords?.slice(0, 3) || []).map((k, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, fontSize: 13, color: '#334155' }}>
                      <span style={{ color: '#1e6feb', fontWeight: 700 }}>✓</span>
                      <span>{k}</span>
                    </div>
                  ))}
                  {(!article.keywords || article.keywords.length === 0) && article.abstract && (
                    <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.5 }}>
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
              top: 340,
              right: 40,
              width: 300,
              textAlign: 'center',
              color: 'white',
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1 }}>SCAN TO READ</div>
            <div style={{ fontSize: 13, fontWeight: 600, opacity: 0.9, marginBottom: 14 }}>THE FULL ARTICLE</div>
            <div
              style={{
                background: 'white',
                padding: 14,
                borderRadius: 12,
                display: 'inline-block',
              }}
            >
              <QRCodeSVG value={publishedLink} size={220} level="H" includeMargin={false} />
            </div>
            <div
              style={{
                marginTop: 14,
                background: 'linear-gradient(90deg, #4a90ff, #1e6feb)',
                color: 'white',
                padding: '8px 18px',
                borderRadius: 30,
                fontSize: 13,
                fontWeight: 700,
                display: 'inline-block',
              }}
            >
              🌐 www.wwjmrd.online
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
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              padding: '0 40px',
              gap: 30,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <div>
              <div style={{ fontWeight: 800, fontSize: 15 }}>www.wwjmrd.online</div>
              <div style={{ fontSize: 10, opacity: 0.8 }}>Your Research. Our Platform. Global Impact.</div>
            </div>
            <div style={{ marginLeft: 'auto', textAlign: 'right', fontSize: 11 }}>
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
          <Share2 className="w-4 h-4 mr-1" /> Share
        </Button>
        <Button size="sm" variant="outline" onClick={() => openShare(shareUrls.whatsapp)}>
          <MessageCircle className="w-4 h-4 mr-1" /> WhatsApp
        </Button>
        <Button size="sm" variant="outline" onClick={() => openShare(shareUrls.facebook)}>
          <Facebook className="w-4 h-4 mr-1" /> Facebook
        </Button>
        <Button size="sm" variant="outline" onClick={() => openShare(shareUrls.twitter)}>
          <Twitter className="w-4 h-4 mr-1" /> X / Twitter
        </Button>
        <Button size="sm" variant="outline" onClick={() => openShare(shareUrls.linkedin)}>
          <Linkedin className="w-4 h-4 mr-1" /> LinkedIn
        </Button>
        <Button size="sm" variant="outline" onClick={() => openShare(shareUrls.telegram)}>
          <Send className="w-4 h-4 mr-1" /> Telegram
        </Button>
        <Button size="sm" variant="ghost" onClick={copyLink}>
          <QrCode className="w-4 h-4 mr-1" /> Copy Link
        </Button>
      </div>
    </div>
  );
}

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 14px',
        border: '1px solid #dbe6f5',
        borderRadius: 10,
        background: '#f8fbff',
        minWidth: 140,
      }}
    >
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: '50%',
          background: '#e6f0ff',
          color: '#1e6feb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 16,
        }}
      >
        📘
      </div>
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#1e6feb', letterSpacing: 1 }}>{label}</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{value}</div>
      </div>
    </div>
  );
}
