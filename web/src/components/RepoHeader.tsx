import { GitCommitHorizontal, Moon, Sun } from 'lucide-react';

import type { Report } from '@/lib/api';
import { formatDate, formatRelative } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { MojaveBadge } from '@/components/MojaveBadge';
import { useTheme } from '@/hooks/useTheme';

function RepoRef({ label, name, url, sha, committedAt }: {
  label: string;
  name: string;
  url: string;
  sha: string;
  committedAt: string;
}) {
  const commitUrl = `${url.replace(/\.git$/, '')}/commit/${sha}`;

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <a
        href={commitUrl}
        target="_blank"
        rel="noreferrer"
        className="hover:text-foreground text-foreground/90 flex items-center gap-1.5 font-mono text-sm hover:underline"
        title={`${name} @ ${sha}`}
      >
        <GitCommitHorizontal className="size-3.5 shrink-0" aria-hidden />
        {sha.slice(0, 9)}
      </a>
      <span className="text-muted-foreground text-xs" title={formatDate(committedAt)}>
        {formatRelative(committedAt)}
      </span>
    </div>
  );
}

export function RepoHeader({ report }: { report: Report }) {
  const { theme, toggle } = useTheme();

  return (
    <header className="border-border border-b">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <MojaveBadge />
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">WebKit WPT Status</h1>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
            WebKit vendors a copy of{' '}
            <a
              className="hover:text-foreground underline underline-offset-4"
              href="https://github.com/web-platform-tests/wpt"
              target="_blank"
              rel="noreferrer"
            >
              web-platform-tests
            </a>{' '}
            into{' '}
            <a
              className="hover:text-foreground font-mono text-[0.8em] underline underline-offset-4"
              href="https://github.com/WebKit/WebKit/tree/main/LayoutTests/imported/w3c/web-platform-tests"
              target="_blank"
              rel="noreferrer"
            >
              LayoutTests/imported/w3c/web-platform-tests
            </a>
            , one directory at a time and with no pinned upstream revision. This compares the
            two trees file by file and shows where the copy has drifted.
          </p>
        </div>

        <div className="flex shrink-0 items-start gap-6">
          <RepoRef label="Upstream wpt" {...report.upstream} />
          <RepoRef label="WebKit" {...report.webkit} />
          <Button
            variant="ghost"
            size="icon"
            onClick={toggle}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>
        </div>
      </div>
    </header>
  );
}
