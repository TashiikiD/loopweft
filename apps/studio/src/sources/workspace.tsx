// The Sources workspace: the references library (every source, and the chosen one to read and change), the
// coverage of the map by its evidence (what cites nothing, to cite in one go), and the APA reference list.
import { plural } from '@loopweft/model';
import { Button, SegmentedControl, Text } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { useStudio } from '../context.tsx';
import { AddSourceDialog } from './add-source.tsx';
import { Coverage } from './coverage.tsx';
import { SourceEditor, SourceList } from './library.tsx';
import { ReferenceList } from './reference-list.tsx';

type View = 'library' | 'coverage' | 'references';

export function SourcesWorkspace() {
  const [view, setView] = useState<View>('library');
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const sources = useStudio((s) => s.project.sources);
  const chosen = useStudio((s) => s.source);
  const source = sources.find((s) => s.id === chosen);
  return (
    <div className="lw-workspace">
      <div className="lw-view">
        <div className="lw-viewbar">
          <SegmentedControl
            size="xs"
            value={view}
            onChange={(next) => setView(next as View)}
            data={[
              { value: 'library', label: 'Library' },
              { value: 'coverage', label: 'Coverage' },
              { value: 'references', label: 'Reference list' },
            ]}
            aria-label="Show the sources as"
          />
          <Text size="sm" c="dimmed" style={{ flex: 1 }}>
            {plural(sources.length, 'source')}
          </Text>
          <Button
            size="compact-sm"
            leftSection={<IconPlus size={14} aria-hidden />}
            onClick={() => setAdding(true)}
          >
            Add a source
          </Button>
        </div>
        {view === 'library' ? (
          <div className="lw-library">
            <SourceList query={query} onQuery={setQuery} />
            <div className="lw-library-detail">
              {source ? (
                <SourceEditor key={source.id} source={source} />
              ) : (
                <Text size="sm" c="dimmed">
                  {sources.length
                    ? 'Choose a source to read and change it, and to see what cites it.'
                    : 'A source is a work the map draws on. Add one by its DOI (Loopweft looks it up at Crossref or DataCite) or by hand; then cite it on variables and links in the Map workspace’s inspector.'}
                </Text>
              )}
            </div>
          </div>
        ) : view === 'coverage' ? (
          <Coverage />
        ) : (
          <div className="lw-library-detail">
            <ReferenceList />
          </div>
        )}
      </div>
      <AddSourceDialog opened={adding} onClose={() => setAdding(false)} />
    </div>
  );
}
