export interface AcceptanceLetterData {
  letterNumber: string;
  acceptanceDate: string;
  authorName: string;
  affiliation: string;
  country: string;
  reference: string;
  title: string;
  authors: string[];
}

/** Vector text, wrapping and page breaks keep long titles and author lists readable. */
export function renderAcceptanceLetter(doc: any, data: AcceptanceLetterData) {
  let y = 22;
  const width = 170;
  const write = (text: string, bold = false, size = 11, gap = 4) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    const lines: string[] = doc.splitTextToSize(text, width);
    for (const line of lines) {
      if (y > 273) { doc.addPage(); y = 22; }
      doc.text(line, 20, y);
      y += size * 0.45;
    }
    y += gap;
  };
  doc.setProperties({ title: `Manuscript Acceptance Letter - ${data.reference}`, author: 'WWJMRD' });
  write('WORLD WIDE JOURNAL OF MULTIDISCIPLINARY\nRESEARCH AND DEVELOPMENT', true, 15, 3);
  write('Online ISSN: 2454-6615', false, 10, 1);
  write('Website: www.wwjmrd.com | Editorial Office: support@wwjmrd.com', false, 9, 7);
  write('MANUSCRIPT ACCEPTANCE LETTER', true, 14, 5);
  write(`Letter No.: ${data.letterNumber}\nAcceptance Date: ${data.acceptanceDate}`, false, 10, 5);
  write(['To,', data.authorName, data.affiliation, data.country].filter(Boolean).join('\n'), false, 11, 5);
  write('Subject: Acceptance of Manuscript for Publication in WWJMRD', true, 11, 5);
  write(`Dear ${data.authorName},`, false, 11, 3);
  write(`We are pleased to inform you that your manuscript entitled "${data.title}", submitted to the World Wide Journal of Multidisciplinary Research and Development (WWJMRD), has been accepted for publication following completion of the journal's peer-review process.`, false, 11, 5);
  write('MANUSCRIPT DETAILS', true, 11, 3);
  write(`Manuscript ID: ${data.reference}\nArticle Title: ${data.title}\nAuthor(s): ${data.authors.join(', ')}\nAcceptance Date: ${data.acceptanceDate}`, false, 10, 5);
  write('The manuscript has been accepted on the basis of the editorial and peer-review assessment. Before publication, the corresponding author should complete any outstanding editorial corrections, proofreading, author declarations, and applicable publication formalities, if requested by the editorial office. The final publication schedule will be communicated separately.', false, 11, 5);
  write('Thank you for considering WWJMRD for the dissemination of your scholarly work. We appreciate your contribution to academic research and knowledge sharing.', false, 11, 5);
  write('Yours sincerely,', false, 11, 3);
  write('Shubham Meena', true, 11, 1);
  write('Managing Editor\nWorld Wide Journal of Multidisciplinary Research and Development\nwww.wwjmrd.com | support@wwjmrd.com', false, 10, 0);
  return doc.output('arraybuffer') as ArrayBuffer;
}