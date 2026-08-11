import { ExternalLink } from 'lucide-react';

import { fetchDirectory, upstreamUrl, webkitUrl, type FileList } from '@/lib/api';
import type { Metric } from '@/lib/metric';
import { formatNumber } from '@/lib/format';
import { useAsync } from '@/hooks/useAsync';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const EMPTY_MESSAGES: Record<string, string> = {
  missing: 'Nothing missing — WebKit has every upstream file in this directory.',
  modified: 'No local modifications.',
  webkitExtra: 'No extra files beyond what the import process generates.',
};

function FileTable({ list, kind }: { list: FileList; kind: string }) {
  if (list.total === 0) {
    return <p className="text-muted-foreground px-4 py-6 text-sm">{EMPTY_MESSAGES[kind]}</p>;
  }

  // "WebKit only" files don't exist upstream, so link them to WebKit's tree instead.
  const linkFor = kind === 'webkitExtra' ? webkitUrl : upstreamUrl;

  return (
    <div className="space-y-2">
      <ul className="border-border max-h-96 overflow-y-auto rounded-md border font-mono text-xs">
        {list.items.map((filePath) => (
          <li key={filePath} className="border-border/60 border-b last:border-b-0">
            <a
              href={linkFor(filePath)}
              target="_blank"
              rel="noreferrer"
              className="hover:bg-accent/60 flex items-center justify-between gap-3 px-3 py-1.5"
            >
              <span className="truncate">{filePath}</span>
              <ExternalLink className="text-muted-foreground size-3 shrink-0" aria-hidden />
            </a>
          </li>
        ))}
      </ul>
      {list.truncated && (
        <p className="text-muted-foreground text-xs">
          Showing the first {formatNumber(list.items.length)} of {formatNumber(list.total)}.
        </p>
      )}
    </div>
  );
}

export function DirectoryDetail({
  name,
  webkitTreeUrl,
  metric,
}: {
  name: string;
  webkitTreeUrl: string;
  metric: Metric;
}) {
  const { data, error, loading } = useAsync(() => fetchDirectory(name), [name]);

  if (loading) {
    return (
      <div className="space-y-2 p-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return <p className="text-destructive p-4 text-sm">Couldn’t load {name}: {error?.message}</p>;
  }

  const tabs = [
    { key: 'missing', label: 'Missing', list: data.missing },
    { key: 'modified', label: 'Modified', list: data.modified },
    { key: 'webkitExtra', label: 'WebKit only', list: data.webkitExtra },
  ] as const;

  return (
    <div className="space-y-3 p-4">
      <Tabs defaultValue={tabs.find((tab) => tab.list.total > 0)?.key ?? 'missing'}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            {tabs.map((tab) => (
              <TabsTrigger key={tab.key} value={tab.key} className="gap-1.5">
                {tab.label}
                <span className="text-muted-foreground tabular-nums">
                  {formatNumber(tab.list.total)}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="text-muted-foreground flex items-center gap-4 text-xs">
            {/* The lists are always every file; the row above may be counting tests only. */}
            <span>Every file, including support files{metric === 'tests' && ' — the row counts tests only'}</span>
            <a
              href={webkitTreeUrl}
              target="_blank"
              rel="noreferrer"
              className="hover:text-foreground flex items-center gap-1.5 underline underline-offset-4"
            >
              Open {name}/ in WebKit
              <ExternalLink className="size-3" aria-hidden />
            </a>
          </div>
        </div>

        {tabs.map((tab) => (
          <TabsContent key={tab.key} value={tab.key}>
            <FileTable list={tab.list} kind={tab.key} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
