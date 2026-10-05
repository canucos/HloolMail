import { act } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, postJSON, type MailboxStats } from '../../api';
import { getAvailableDomains } from '../../lib/openapiClient';
import zhCN from '../../locales/zh-CN';
import { useAppStore } from '../../store';
import { InboxComposer } from './InboxComposer';

vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api')>()),
  api: vi.fn(),
  postJSON: vi.fn(),
}));
vi.mock('../../lib/openapiClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/openapiClient')>()),
  getAvailableDomains: vi.fn(),
}));
vi.mock('../../lib/feedback', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/feedback')>()),
  notifySuccess: vi.fn(),
}));

type Props = Parameters<typeof InboxComposer>[0];

const apiKey = 'composer-test-key';
const initialStore = useAppStore.getState();
const availableDomains = {
  domains: ['root.example', 'wildcard.example'],
  public_domains: [
    {
      id: 1,
      message_count: 0,
      domain: 'root.example',
      mode: 'public',
      root_ready: true,
      wildcard_ready: false,
    },
    {
      id: 2,
      message_count: 0,
      domain: 'wildcard.example',
      mode: 'public',
      root_ready: false,
      wildcard_ready: true,
    },
  ],
  private_domains: [
    {
      id: 3,
      message_count: 0,
      domain: 'private.example',
      mode: 'private',
      root_ready: true,
      wildcard_ready: true,
    },
  ],
} satisfies Awaited<ReturnType<typeof getAvailableDomains>>;
const stats: MailboxStats = {
  public_mailbox_created: 20,
  public_mailbox_today: 5,
  public_mailbox_daily_limit: 5,
  api_key_public_mailbox_daily_limit: 5,
  private_mailbox_created: 3,
  has_public_domain: false,
  require_public_domain: true,
};

let host: HTMLDivElement;
let root: Root;
let props: Props;
let queryClient: QueryClient;

async function flushUpdates() {
  await act(async () => new Promise((resolve) => window.setTimeout(resolve, 0)));
}

async function render(overrides: Partial<Props> = {}) {
  props = { ...props, ...overrides };
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <InboxComposer {...props} />
      </QueryClientProvider>
    );
  });
  await flushUpdates();
}

function dialog() {
  const form = document.querySelector<HTMLFormElement>('form[role="dialog"]');
  if (!form) throw new Error('Mailbox creation dialog is missing');
  return form;
}

function input(suffix: 'prefix' | 'subdomain') {
  return dialog().querySelector<HTMLInputElement>(`input[id$="-${suffix}"]`)!;
}

function domainSelect() {
  return dialog().querySelector<HTMLSelectElement>('select')!;
}

function submitButton() {
  return dialog().querySelector<HTMLButtonElement>('button[type="submit"]')!;
}

async function changeValue(element: HTMLInputElement | HTMLSelectElement, value: string) {
  await act(async () => {
    const prototype =
      element instanceof HTMLInputElement
        ? HTMLInputElement.prototype
        : HTMLSelectElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(
      new Event(element instanceof HTMLInputElement ? 'input' : 'change', { bubbles: true })
    );
  });
}

async function chooseSubdomain() {
  const button = [...dialog().querySelectorAll('button')].find(
    (candidate) => candidate.textContent === zhCN.inbox.subdomainAddress
  )!;
  await act(async () => button.click());
}

async function submit() {
  await act(async () => {
    dialog().dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await flushUpdates();
}

async function waitForGeneration() {
  await act(async () => {
    await vi.waitFor(() => expect(queryClient.isMutating()).toBe(0));
  });
  await flushUpdates();
}

describe('InboxComposer', () => {
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    useAppStore.setState({ apiKey, email: '', language: 'zh-CN' });
    vi.mocked(api).mockReset().mockResolvedValue(stats);
    vi.mocked(getAvailableDomains).mockReset().mockResolvedValue(availableDomains);
    vi.mocked(postJSON)
      .mockReset()
      .mockImplementation(() => new Promise(() => {}));
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    queryClient.setQueryData(['domains-available', apiKey], availableDomains);
    queryClient.setQueryData(['mailbox-stats', apiKey], stats);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    props = { open: true, onClose: vi.fn(), onCreated: vi.fn() };
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    queryClient.clear();
    useAppStore.setState(initialStore);
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('removes incompatible domains and clears the selection when the mailbox type changes', async () => {
    await render();
    await changeValue(domainSelect(), 'root.example');
    expect(domainSelect().value).toBe('root.example');
    expect(dialog().querySelector('option[value="wildcard.example"]')).toBeNull();

    await chooseSubdomain();
    expect(dialog().querySelector('option[value="root.example"]')).toBeNull();
    expect(dialog().querySelector('option[value="wildcard.example"]')).not.toBeNull();
    expect(dialog().querySelector('option[value="private.example"]')).not.toBeNull();
    expect(domainSelect().value).toBe('');
  });

  it('retains the complete form after closing and reopening', async () => {
    await render();
    await chooseSubdomain();
    await changeValue(input('prefix'), 'saved-prefix');
    await changeValue(input('subdomain'), 'team');
    await changeValue(domainSelect(), 'private.example');

    await render({ open: false });
    expect(document.querySelector('form[role="dialog"]')).toBeNull();

    await render({ open: true });
    expect(input('prefix').value).toBe('saved-prefix');
    expect(input('subdomain').value).toBe('team');
    expect(domainSelect().value).toBe('private.example');
    expect(dialog().querySelector('[aria-pressed="true"]')?.textContent).toBe(
      zhCN.inbox.subdomainAddress
    );
  });

  it('fetches creation data only while open, including after cache invalidation', async () => {
    queryClient.clear();
    await render({ open: false });
    expect(api).not.toHaveBeenCalled();
    expect(getAvailableDomains).not.toHaveBeenCalled();

    await render({ open: true });
    expect(api).toHaveBeenCalledWith('/api/mailboxes/stats', { apiKey });
    expect(getAvailableDomains).toHaveBeenCalledWith({ apiKey });

    await render({ open: false });
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['domains-available'] });
      await queryClient.invalidateQueries({ queryKey: ['mailbox-stats'] });
    });
    expect(api).toHaveBeenCalledTimes(1);
    expect(getAvailableDomains).toHaveBeenCalledTimes(1);

    await render({ open: true });
    expect(api).toHaveBeenCalledTimes(2);
    expect(getAvailableDomains).toHaveBeenCalledTimes(2);
  });

  it('allows random generation, prevents duplicate submissions and retains pending focus', async () => {
    await render();
    await submit();
    expect(postJSON).toHaveBeenCalledWith(
      '/api/generate-email',
      { prefix: '', domain: '', address_type: 'root', subdomain: '' },
      { apiKey }
    );

    await submit();
    expect(postJSON).toHaveBeenCalledTimes(1);
    expect(submitButton().disabled).toBe(true);
    expect(dialog().querySelector('fieldset')?.disabled).toBe(true);
    expect(document.activeElement).toBe(dialog());

    for (const shiftKey of [false, true]) {
      const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, cancelable: true });
      document.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(dialog());
    }
  });

  it('keeps public-domain restrictions contextual to public mailbox creation', async () => {
    await render();
    expect(dialog().textContent).toContain(zhCN.inbox.requirePublicDomainHint);

    await act(async () => {
      queryClient.setQueryData(['mailbox-stats', apiKey], { ...stats, has_public_domain: true });
    });
    await flushUpdates();
    expect(dialog().textContent).toContain(zhCN.inbox.noQuotaHint);

    await changeValue(domainSelect(), 'private.example');
    expect(dialog().textContent).not.toContain(zhCN.inbox.requirePublicDomainHint);
    expect(dialog().textContent).not.toContain(zhCN.inbox.noQuotaHint);
    expect(submitButton().disabled).toBe(false);
  });

  it('supports Escape and backdrop dismissal without interrupting a pending request', async () => {
    await render();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      dialog().parentElement?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(props.onClose).toHaveBeenCalledTimes(2);

    await submit();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      dialog().parentElement?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(props.onClose).toHaveBeenCalledTimes(2);
  });

  it('keeps input after failure and selects the new mailbox after a successful retry', async () => {
    vi.mocked(postJSON)
      .mockRejectedValueOnce(new Error('Temporary failure'))
      .mockResolvedValueOnce({ email: 'saved@team.private.example', domain_id: 1 });
    await render();
    await chooseSubdomain();
    await changeValue(input('prefix'), 'saved');
    await changeValue(input('subdomain'), 'team');
    await changeValue(domainSelect(), 'private.example');

    await submit();
    await waitForGeneration();
    expect(submitButton().disabled).toBe(false);
    expect(input('prefix').value).toBe('saved');
    expect(input('subdomain').value).toBe('team');
    expect(domainSelect().value).toBe('private.example');
    expect(props.onCreated).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();

    await submit();
    await waitForGeneration();
    expect(postJSON).toHaveBeenCalledTimes(2);
    expect(postJSON).toHaveBeenLastCalledWith(
      '/api/generate-email',
      { prefix: 'saved', domain: 'private.example', address_type: 'subdomain', subdomain: 'team' },
      { apiKey }
    );
    expect(useAppStore.getState().email).toBe('saved@team.private.example');
    expect(props.onCreated).toHaveBeenCalledTimes(1);
  });
});
