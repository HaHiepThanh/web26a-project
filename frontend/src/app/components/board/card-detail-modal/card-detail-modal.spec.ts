import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';

import { CardDetailModal } from './card-detail-modal';
import { Card } from '../../../models';

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

/**
 * Giả một lần chọn tệp từ `<input type="file">`.
 *
 * Không dựng `<input>` thật + `DataTransfer`: jsdom không có `DataTransfer`, và
 * `input.files` là thuộc tính chỉ-đọc nên cũng không gán tay được. `onFilesSelected`
 * chỉ cần `target.files` duyệt được bằng `Array.from` và `target.value` ghi được.
 */
function chonTep(component: CardDetailModal, ...files: File[]): void {
  component.onFilesSelected({ target: { files, value: '' } } as unknown as Event);
}

/**
 * Đính kèm nằm TRONG bản nháp: chọn tệp chỉ đổi trên màn hình, phải bấm "Lưu
 * thay đổi" mới thật sự tải lên. Đây là phần dễ vỡ nhất khi sửa modal sau này.
 */
describe('CardDetailModal — đính kèm chờ lưu', () => {
  let fixture: ComponentFixture<CardDetailModal>;
  let component: CardDetailModal;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CardDetailModal],
      providers: [provideHttpClient()],
    }).compileComponents();

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

  it('chọn tệp chỉ vào bản nháp, chưa gửi lên server', () => {
    chonTep(component, pngFile('anh.png'));

    const rows = component.attachmentRows();
    expect(rows.length).toBe(1);
    expect(rows[0].isPending).toBe(true);
    expect(rows[0].id).toBeNull(); // chưa có id vì chưa tải lên
    // Có tệp chờ là đủ để nút "Lưu thay đổi" sáng lên, dù không đụng ô nào khác.
    expect(component.dirty()).toBe(true);
    expect(component.canSave()).toBe(true);
  });

  it('bỏ tệp chưa lưu thì mất khỏi bản nháp, không còn gì để lưu', () => {
    chonTep(component, pngFile('anh.png'));
    component.removeAttachment(component.attachmentRows()[0]);

    expect(component.attachmentRows().length).toBe(0);
    expect(component.dirty()).toBe(false);
  });

  it('"Bỏ thay đổi" huỷ sạch tệp đang chờ', () => {
    chonTep(component, pngFile('a.png'), pngFile('b.png'));
    expect(component.attachmentRows().length).toBe(2);

    component.discard();

    expect(component.attachmentRows().length).toBe(0);
    expect(component.dirty()).toBe(false);
  });

  it('tệp quá 10MB bị bỏ qua và báo lý do', () => {
    chonTep(component, pngFile('to-qua.png', 11 * 1024 * 1024));

    expect(component.attachmentRows().length).toBe(0);
    expect(component.attachmentError()).toContain('to-qua.png');
  });

  it('chọn ảnh bìa là thay đổi chưa lưu, xem trước được ngay', () => {
    chonTep(component, pngFile('bia.png'));
    const row = component.attachmentRows()[0];

    component.toggleCover(row);

    expect(component.coverRow()?.key).toBe(row.key);
    expect(component.dirty()).toBe(true);
  });

  it('bỏ tệp đang là bìa thì bìa cũng bỏ theo, không trỏ vào tệp đã mất', () => {
    chonTep(component, pngFile('bia.png'));
    const row = component.attachmentRows()[0];
    component.toggleCover(row);

    component.removeAttachment(row);

    expect(component.coverRow()).toBeNull();
  });
});
