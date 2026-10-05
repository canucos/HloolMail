import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useReducedMotion } from 'framer-motion';
import { ArrowLeft, Check, Copy, Inbox, MailPlus, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import type { MailboxInfo, ShareLinkDTO } from '../api';
import { api, postJSON } from '../api';
import { useText } from '../locales';
import { useAppStore } from '../store';
import { useCopyState } from '../hooks/useCopyState';
import { copy } from '../lib/clipboard';
import { notifySuccess, runDeleteEffect } from '../lib/feedback';
import { IconButton } from '../components/shared';
import { InboxActions } from './inbox/InboxActions';
import { InboxComposer } from './inbox/InboxComposer';
import { MailboxList } from './inbox/MailboxList';
import { MessageList } from './inbox/MessageList';
import { MessagePreviewPane } from './inbox/MessagePreviewPane';
import { useActiveMailboxStream } from './inbox/useActiveMailboxStream';
import { useInboxQueries } from './inbox/useInboxQueries';
import { useMailboxSelection } from './inbox/useMailboxSelection';
import { OneTimeLinkCard } from './ShareLinksPage';
import '../styles/inbox.css';

export function InboxPage() {
  const queryClient = useQueryClient();
  const email = useAppStore((s) => s.email);
  const setEmail = useAppStore((s) => s.setEmail);
  const apiKey = useAppStore((s) => s.apiKey);
  const shouldReduceMotion = useReducedMotion();
  const text = useText();
  const [confirmClear, setConfirmClear] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [emailCopied, markEmailCopied] = useCopyState();
  const [mailboxShareLink, setMailboxShareLink] = useState<ShareLinkDTO | null>(null);
  const [mobileStep, setMobileStep] = useState<'mailboxes' | 'messages' | 'detail'>('mailboxes');
  const messagesTitleRef = useRef<HTMLHeadingElement>(null);
  const focusMessagesAfterCreate = useRef(false);

  const selection = useMailboxSelection({ email });
  const {
    mailboxSearch,
    mailboxQuery,
    mailboxPage,
    emailPage,
    selectedID,
    pulseIds,
    confirmingId,
    setMailboxSearch,
    setMailboxPage,
    setEmailPage,
    setSelectedID,
    setConfirmingId,
    resetAfterGenerate,
    trackMessageItems,
  } = selection;
  const inbox = useInboxQueries({
    apiKey,
    email,
    mailboxQuery,
    mailboxPage,
    emailPage,
    selectedID,
  });
  const activeMailbox = useMemo(
    () => inbox.mailboxItems.find((mailbox) => mailbox.email === email),
    [email, inbox.mailboxItems]
  );

  const clear = useMutation({
    mutationFn: () =>
      api(`/api/emails/clear?email=${encodeURIComponent(email)}`, { method: 'DELETE', apiKey }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emails'] });
      queryClient.invalidateQueries({ queryKey: ['mailboxes'] });
      queryClient.invalidateQueries({ queryKey: ['mailbox-stats'] });
      setSelectedID('');
      setEmailPage(1);
      notifySuccess(text.toast.inboxCleared, { burst: false });
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteMailbox = useMutation({
    mutationFn: (mailbox: MailboxInfo) =>
      api(`/api/mailboxes/${mailbox.id}`, { method: 'DELETE', apiKey }),
    onSuccess: (_data, mailbox) => {
      queryClient.invalidateQueries({ queryKey: ['mailboxes'] });
      queryClient.invalidateQueries({ queryKey: ['mailbox-stats'] });
      if (mailbox.email === email) {
        setEmail('');
        setSelectedID('');
      }
      if (inbox.mailboxItems.length <= 1 && mailboxPage > 1) {
        setMailboxPage((page) => Math.max(1, page - 1));
      }
      notifySuccess(text.inbox.mailboxDeleted, { burst: false });
    },
    onError: (error) => toast.error(error.message),
  });
  const shareMailbox = useMutation({
    mutationFn: (mailbox: MailboxInfo) =>
      postJSON<ShareLinkDTO>('/api/share-links', {
        resource_type: 'mailbox',
        mailbox_id: mailbox.id,
      }),
    onSuccess: (link) => {
      setMailboxShareLink(link);
      queryClient.invalidateQueries({ queryKey: ['share-links'] });
      toast.success(text.shareLinks.mailboxCreatedFromInbox);
    },
    onError: (error) => toast.error(error.message),
  });

  useActiveMailboxStream({
    email,
    onMessage: () => setEmailPage(1),
  });

  useEffect(() => {
    if (composerOpen || !focusMessagesAfterCreate.current) return;
    focusMessagesAfterCreate.current = false;
    // 移动端成功后创建按钮会隐藏，等待视图切换完成再聚焦新邮箱标题。
    messagesTitleRef.current?.focus();
  }, [composerOpen]);

  useEffect(() => {
    if (inbox.mailboxes.data && inbox.mailboxes.data.page !== mailboxPage) {
      setMailboxPage(inbox.mailboxes.data.page);
    }
  }, [inbox.mailboxes.data, mailboxPage, setMailboxPage]);

  useEffect(() => {
    if (inbox.emails.data && inbox.emails.data.page !== emailPage) {
      setEmailPage(inbox.emails.data.page);
    }
  }, [inbox.emails.data, emailPage, setEmailPage]);

  useEffect(() => {
    return trackMessageItems(inbox.emails.data?.items);
  }, [inbox.emails.data, trackMessageItems]);

  useEffect(() => {
    setMailboxShareLink(null);
  }, [email]);

  const handleClear = () => {
    if (confirmClear) {
      // 列表容器会继续承载空状态，不对它施加删除动画的隐藏样式。
      setConfirmClear(false);
      clear.mutate();
    } else {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
    }
  };

  const handleDeleteMailbox = (mailbox: MailboxInfo, row: HTMLElement | null) => {
    deleteMailbox.mutate(mailbox, {
      onSuccess: async () => {
        await runDeleteEffect(row);
      },
    });
  };

  const selectMailbox = (mailbox: MailboxInfo) => {
    setEmail(mailbox.email);
    setSelectedID('');
    setMobileStep('messages');
  };

  const selectMessage = (id: string) => {
    setSelectedID(id);
    setMobileStep(id ? 'detail' : 'messages');
  };

  const handleCreated = () => {
    resetAfterGenerate();
    focusMessagesAfterCreate.current = true;
    setComposerOpen(false);
    setMobileStep('messages');
  };

  // 清空或删除当前邮箱后，窄屏也能回到仍有内容的列表。
  const visibleStep = !email
    ? 'mailboxes'
    : mobileStep === 'detail' && !selectedID
      ? 'messages'
      : mobileStep;

  return (
    <div className={`inbox-layout ${selectedID ? 'inbox-layout-has-detail' : ''}`}>
      <section
        className={`inbox-column inbox-mailbox-column ${visibleStep !== 'mailboxes' ? 'inbox-drilldown-hidden' : ''}`}
        aria-labelledby="inbox-title"
      >
        <div className="inbox-column-header inbox-mailbox-header">
          <h2 id="inbox-title">{text.page.inbox}</h2>
          <button
            type="button"
            className="btn-primary inbox-create-button"
            data-onboarding-target="create-mailbox"
            onClick={() => setComposerOpen(true)}
          >
            <MailPlus size={16} aria-hidden="true" />
            {text.inbox.createMailbox}
          </button>
        </div>

        <MailboxList
          text={text}
          items={inbox.mailboxItems}
          selectedEmail={email}
          search={mailboxSearch}
          total={inbox.mailboxTotal}
          page={inbox.mailboxes.data?.page || 1}
          totalPages={inbox.mailboxes.data?.total_pages || 1}
          isLoading={inbox.mailboxes.isLoading}
          error={inbox.mailboxes.error}
          showWhenEmpty
          onRetry={() => inbox.mailboxes.refetch()}
          confirmingId={confirmingId}
          onSearchChange={setMailboxSearch}
          onPageChange={setMailboxPage}
          onSelectMailbox={selectMailbox}
          onDeleteMailbox={handleDeleteMailbox}
          setConfirmingId={setConfirmingId}
        />
      </section>

      <section
        className={`inbox-column inbox-message-column ${visibleStep !== 'messages' ? 'inbox-drilldown-hidden' : ''}`}
        aria-labelledby="inbox-messages-title"
      >
        <div className="inbox-mobile-stepbar">
          <button className="btn-ghost" type="button" onClick={() => setMobileStep('mailboxes')}>
            <ArrowLeft size={16} aria-hidden="true" />
            {text.inbox.backToMailboxes}
          </button>
        </div>

        <div className="inbox-column-header inbox-message-header">
          <h2
            id="inbox-messages-title"
            ref={messagesTitleRef}
            tabIndex={-1}
            title={email || undefined}
          >
            {email || text.inbox.messages}
          </h2>
          {email && (
            <div className="inbox-message-actions">
              <IconButton
                title={emailCopied ? text.common.copied : text.inbox.copyEmail}
                onClick={() => {
                  copy(email);
                  markEmailCopied();
                }}
              >
                {emailCopied ? <Check size={16} /> : <Copy size={16} />}
              </IconButton>
              {activeMailbox && (
                <IconButton
                  title={text.shareLinks.shareMailbox}
                  onClick={() => shareMailbox.mutate(activeMailbox)}
                  disabled={shareMailbox.isPending}
                >
                  <Share2 size={16} />
                </IconButton>
              )}
              <InboxActions
                text={text}
                confirmClear={confirmClear}
                clearDisabled={inbox.emailTotal === 0 || clear.isPending}
                isRefetching={inbox.emails.isRefetching}
                onRefresh={() => inbox.emails.refetch()}
                onClear={handleClear}
              />
            </div>
          )}
        </div>

        {mailboxShareLink && (
          <OneTimeLinkCard link={mailboxShareLink} onClose={() => setMailboxShareLink(null)} />
        )}

        {email ? (
          <MessageList
            text={text}
            email={email}
            items={inbox.emailItems}
            total={inbox.emailTotal}
            page={inbox.emails.data?.page || 1}
            totalPages={inbox.emails.data?.total_pages || 1}
            selectedID={selectedID}
            pulseIds={pulseIds}
            isLoading={inbox.emails.isLoading}
            isFetching={inbox.emails.isFetching}
            error={inbox.emails.error}
            onRetry={() => inbox.emails.refetch()}
            shouldReduceMotion={Boolean(shouldReduceMotion)}
            onSelectMessage={selectMessage}
            onPageChange={(page) => {
              setSelectedID('');
              setEmailPage(page);
              setMobileStep('messages');
            }}
          />
        ) : (
          <div className="inbox-welcome" role="status">
            <Inbox size={36} strokeWidth={1.4} aria-hidden="true" />
            <p>{text.inbox.selectMailbox}</p>
          </div>
        )}
      </section>

      {selectedID && (
        <div
          className={`inbox-detail-pane ${visibleStep !== 'detail' ? 'inbox-drilldown-hidden' : ''}`}
        >
          <MessagePreviewPane
            message={inbox.detail.data}
            loading={inbox.detail.isLoading}
            error={inbox.detail.error}
            onBack={() => selectMessage('')}
            onRetry={() => inbox.detail.refetch()}
          />
        </div>
      )}

      {/* 受控显示保留创建组件的表单状态，取消关闭后可继续填写。 */}
      <InboxComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}
