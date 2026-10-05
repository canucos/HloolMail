import { ArrowLeft } from 'lucide-react';
import { useText } from '../../locales';
import type { MessageDetail } from '../../api';
import { MessageDrawer } from '../MessageDrawer';

type MessagePreviewPaneProps = {
  message?: MessageDetail;
  loading: boolean;
  error?: unknown;
  onBack?: () => void;
  onRetry?: () => void;
};

export function MessagePreviewPane({
  message,
  loading,
  error,
  onBack,
  onRetry,
}: MessagePreviewPaneProps) {
  const text = useText();

  return (
    <div className="inbox-preview">
      <div className="inbox-preview-toolbar">
        <button className="btn-ghost" type="button" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden="true" />
          {text.inbox.backToMessages}
        </button>
      </div>
      <MessageDrawer message={message} loading={loading} error={error} onRetry={onRetry} />
    </div>
  );
}
