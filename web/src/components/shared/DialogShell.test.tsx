import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DialogShell } from './DialogShell';

type Props = Parameters<typeof DialogShell>[0];

let host: HTMLDivElement;
let launcher: HTMLButtonElement;
let root: Root;

async function render(children: ReactNode, options: Partial<Props> = {}) {
  await act(async () => {
    root.render(
      <DialogShell ariaLabel="Test dialog" onClose={vi.fn()} {...options}>
        {children}
      </DialogShell>
    );
  });
  await act(async () => new Promise((resolve) => window.setTimeout(resolve, 0)));
}

function dialog() {
  return document.querySelector<HTMLElement>('[role="dialog"]')!;
}

function pressTab(shiftKey = false) {
  const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, cancelable: true });
  document.dispatchEvent(event);
  return event;
}

describe('DialogShell keyboard focus', () => {
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    // jsdom 不计算布局，仅补充可见尺寸；禁用与焦点语义仍由 DOM 实现。
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([
      new DOMRect(0, 0, 100, 20),
    ] as unknown as DOMRectList);
    launcher = document.createElement('button');
    launcher.textContent = 'Open dialog';
    host = document.createElement('div');
    document.body.append(launcher, host);
    launcher.focus();
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    launcher.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('skips an initial focus target disabled by its fieldset', async () => {
    const inputRef = { current: null as HTMLInputElement | null };
    await render(
      <>
        <fieldset disabled>
          <input ref={inputRef} aria-label="Unavailable input" />
        </fieldset>
        <button>Continue</button>
      </>,
      { initialFocusRef: inputRef }
    );

    expect(document.activeElement).toBe(dialog().querySelector('button'));
  });

  it('traps Tab in both directions when every control is disabled', async () => {
    await render(
      <fieldset disabled>
        <button>Unavailable action</button>
        <input aria-label="Unavailable input" />
      </fieldset>
    );

    for (const shiftKey of [false, true]) {
      launcher.focus();
      expect(pressTab(shiftKey).defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(dialog());
    }
  });

  it('starts at either end when focus is on the dialog container', async () => {
    await render(
      <>
        <button>First</button>
        <button>Last</button>
      </>
    );
    const [first, last] = dialog().querySelectorAll('button');

    dialog().focus();
    expect(pressTab(true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);

    dialog().focus();
    expect(pressTab().defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
  });

  it('keeps the native first-legend exception focusable in a disabled fieldset', async () => {
    await render(
      <>
        <fieldset disabled>
          <legend>
            <button>Legend action</button>
          </legend>
          <input aria-label="Unavailable input" />
        </fieldset>
        <button>Last</button>
      </>
    );
    const [legend, last] = dialog().querySelectorAll('button');

    expect(document.activeElement).toBe(legend);
    expect(pressTab(true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
    expect(pressTab().defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(legend);
  });

  it('restores focus to the launcher after closing', async () => {
    await render(<button>Dialog action</button>);
    expect(dialog().contains(document.activeElement)).toBe(true);

    await render(<button>Dialog action</button>, { open: false });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(launcher);
  });
});
