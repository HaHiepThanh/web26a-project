import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { vi } from 'vitest';

import { CardDetailModal } from './card-detail-modal';
import { Card } from '../../../models';
import { AttachmentStore } from '../../../ngrx/attachment/attachment.store';

const CARD: Card = {
  id: 'c1',
  orgId: 'o1',
  listId: 'l1',
  title: 'Thẻ thử',
  priority: 'medium',
  position: 1,
  createdBy: 'u1',
  createdAt: '2026-08-26T00:00:00Z',
  updatedAt: '2026-08-26T00:00:00Z',
};

function pngFile(name = 'a.png', size = 10): File {
  return new File([new Uint8Array(size)], name, { type: 'image/png' });
}

function chonTep(component: CardDetailModal, ...files: File[]): void {
  component.onFilesSelected({ target: { files, value: '' } } as unknown as Event);
}

describe('CardDetailModal — đính kèm và lưu thẻ', () => {
  let fixture: ComponentFixture<CardDetailModal>;
  let component: CardDetailModal;
  let attachmentStore: InstanceType<typeof AttachmentStore>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CardDetailModal],
      providers: [provideHttpClient()],
    }).compileComponents();

    attachmentStore = TestBed.inject(AttachmentStore);
    vi.spyOn(attachmentStore, 'addFiles').mockResolvedValue([]);
    vi.spyOn(attachmentStore, 'remove').mockResolvedValue();
    vi.spyOn(attachmentStore, 'toggleCover').mockResolvedValue();

    fixture = TestBed.createComponent(CardDetailModal);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('card', CARD);
    fixture.componentRef.setInput('boardId', 'b1');
    fixture.detectChanges();
  });

  it('mở thẻ chưa sửa gì thì chưa có gì để lưu', () => {
    expect(component.dirty()).toBe(false);
    expect(component.canSave()).toBe(false);
    expect(component.attachmentRows().length).toBe(0);
  });

  it('tệp quá 10MB bị bỏ qua và báo lý do', () => {
    chonTep(component, pngFile('to-qua.png', 11 * 1024 * 1024));

    expect(component.attachmentError()).toContain('to-qua.png');
    expect(attachmentStore.addFiles).not.toHaveBeenCalled();
  });

  it('chọn tệp hợp lệ thì gửi upload ngay lập tức lên server', () => {
    const file = pngFile('anh.png');
    chonTep(component, file);

    expect(attachmentStore.addFiles).toHaveBeenCalledWith('c1', [file]);
  });

  it('dán ảnh từ clipboard (Ctrl+V / Cmd+V) thì tự động nhận diện và upload', () => {
    const file = pngFile('pasted.png');
    const mockClipboardEvent = {
      preventDefault: vi.fn(),
      clipboardData: {
        items: [
          {
            kind: 'file',
            type: 'image/png',
            getAsFile: () => file,
          },
        ],
      },
    } as unknown as ClipboardEvent;

    component.onPaste(mockClipboardEvent);

    expect(mockClipboardEvent.preventDefault).toHaveBeenCalled();
    expect(attachmentStore.addFiles).toHaveBeenCalled();
  });

  it('xoá đính kèm gọi trực tiếp attachmentService.remove', async () => {
    await component.removeAttachment({
      key: 'saved:att-1',
      id: 'att-1',
      name: 'anh.png',
      size: 100,
      mimeType: 'image/png',
      isImage: true,
      url: 'https://example.com/anh.png',
      isCover: false,
      isPending: false,
    });

    expect(attachmentStore.remove).toHaveBeenCalledWith('c1', 'att-1');
  });

  it('đổi ảnh bìa gọi trực tiếp attachmentService.toggleCover', async () => {
    await component.toggleCover({
      key: 'saved:att-1',
      id: 'att-1',
      name: 'anh.png',
      size: 100,
      mimeType: 'image/png',
      isImage: true,
      url: 'https://example.com/anh.png',
      isCover: false,
      isPending: false,
    });

    expect(attachmentStore.toggleCover).toHaveBeenCalledWith('c1', 'att-1');
  });

  it('bấm "Delete card" thì hiện dải cảnh báo xác nhận xoá', () => {
    expect(component.confirmDelete()).toBe(false);
    component.requestDelete();
    expect(component.confirmDelete()).toBe(true);

    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Delete card "Thẻ thử"? This cannot be undone.');
    expect(el.textContent).toContain('Yes, delete');
  });
});
