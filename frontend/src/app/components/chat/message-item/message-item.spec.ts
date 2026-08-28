import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Message } from '../../../models';
import { MessageItem, NHAN_THU_HOI } from './message-item';

const A = 'u-a';
const B = 'u-b';

function tin(over: Partial<Message> = {}): Message {
  return {
    id: 'm-1',
    orgId: 'org-1',
    boardId: 'b-1',
    userId: A,
    content: 'nội dung',
    createdAt: '2026-01-01T03:00:00Z',
    ...over,
  };
}

/** Ô trích dẫn — CỐ Ý không có trường `replyTo` lồng bên trong. */
const trichDan = (over: Partial<NonNullable<Message['replyTo']>> = {}) => ({
  id: 'm-0',
  userId: B,
  content: 'câu gốc',
  deletedAt: null,
  user: { displayName: 'Bảo', avatarUrl: null },
  ...over,
});

describe('MessageItem', () => {
  let fixture: ComponentFixture<MessageItem>;

  async function dung(message: Message, isOwn = true, currentUserId = A) {
    await TestBed.configureTestingModule({ imports: [MessageItem] }).compileComponents();
    fixture = TestBed.createComponent(MessageItem);
    fixture.componentRef.setInput('message', message);
    fixture.componentRef.setInput('isOwn', isOwn);
    fixture.componentRef.setInput('currentUserId', currentUserId);
    fixture.detectChanges();
    return fixture;
  }

  const oTrichDan = () => fixture.debugElement.queryAll(By.css('button[title^="Nhảy tới"]'));
  const chu = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  describe('ba ca lồng nhau', () => {
    it('A trả lời B → nhãn ghi "Bạn đã trả lời Bảo"', async () => {
      await dung(tin({ replyToId: 'm-0', replyTo: trichDan() }));
      expect(oTrichDan().length).toBe(1);
      expect(chu()).toContain('Bạn đã trả lời Bảo');
      expect(chu()).toContain('câu gốc');
    });

    it('A trả lời CHÍNH MÌNH → nhãn ghi "Bạn đã trả lời chính mình"', async () => {
      // Theo lối Messenger: nói thẳng quan hệ thay vì bắt người đọc nhìn một
      // cái tên rồi tự đối chiếu xem nó là ai.
      await dung(tin({ replyToId: 'm-0', replyTo: trichDan({ userId: A, user: { displayName: 'An', avatarUrl: null } }) }));
      expect(chu()).toContain('Bạn đã trả lời chính mình');
    });

    it('NGƯỜI KHÁC trả lời MÌNH → nhãn ghi "... đã trả lời bạn"', async () => {
      await dung(
        tin({ userId: B, replyToId: 'm-0', replyTo: trichDan({ userId: A, user: { displayName: 'An', avatarUrl: null } }) }),
        false,
        A,
      );
      expect(chu()).toContain('đã trả lời bạn');
    });

    it('trích dẫn DÀI bị cắt ở hai dòng, không được đẩy vỡ khung', async () => {
      // Tin nhắn dài từng đẩy tràn ngang cả khung chat: `1fr` của CSS Grid có
      // mức tối thiểu bằng kích thước nội dung, nên cột phình theo chuỗi dài.
      // Bố cục thật không kiểm được trong jsdom (không có engine dàn trang),
      // nên ở đây khoá phần KHAI BÁO — mất `line-clamp-2` là test đỏ.
      await dung(tin({ replyToId: 'm-0', replyTo: trichDan({ content: 'x'.repeat(400) }) }));
      const noiDung = fixture.debugElement.query(By.css('.chat-header button span'));
      expect(noiDung.nativeElement.className).toContain('line-clamp-2');
      expect(noiDung.nativeElement.className).toContain('break-words');
    });

    it('ô trích dẫn nằm NGOÀI bong bóng, ở hàng phía trên', async () => {
      // Đặt lồng trong bong bóng thì phải nuôi hai bộ màu (nền primary đặc và
      // nền thường); ra ngoài thì chỉ còn một, và đúng lối Messenger.
      await dung(tin({ replyToId: 'm-0', replyTo: trichDan() }));
      const trongHeader = fixture.debugElement.queryAll(By.css('.chat-header button[title^="Nhảy tới"]'));
      const trongBubble = fixture.debugElement.queryAll(By.css('.chat-bubble button[title^="Nhảy tới"]'));
      expect(trongHeader.length).toBe(1);
      expect(trongBubble.length).toBe(0);
    });

    it('A trả lời một TIN VỐN ĐÃ LÀ TRẢ LỜI → vẫn CHỈ MỘT ô trích dẫn', async () => {
      // Đây là ca dễ vỡ nhất. Nếu ô trích dẫn mang theo trích dẫn của chính nó
      // thì A→B, C→A, D→C sẽ lồng tới tầng thứ ba và bể khung chat ~300px.
      // Kiểu `MessageQuote` không có trường `replyTo`, và test này giữ cho nó
      // không bị ai đó thêm vào "cho đủ thông tin".
      await dung(tin({ replyToId: 'm-0', replyTo: trichDan({ content: 'ừ đúng rồi' }) }));

      expect(oTrichDan().length).toBe(1);
      expect(Object.keys(trichDan())).not.toContain('replyTo');
    });

    it('không trả lời ai thì không có ô trích dẫn', async () => {
      await dung(tin());
      expect(oTrichDan().length).toBe(0);
    });

    it('bấm ô trích dẫn thì phát id tin gốc để nhảy tới', async () => {
      await dung(tin({ replyToId: 'm-0', replyTo: trichDan() }));
      let nhay: string | null = null;
      fixture.componentInstance.jumpTo.subscribe((id) => (nhay = id));
      oTrichDan()[0].nativeElement.click();
      expect(nhay).toBe('m-0');
    });
  });

  describe('thu hồi', () => {
    it('hiện nhãn thu hồi thay cho nội dung', async () => {
      await dung(tin({ content: '', deletedAt: '2026-01-02T00:00:00Z' }));
      expect(chu()).toContain(NHAN_THU_HOI);
      expect(chu()).not.toContain('nội dung');
    });

    it('tin đã thu hồi thì KHÔNG còn nút trả lời / sửa / thu hồi', async () => {
      await dung(tin({ content: '', deletedAt: '2026-01-02T00:00:00Z' }));
      const nut = fixture.debugElement.queryAll(By.css('.chat-footer button'));
      expect(nut.length).toBe(0);
    });

    it('ô trích dẫn trỏ tới tin ĐÃ THU HỒI cũng hiện nhãn đó', async () => {
      await dung(tin({ replyToId: 'm-0', replyTo: trichDan({ content: '', deletedAt: '2026-01-02T00:00:00Z' }) }));
      expect(chu()).toContain(NHAN_THU_HOI);
    });
  });

  describe('đã chỉnh sửa', () => {
    it('hiện nhãn cạnh giờ', async () => {
      await dung(tin({ editedAt: '2026-01-02T00:00:00Z' }));
      expect(chu()).toContain('đã chỉnh sửa');
    });

    it('chưa sửa thì không có nhãn', async () => {
      await dung(tin());
      expect(chu()).not.toContain('đã chỉnh sửa');
    });

    it('đã THU HỒI thì bỏ luôn nhãn đã-sửa', async () => {
      // Một tin vừa "đã chỉnh sửa" vừa "đã thu hồi" là câu vô nghĩa với người đọc.
      await dung(tin({ content: '', editedAt: '2026-01-02T00:00:00Z', deletedAt: '2026-01-03T00:00:00Z' }));
      expect(chu()).not.toContain('đã chỉnh sửa');
    });
  });

  describe('quyền sửa', () => {
    it('tin của NGƯỜI KHÁC chỉ có nút trả lời', async () => {
      await dung(tin({ userId: B }), false, A);
      const nut = fixture.debugElement.queryAll(By.css('.chat-footer button'));
      expect(nut.length).toBe(1);
      expect(nut[0].attributes['aria-label']).toBe('Trả lời');
    });

    it('tin của MÌNH có đủ trả lời / sửa / thu hồi', async () => {
      await dung(tin());
      const nhan = fixture.debugElement
        .queryAll(By.css('.chat-footer button'))
        .map((n) => n.attributes['aria-label']);
      expect(nhan).toEqual(['Trả lời', 'Sửa', 'Thu hồi']);
    });
  });
});
