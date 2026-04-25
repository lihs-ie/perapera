import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '../atoms/button';
import { Label } from '../atoms/label';
import { Select } from '../atoms/select';
import { TextInput } from '../atoms/text-input';
import { useBackgroundCommand } from '../hooks/use-background-command';
import { useBackgroundQuery } from '../hooks/use-background-query';
import {
  type BackgroundClient,
  type SearchSessionHistoryResult,
  type SessionHistoryDetailResult,
} from '../infrastructure/background-client';
import { ExportControls } from '../molecules/export-controls';
import { TranscriptPairItem } from '../molecules/transcript-pair-item';

const SEARCH_DEBOUNCE_MS = 300 as const;

export type Props = Readonly<{
  client: BackgroundClient;
  onClose: () => void;
}>;

const formatDuration = (ms: number | null): string => {
  if (ms === null) return '—';
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min.toString()}:${sec.toString().padStart(2, '0')}`;
};

const formatStartedAt = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
};

/**
 * IMPL-545 SessionHistoryView organism (Issue #109)。
 *
 * 過去セッション一覧 + 選択 detail。`SettingsView` と同じ「全画面差し替え」
 * パターンで idle 画面から呼び出される。削除 / 自動破棄は次 PR で対応する。
 */
export function SessionHistoryView(props: Props) {
  const listQuery = useBackgroundQuery(() => props.client.getSessionHistory(), {
    input: undefined,
  });
  const detailCommand = useBackgroundCommand(props.client.getSessionHistoryDetail);
  const searchCommand = useBackgroundCommand(props.client.searchSessionHistory);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SessionHistoryDetailResult | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [searchLanguage, setSearchLanguage] = useState<'source' | 'target' | 'both'>('both');
  const [searchResult, setSearchResult] = useState<SearchSessionHistoryResult | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const sessions = useMemo(() => listQuery.state.data?.sessions ?? [], [listQuery.state.data]);

  useEffect(() => {
    if (searchKeyword.trim().length === 0) {
      setSearchResult(null);
      setSearchError(null);
      return;
    }
    const timer = setTimeout(() => {
      void (async () => {
        const response = await searchCommand.execute({
          keyword: searchKeyword,
          language: searchLanguage,
          caseSensitive: false,
        });
        if (response.ok) {
          setSearchResult(response.value);
          setSearchError(null);
        } else {
          setSearchResult(null);
          setSearchError(`検索に失敗しました: ${response.error.message}`);
        }
      })();
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [searchKeyword, searchLanguage, searchCommand]);

  const filteredSessions = useMemo(() => {
    if (searchResult === null) return sessions;
    const matchedIds = new Set(searchResult.sessions.map((s) => s.sessionIdentifier));
    return sessions.filter((s) => matchedIds.has(s.sessionId));
  }, [sessions, searchResult]);

  const handleSelect = useCallback(
    async (sessionId: string): Promise<void> => {
      setSelectedSessionId(sessionId);
      setDetailError(null);
      setDetail(null);
      const response = await detailCommand.execute({ sessionId });
      if (response.ok) {
        setDetail(response.value);
      } else {
        setDetailError(`詳細取得に失敗しました: ${response.error.message}`);
      }
    },
    [detailCommand],
  );

  return (
    <div className="container" role="dialog" aria-label="セッション履歴">
      <header className="header">
        <h2 className="title">セッション履歴</h2>
        <Button variant="secondary" onClick={props.onClose}>
          閉じる
        </Button>
      </header>
      <div className="body" data-variant="history">
        <aside className="list" aria-label="履歴一覧">
          <div className="search" role="search">
            <Label htmlFor="history-search-input">字幕検索</Label>
            <TextInput
              id="history-search-input"
              value={searchKeyword}
              onChange={setSearchKeyword}
              placeholder="原文 / 訳文から検索 (1〜256 文字)"
              ariaLabel="字幕検索キーワード"
              maxLength={256}
            />
            <Select
              value={searchLanguage}
              onChange={(value) => {
                if (value === 'source' || value === 'target' || value === 'both') {
                  setSearchLanguage(value);
                }
              }}
              options={[
                { value: 'both', label: '原文と訳文' },
                { value: 'source', label: '原文のみ' },
                { value: 'target', label: '訳文のみ' },
              ]}
              ariaLabel="検索対象言語"
            />
            {searchCommand.state.status === 'pending' ? <p className="message">検索中…</p> : null}
            {searchError !== null ? (
              <p className="message" role="alert">
                {searchError}
              </p>
            ) : null}
            {searchResult !== null && searchResult.sessions.length === 0 ? (
              <p className="message">該当する字幕はありません。</p>
            ) : null}
          </div>
          {listQuery.state.status === 'pending' || listQuery.state.status === 'idle' ? (
            <p className="message">読み込み中…</p>
          ) : null}
          {listQuery.state.status === 'error' ? (
            <p className="message" role="alert">
              一覧の取得に失敗しました: {listQuery.state.error?.message ?? 'unknown error'}
            </p>
          ) : null}
          {listQuery.state.status === 'success' && filteredSessions.length === 0 ? (
            <p className="message">
              {searchResult === null
                ? '過去のセッションはまだありません。'
                : '検索条件に一致するセッションはありません。'}
            </p>
          ) : null}
          <ul className="items" role="list">
            {filteredSessions.map((summary) => (
              <li
                key={summary.sessionId}
                className="item"
                role="listitem"
                data-selected={selectedSessionId === summary.sessionId ? 'true' : 'false'}
              >
                <button
                  type="button"
                  className="row"
                  aria-label={`セッション ${summary.sessionId} を開く`}
                  onClick={() => {
                    void handleSelect(summary.sessionId);
                  }}
                >
                  <span className="name" title={summary.displayName}>
                    {summary.displayName}
                  </span>
                  <span className="meta">
                    {formatStartedAt(summary.startedAt)} ・ {summary.sourceLanguage} →{' '}
                    {summary.targetLanguage} ・ {summary.state}
                    {summary.durationMs !== null ? ` ・ ${formatDuration(summary.durationMs)}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
        <section className="detail" aria-label="履歴詳細">
          {selectedSessionId === null ? (
            <p className="message">左の一覧からセッションを選択してください。</p>
          ) : null}
          {detailError !== null ? (
            <p className="message" role="alert">
              {detailError}
            </p>
          ) : null}
          {detailCommand.state.status === 'pending' ? <p className="message">読み込み中…</p> : null}
          {detail !== null ? (
            <div className="content" data-testid="history-detail">
              <header className="metaHeader">
                <h3 className="subtitle">{detail.summary.displayName}</h3>
                <p className="meta">
                  {formatStartedAt(detail.summary.startedAt)} ・ {detail.summary.sourceLanguage} →{' '}
                  {detail.summary.targetLanguage} ・ {detail.summary.state}
                </p>
              </header>
              <div className="list" role="list" aria-label="字幕履歴">
                {detail.lines.length === 0 ? (
                  <p className="message">字幕は記録されていません。</p>
                ) : (
                  detail.lines.map((line) => (
                    <TranscriptPairItem
                      key={line.segmentIdentifier}
                      originalText={line.originalText}
                      translatedText={line.translatedText}
                      isFinal={line.isFinal}
                      connectedToPrevious={line.precedingSegmentIdentifier !== null}
                      hasTranslationContext={line.hasTranslationContext}
                    />
                  ))
                )}
              </div>
              <ExportControls client={props.client} sessionId={detail.summary.sessionId} />
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
