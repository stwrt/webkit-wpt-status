import { useState } from 'react';
import { ChevronRight, ExternalLink, Folder } from 'lucide-react';

import {
  fetchDirectory,
  upstreamUrl,
  webkitUrl,
  type DirectoryChild,
  type DirectoryDetail as DirectoryDetailData,
  type FileList,
} from '@/lib/api';
import type { Metric } from '@/lib/metric';
import { metricCounts, metricScope, metricSyncPercent } from '@/lib/metric';
import { formatNumber, formatPercent } from '@/lib/format';
import { useAsync } from '@/hooks/useAsync';
import { BucketBar } from '@/components/BucketBar';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

const EMPTY_MESSAGES: Record<string, string> = {
  missing: 'Nothing missing — WebKit has every upstream file here.',
  modified: 'No local modifications.',
  webkitExtra: 'No extra files beyond what the import process generates.',
};

function FileTable({ list, kind }: { list: FileList; kind: string }) {
  if (list.total === 0) {
    return <p className="text-muted-foreground px-1 py-6 text-sm">{EMPTY_MESSAGES[kind]}</p>;
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

function Breadcrumbs({ path, onNavigate }: { path: string; onNavigate: (path: string) => void }) {
  const segments = path.split('/');

  return (
    <nav aria-label="Directory path" className="flex flex-wrap items-center gap-1 text-sm">
      {segments.map((segment, index) => {
        const target = segments.slice(0, index + 1).join('/');
        const isLast = index === segments.length - 1;
        return (
          <span key={target} className="flex items-center gap-1">
            {index > 0 && <span className="text-muted-foreground/50">/</span>}
            {isLast ? (
              <span className="font-mono font-medium">{segment}</span>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate(target)}
                className="text-muted-foreground hover:text-foreground font-mono underline-offset-4 hover:underline"
              >
                {segment}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}

function ChildRow({
  child,
  metric,
  onOpen,
}: {
  child: DirectoryChild;
  metric: Metric;
  onOpen: (path: string) => void;
}) {
  const counts = metricCounts(child, metric);
  const scope = metricScope(child, metric);

  return (
    <button
      type="button"
      onClick={() => onOpen(child.path)}
      className="hover:bg-accent/50 focus-visible:ring-ring grid w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-3 py-2 text-left focus-visible:ring-2 focus-visible:outline-none sm:grid-cols-[minmax(9rem,1fr)_minmax(8rem,14rem)_auto]"
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <Folder className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
        <span className="truncate font-mono text-xs">{child.name}</span>
        {child.hasChildren && (
          <ChevronRight className="text-muted-foreground/60 size-3 shrink-0" aria-hidden />
        )}
      </span>

      {scope === 0 ? (
        <span className="text-muted-foreground/60 hidden text-xs sm:block">not imported</span>
      ) : (
        <span className="hidden items-center gap-2 sm:flex">
          <BucketBar counts={counts} className="h-1.5 flex-1" />
          <span className="w-11 shrink-0 text-right text-xs tabular-nums">
            {formatPercent(metricSyncPercent(child, metric))}
          </span>
        </span>
      )}

      <span className="text-xs tabular-nums">
        <span className={cn(counts.missing === 0 && 'text-muted-foreground/50')}>
          {formatNumber(counts.missing)} missing
        </span>
        <span className="text-muted-foreground/40 mx-2">·</span>
        <span className={cn(counts.modified === 0 && 'text-muted-foreground/50')}>
          {formatNumber(counts.modified)} modified
        </span>
      </span>
    </button>
  );
}

const EMPTY_LIST: FileList = { total: 0, truncated: false, items: [] };

export function DirectoryDetail({
  root,
  metric,
  version,
}: {
  root: string;
  metric: Metric;
  version: string;
}) {
  const [path, setPath] = useState(root);
  const { data, error, loading } = useAsync(() => fetchDirectory(path, version), [path, version]);

  if (loading) {
    return (
      <div className="space-y-2 p-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <p className="text-destructive p-4 text-sm">
        Couldn’t load {path}: {error?.message}
      </p>
    );
  }

  // Defensive: a response cached from an older deployment can be missing `lists`.
  // Degrade to empty rather than taking the whole page down.
  const lists: Partial<DirectoryDetailData['lists']> = data.lists ?? {};
  const children = data.children ?? [];
  const tabs = [
    { key: 'missing', label: 'Missing', list: lists.missing ?? EMPTY_LIST },
    { key: 'modified', label: 'Modified', list: lists.modified ?? EMPTY_LIST },
    { key: 'webkitExtra', label: 'WebKit only', list: lists.webkitExtra ?? EMPTY_LIST },
  ] as const;

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Breadcrumbs path={path} onNavigate={setPath} />
        <a
          href={webkitUrl(path)}
          target="_blank"
          rel="noreferrer"
          className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs underline underline-offset-4"
        >
          Open in WebKit
          <ExternalLink className="size-3" aria-hidden />
        </a>
      </div>

      {children.length > 0 && (
        <div>
          <p className="text-muted-foreground mb-2 text-xs">
            {formatNumber(children.length)} subdirector
            {children.length === 1 ? 'y' : 'ies'} — counts include everything beneath each one
          </p>
          <div className="border-border max-h-80 divide-y divide-(--border) overflow-y-auto rounded-md border">
            {children.map((child) => (
              <ChildRow key={child.path} child={child} metric={metric} onOpen={setPath} />
            ))}
          </div>
        </div>
      )}

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
          {/* The lists are always every file; the row above may be counting tests only. */}
          <span className="text-muted-foreground text-xs">
            Every file under {path}/, including support files
            {metric === 'tests' && ' — the row counts tests only'}
          </span>
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
