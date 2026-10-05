import { useEffect, useId, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AtSign, Loader2, MailPlus, Network, ShieldAlert, X } from 'lucide-react';
import { api, type MailboxStats, type PublicDomainItem } from '../../api';
import { IconButton } from '../../components/shared';
import { DialogShell } from '../../components/shared/DialogShell';
import { useVisibleRefetchInterval } from '../../hooks/useVisibleRefetchInterval';
import { getAvailableDomains } from '../../lib/openapiClient';
import { useText } from '../../locales';
import { useAppStore } from '../../store';
import { useMailboxGeneration, type MailboxAddressType } from './useMailboxGeneration';
import { domainAvailabilityGroups } from './utils';

type InboxComposerProps = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

export function InboxComposer({ open, onClose, onCreated }: InboxComposerProps) {
  const text = useText();
  const apiKey = useAppStore((state) => state.apiKey);
  const id = useId();
  const prefixRef = useRef<HTMLInputElement>(null);
  const statsInterval = useVisibleRefetchInterval(30000);
  const domains = useQuery({
    queryKey: ['domains-available', apiKey],
    queryFn: () => getAvailableDomains({ apiKey }),
    enabled: open,
    staleTime: 10_000,
  });
  const mailboxStats = useQuery({
    queryKey: ['mailbox-stats', apiKey],
    queryFn: () => api<MailboxStats>('/api/mailboxes/stats', { apiKey }),
    enabled: open,
    staleTime: 15_000,
    refetchInterval: statsInterval,
  });
  const {
    prefix,
    domainName,
    addressType,
    subdomain,
    generate,
    generateButtonRef,
    setPrefix,
    setDomainName,
    setAddressType,
    setSubdomain,
  } = useMailboxGeneration({ apiKey, onGenerated: onCreated });
  const isGenerating = generate.isPending;
  const stats = mailboxStats.data;
  const availabilityGroups = useMemo(() => domainAvailabilityGroups(domains.data), [domains.data]);
  const privateDomains = useMemo(
    () =>
      availabilityGroups.privateDomains.filter((domain) =>
        domainSupportsAddressType(domain, addressType)
      ),
    [addressType, availabilityGroups.privateDomains]
  );
  const publicDomains = useMemo(
    () =>
      availabilityGroups.publicDomains.filter((domain) =>
        domainSupportsAddressType(domain, addressType)
      ),
    [addressType, availabilityGroups.publicDomains]
  );

  // 切换邮箱类型后，清除不支持该类型的域名，避免提交隐藏的旧选项。
  useEffect(() => {
    if (
      domains.data &&
      domainName &&
      ![...privateDomains, ...publicDomains].some((domain) => domain.domain === domainName)
    ) {
      setDomainName('');
    }
  }, [domains.data, domainName, setDomainName, privateDomains, publicDomains]);

  const privateSelected = privateDomains.some((domain) => domain.domain === domainName);
  const creationHint = privateSelected
    ? ''
    : stats?.require_public_domain && !stats.has_public_domain
      ? text.inbox.requirePublicDomainHint
      : stats &&
          stats.public_mailbox_daily_limit > 0 &&
          stats.public_mailbox_today >= stats.public_mailbox_daily_limit
        ? text.inbox.noQuotaHint
        : '';

  return (
    <DialogShell
      open={open}
      as="form"
      className="modal-panel inbox-create-dialog"
      titleId={`${id}-title`}
      initialFocusRef={prefixRef}
      onClose={onClose}
      closeOnBackdrop={!isGenerating}
      closeOnEscape={!isGenerating}
      onSubmit={(event) => {
        event.preventDefault();
        if (isGenerating) return;
        // 提交后控件全部禁用，先将焦点交给弹窗，避免落到页面背景。
        event.currentTarget.focus();
        generate.mutate();
      }}
    >
      <div className="modal-header">
        <h2 id={`${id}-title`}>{text.inbox.createMailbox}</h2>
        <IconButton title={text.common.close} onClick={onClose} disabled={isGenerating}>
          <X size={18} aria-hidden="true" />
        </IconButton>
      </div>

      <fieldset className="inbox-composer" disabled={isGenerating}>
        <div className="inbox-address-type" role="group" aria-label={text.inbox.addressType}>
          <button
            type="button"
            className="inbox-address-type-choice"
            aria-pressed={addressType === 'root'}
            onClick={() => setAddressType('root')}
          >
            <AtSign size={16} aria-hidden="true" />
            <span>{text.inbox.rootAddress}</span>
          </button>
          <button
            type="button"
            className="inbox-address-type-choice"
            aria-pressed={addressType === 'subdomain'}
            onClick={() => setAddressType('subdomain')}
          >
            <Network size={16} aria-hidden="true" />
            <span>{text.inbox.subdomainAddress}</span>
          </button>
        </div>

        <label className="inbox-composer-field" htmlFor={`${id}-prefix`}>
          <span>{text.inbox.customPrefix}</span>
          <input
            ref={prefixRef}
            id={`${id}-prefix`}
            className="input"
            placeholder={text.inbox.autoGenerate}
            value={prefix}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            onChange={(event) => setPrefix(event.target.value)}
          />
        </label>

        <label className="inbox-composer-field" htmlFor={`${id}-domain`}>
          <span>{text.domains.domain}</span>
          <select
            id={`${id}-domain`}
            className="input"
            value={domainName}
            onChange={(event) => setDomainName(event.target.value)}
          >
            <option value="">
              {addressType === 'subdomain'
                ? text.inbox.randomWildcardDomain
                : text.inbox.randomDomain}
            </option>
            {privateDomains.length > 0 && (
              <optgroup label={text.domains.modePrivate}>
                {privateDomains.map((domain) => (
                  <option key={domain.domain} value={domain.domain}>
                    {domain.domain}
                  </option>
                ))}
              </optgroup>
            )}
            {publicDomains.length > 0 && (
              <optgroup label={text.domains.modePublic}>
                {publicDomains.map((domain) => (
                  <option key={domain.domain} value={domain.domain}>
                    {domain.domain}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>

        {addressType === 'subdomain' && (
          <label className="inbox-composer-field" htmlFor={`${id}-subdomain`}>
            <span>{text.inbox.customSubdomain}</span>
            <input
              id={`${id}-subdomain`}
              className="input"
              placeholder={text.inbox.autoGenerate}
              value={subdomain}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              onChange={(event) => setSubdomain(event.target.value)}
            />
          </label>
        )}

        {creationHint && (
          <p className="inbox-creation-hint" role="status">
            <ShieldAlert size={16} aria-hidden="true" />
            <span>{creationHint}</span>
          </p>
        )}
      </fieldset>

      <div className="modal-footer">
        <button type="button" className="btn-ghost" onClick={onClose} disabled={isGenerating}>
          {text.common.cancel}
        </button>
        <button
          ref={generateButtonRef}
          type="submit"
          className="btn-primary"
          disabled={isGenerating}
          aria-busy={isGenerating}
        >
          {isGenerating ? (
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          ) : (
            <MailPlus size={16} aria-hidden="true" />
          )}
          {text.inbox.generate}
        </button>
      </div>
    </DialogShell>
  );
}

function domainSupportsAddressType(domain: PublicDomainItem, addressType: MailboxAddressType) {
  if (addressType === 'subdomain')
    return (
      domain.wildcard_ready === true || domain.capabilities?.includes('subdomain_mailbox') === true
    );
  return domain.root_ready !== false && domain.capabilities?.includes('subdomain_mailbox') !== true
    ? true
    : domain.root_ready === true || domain.capabilities?.includes('root_mailbox') === true;
}
