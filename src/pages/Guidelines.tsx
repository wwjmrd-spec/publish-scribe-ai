import React from 'react';
import { Link } from 'react-router-dom';
import { PageLayout } from '@/components/layout/PageLayout';
import { GlassCard } from '@/components/layout/GlassCard';
import { Button } from '@/components/ui/button';
import { ArrowLeft, FileText } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';

function GuidelinesBody() {
  return (
    <div className="prose prose-invert max-w-none space-y-6">
      <section>
        <h2 className="font-display text-2xl font-semibold mb-3">Article Structure</h2>
        <p className="text-muted-foreground mb-3">
          You can use this list to carry out a final check of your submission before you
          send it to the journal for review.
        </p>
        <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
          <li>Title</li>
          <li>
            Author's affiliation (Author Name, Department, College, State, Country, Mobile
            Number and E-Mail should be provided)
          </li>
          <li>The Abstract should not be more than 400 words</li>
          <li>About 3 to 6 keywords should be provided.</li>
          <li>
            Heading and subheading should be numbered. e.g. 1. Introduction, 2. Material
            and Methods, 3. Results, 4. Discussion, 5. Conclusion, 6. Acknowledgement,
            7. References
          </li>
        </ul>
        <p className="text-muted-foreground mt-3">
          <strong>Language:</strong> For papers in Hindi, Gujarati, Marathi and Sanskrit
          please attach the font file and PDF file of the manuscript in your submission.
        </p>
        <p className="text-muted-foreground">
          <strong>Length of the Papers:</strong> The total length of the paper should not
          exceed 2000 words (includes abstract, table, chart, reference etc).
        </p>
        <p className="text-muted-foreground">
          <strong>Figures &amp; Tables:</strong> Each figure/table should be numbered and
          titled. The position of figure or table should be indicated in the text on a
          separate line with the words "Table 1 about here".
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold mb-3">Plagiarism</h2>
        <p className="text-muted-foreground">
          There is a zero-tolerance policy towards plagiarism in our journal. Manuscripts
          are screened for plagiarism before, during and after publication, and if found
          they will be rejected at any stage of processing.
        </p>
        <p className="text-muted-foreground mt-2">
          <strong>Plagiarism Checker:</strong> Plagiarism X and Turnitin
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold mb-3">Publication Fee</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-[hsl(var(--glass-border))] rounded-lg overflow-hidden">
            <thead className="bg-[hsl(var(--glass-bg-strong))]">
              <tr>
                <th className="px-4 py-2 text-left"></th>
                <th className="px-4 py-2 text-left">For India</th>
                <th className="px-4 py-2 text-left">For Rest of World</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-[hsl(var(--glass-border))]">
                <td className="px-4 py-2">Publication Fee for 1 Article</td>
                <td className="px-4 py-2">Rs. 2500</td>
                <td className="px-4 py-2">$79</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold mb-3">Layout Template</h2>
        <p className="text-muted-foreground">
          Authors should use the journal's standard layout template when preparing
          manuscripts. A sample paper / template can be downloaded from the official
          journal website. Ensure your file is a <code>.docx</code> document, single
          column, with section headings numbered as above.
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold mb-3">Manuscript Submission</h2>
        <p className="text-muted-foreground">
          Submit your manuscript through the author portal. The system will run an
          automated AI review and notify the editorial team. After acceptance, the
          publication fee (where applicable) becomes payable and your article enters the
          publishing queue.
        </p>
      </section>
    </div>
  );
}

export default function Guidelines() {
  const { user } = useAuth();

  if (user) {
    return (
      <DashboardLayout type="author">
        <div className="max-w-4xl mx-auto">
          <h1 className="font-display text-3xl font-bold mb-6 gradient-text flex items-center gap-2">
            <FileText className="w-7 h-7" /> Layout Template &amp; Guidelines
          </h1>
          <GlassCard><GuidelinesBody /></GlassCard>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <PageLayout>
      <div className="container mx-auto px-4 py-16 pt-28 max-w-4xl">
        <Link to="/">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" /> Home
          </Button>
        </Link>
        <h1 className="font-display text-3xl md:text-4xl font-bold mb-6 gradient-text">
          Layout Template &amp; Guidelines
        </h1>
        <GlassCard><GuidelinesBody /></GlassCard>
      </div>
    </PageLayout>
  );
}
