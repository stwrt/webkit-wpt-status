import type { Report } from '@/lib/api';
import { formatDate, formatNumber } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function Methodology({ report }: { report: Report }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">How this is measured</CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground space-y-4 text-sm leading-relaxed">
        <p>
          Both repositories are cloned blobless and shallow, and every file is compared by its
          git blob SHA. A blob SHA is a hash of the file's contents, so two files with the same
          SHA are byte-for-byte identical — no file contents are downloaded and no test is run.
        </p>
        <p>
          WebKit picks what to vendor with{' '}
          <a
            className="hover:text-foreground underline underline-offset-4"
            href="https://github.com/WebKit/WebKit/blob/main/LayoutTests/imported/w3c/resources/import-expectations.json"
            target="_blank"
            rel="noreferrer"
          >
            import-expectations.json
          </a>
          , a list of path prefixes marked <code className="font-mono text-xs">import</code> or{' '}
          <code className="font-mono text-xs">skip</code>. The most specific prefix wins, and
          anything unlisted falls back to the root rule (currently{' '}
          <code className="font-mono text-xs">{report.expectations.root}</code>), so upstream
          directories WebKit has never triaged count as <em>not imported</em> rather than as
          missing. Today that file has {formatNumber(report.expectations.rules)} rules.
        </p>
        <p>
          The import process rewrites as it copies: reference files for reftests are renamed
          from <code className="font-mono text-xs">foo-ref.html</code> to{' '}
          <code className="font-mono text-xs">foo-expected.html</code>, the variants wptserve
          generates from a <code className="font-mono text-xs">.any.js</code> source are written
          out as real files, and WebKit adds its own{' '}
          <code className="font-mono text-xs">-expected.txt</code> baselines. Those are matched
          up and excluded, so “WebKit only” means a file that is genuinely absent upstream —
          usually a test upstream has since deleted or moved.
        </p>
        <p className="text-foreground/80">
          <strong className="font-medium">One caveat worth knowing.</strong> WebKit also rewrites
          some test files during import — that's what the{' '}
          <code className="font-mono text-xs">import-no-rewrite</code> opt-out exists for. So{' '}
          <em>modified</em> mixes deliberate local changes with genuinely stale copies, and it
          can't tell you which is which. <em>Missing</em> is the number to trust.
        </p>
        <p className="text-xs">
          Snapshot taken {formatDate(report.generatedAt)} · upstream{' '}
          <code className="font-mono">{report.upstream.sha.slice(0, 9)}</code> · WebKit{' '}
          <code className="font-mono">{report.webkit.sha.slice(0, 9)}</code> ·{' '}
          <a className="hover:text-foreground underline underline-offset-4" href="/api/report">
            raw JSON
          </a>
        </p>
      </CardContent>
    </Card>
  );
}
