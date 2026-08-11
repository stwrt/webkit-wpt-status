import { useState } from 'react';

import { fetchReport } from '@/lib/api';
import type { Metric } from '@/lib/metric';
import { useAsync } from '@/hooks/useAsync';
import { RepoHeader } from '@/components/RepoHeader';
import { SummaryCards } from '@/components/SummaryCards';
import { DirectoryTable } from '@/components/DirectoryTable';
import { Methodology } from '@/components/Methodology';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

function Loading() {
  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-10 sm:px-6">
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}

function Failed({ error }: { error: Error }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <h1 className="text-lg font-semibold">No data yet</h1>
      <p className="text-muted-foreground mt-2 text-sm">{error.message}</p>
      <p className="text-muted-foreground mt-4 text-sm">
        Run <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">npm run collect</code>{' '}
        to build a snapshot.
      </p>
    </div>
  );
}

export default function App() {
  const { data: report, error, loading } = useAsync(fetchReport, []);
  const [metric, setMetric] = useState<Metric>('tests');

  if (loading) return <Loading />;
  if (error || !report) return <Failed error={error ?? new Error('No report')} />;

  return (
    <div className="min-h-screen">
      <RepoHeader report={report} />

      <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium">Drift from upstream</h2>
          <Tabs value={metric} onValueChange={(value) => setMetric(value as Metric)}>
            <TabsList>
              <TabsTrigger value="tests">Tests</TabsTrigger>
              <TabsTrigger value="files">All files</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <SummaryCards report={report} metric={metric} />
        <DirectoryTable report={report} metric={metric} />
        <Methodology report={report} />
      </main>

      <footer className="text-muted-foreground border-border mx-auto max-w-7xl border-t px-4 py-6 text-xs sm:px-6">
        Not affiliated with Apple or the W3C. Data is derived from the public{' '}
        <a
          className="hover:text-foreground underline underline-offset-4"
          href="https://github.com/WebKit/WebKit"
          target="_blank"
          rel="noreferrer"
        >
          WebKit
        </a>{' '}
        and{' '}
        <a
          className="hover:text-foreground underline underline-offset-4"
          href="https://github.com/web-platform-tests/wpt"
          target="_blank"
          rel="noreferrer"
        >
          wpt
        </a>{' '}
        repositories.
      </footer>
    </div>
  );
}
