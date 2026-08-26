import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { FlipReorder } from './flip-reorder.directive';

/**
 * Toạ độ giả cho từng id. jsdom trả `getBoundingClientRect()` toàn số 0 cho mọi
 * phần tử, nên nếu không giả lập thì mọi độ dời đều bằng 0 và directive đúng ra
 * phải bỏ qua — bài test sẽ xanh mà chẳng chứng minh được gì.
 */
let toaDo: Record<string, { top: number; left: number }> = {};

function gaLapViTri(host: HTMLElement): void {
  for (const el of host.querySelectorAll<HTMLElement>('[data-flip-id]')) {
    const id = el.getAttribute('data-flip-id')!;
    el.getBoundingClientRect = () => {
      const p = toaDo[id] ?? { top: 0, left: 0 };
      return { top: p.top, left: p.left, right: 0, bottom: 0, width: 0, height: 0, x: p.left, y: p.top, toJSON: () => ({}) } as DOMRect;
    };
  }
}

/** Bắt mọi lệnh animate: [id, keyframes] */
const daGoi: { id: string; keyframes: Keyframe[] }[] = [];

function gaLapAnimate(host: HTMLElement): void {
  // Directive kiểm tra `animate` trên chính phần tử gốc trước khi chạy.
  (host as unknown as { animate: unknown }).animate = () => ({}) as Animation;
  for (const el of host.querySelectorAll<HTMLElement>('[data-flip-id]')) {
    const id = el.getAttribute('data-flip-id')!;
    (el as unknown as { animate: unknown }).animate = (kf: Keyframe[]) => {
      daGoi.push({ id, keyframes: kf });
      return {} as Animation;
    };
  }
}

@Component({
  imports: [FlipReorder],
  template: `<div appFlipReorder #box>
    @for (id of ids(); track id) {
      <div [attr.data-flip-id]="id">{{ id }}</div>
    }
  </div>`,
})
class Host {
  readonly ids = signal(['a', 'b', 'c']);
}

/** Chờ MutationObserver (microtask) rồi tới requestAnimationFrame của directive. */
function choFlip(): Promise<void> {
  return new Promise((resolve) => setTimeout(() => requestAnimationFrame(() => setTimeout(resolve))));
}

describe('FlipReorder', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<Host>>;
  let host: HTMLElement;

  beforeEach(async () => {
    daGoi.length = 0;
    // Vị trí ban đầu: xếp dọc a(0) → b(100) → c(200)
    toaDo = { a: { top: 0, left: 0 }, b: { top: 100, left: 0 }, c: { top: 200, left: 0 } };

    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await fixture.whenStable();

    host = fixture.nativeElement.querySelector('div')!;
    gaLapViTri(host);
    gaLapAnimate(host);

    // Directive chụp mốc đầu tiên trong `afterNextRender`, tức TRƯỚC khi các
    // stub trên được gắn — lúc đó jsdom trả toạ độ toàn số 0. Kích một thay đổi
    // childList vô hại để nó đo lại một lần nữa, lần này bằng toạ độ giả.
    const moi = document.createElement('span');
    host.appendChild(moi);
    await choFlip();
    moi.remove();
    await choFlip();
    daGoi.length = 0;
  });

  it('đảo thứ tự thì animate đúng những thẻ đã đổi chỗ', async () => {
    // c nhảy lên đầu: c 200→0, a 0→100, b 100→200
    fixture.componentInstance.ids.set(['c', 'a', 'b']);
    fixture.detectChanges();
    toaDo = { c: { top: 0, left: 0 }, a: { top: 100, left: 0 }, b: { top: 200, left: 0 } };
    gaLapViTri(host);
    gaLapAnimate(host);
    await choFlip();

    expect(daGoi.map((x) => x.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('dịch NGƯỢC về chỗ cũ rồi mới về 0 — đúng bản chất FLIP', async () => {
    fixture.componentInstance.ids.set(['c', 'a', 'b']);
    fixture.detectChanges();
    toaDo = { c: { top: 0, left: 0 }, a: { top: 100, left: 0 }, b: { top: 200, left: 0 } };
    gaLapViTri(host);
    gaLapAnimate(host);
    await choFlip();

    // c đi từ 200 xuống 0 → phải bị đẩy ngược +200px rồi mới trượt về 0,
    // nếu không mắt sẽ thấy nó đã nằm sẵn ở chỗ mới (tức là không có animation).
    const c = daGoi.find((x) => x.id === 'c')!;
    expect(c.keyframes[0]['transform']).toBe('translate(0px, 200px)');
    expect(c.keyframes[1]['transform']).toBe('translate(0, 0)');

    // a đi xuống 0 → 100 nên phải bị kéo ngược LÊN -100px.
    const a = daGoi.find((x) => x.id === 'a')!;
    expect(a.keyframes[0]['transform']).toBe('translate(0px, -100px)');
  });

  it('không đổi chỗ thì KHÔNG animate — tránh giật vô cớ mỗi lần render', async () => {
    // Đổi nội dung nhưng giữ nguyên thứ tự và vị trí.
    fixture.componentInstance.ids.set(['a', 'b', 'c']);
    fixture.detectChanges();
    gaLapViTri(host);
    gaLapAnimate(host);
    await choFlip();

    expect(daGoi).toHaveLength(0);
  });

  it('thẻ mới thêm thì không animate — nó không "đổi chỗ" từ đâu cả', async () => {
    fixture.componentInstance.ids.set(['a', 'b', 'c', 'd']);
    fixture.detectChanges();
    toaDo = { a: { top: 0, left: 0 }, b: { top: 100, left: 0 }, c: { top: 200, left: 0 }, d: { top: 300, left: 0 } };
    gaLapViTri(host);
    gaLapAnimate(host);
    await choFlip();

    expect(daGoi.find((x) => x.id === 'd')).toBeUndefined();
  });

  it('môi trường không có Web Animations API thì im lặng bỏ qua, không ném lỗi', async () => {
    delete (host as unknown as { animate?: unknown }).animate;
    fixture.componentInstance.ids.set(['c', 'b', 'a']);
    fixture.detectChanges();
    toaDo = { c: { top: 0, left: 0 }, b: { top: 100, left: 0 }, a: { top: 200, left: 0 } };
    gaLapViTri(host);

    await expect(choFlip()).resolves.toBeUndefined();
    expect(daGoi).toHaveLength(0);
  });
});
