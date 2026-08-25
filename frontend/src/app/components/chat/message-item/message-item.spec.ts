import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Message, User } from '../../../models';
import { MessageItem } from './message-item';

/**
 * Regression: tin nhắn của chính mình (isOwn) từng hiện initials "Y" vì được
 * tính từ nhãn "You" thay vì tên thật — báo cáo với user "Ngô Đức Hòa" (test
 * "current user identity synchronization"). `senderLabel` được phép là 'You'
 * (chỉ là nhãn), nhưng `initials`/`avatarUrl` PHẢI luôn theo `sender` thật.
 */
describe('MessageItem', () => {
  let fixture: ComponentFixture<MessageItem>;
  let component: MessageItem;

  const baseMessage: Message = {
    id: 'm1',
    orgId: 'o1',
    boardId: 'b1',
    userId: 'u1',
    content: 'hello',
    createdAt: new Date().toISOString(),
  };

  const hoa: User = {
    id: 'u1',
    email: 'ngoduchoa113@gmail.com',
    displayName: 'Ngô Đức Hòa',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [MessageItem] }).compileComponents();
    fixture = TestBed.createComponent(MessageItem);
    component = fixture.componentInstance;
  });

  it('tin nhắn của chính mình: label "You" nhưng initials tính từ tên thật, không phải "Y"', () => {
    fixture.componentRef.setInput('message', baseMessage);
    fixture.componentRef.setInput('sender', hoa);
    fixture.componentRef.setInput('isOwn', true);
    fixture.detectChanges();

    expect(component.senderLabel()).toBe('You');
    expect(component.initials()).toBe('NH');
    expect(component.initials()).not.toBe('Y');
  });

  it('không có avatar tuỳ chỉnh: initials theo tên, đổi tên thì initials đổi theo (case D)', () => {
    fixture.componentRef.setInput('message', baseMessage);
    fixture.componentRef.setInput('sender', hoa);
    fixture.componentRef.setInput('isOwn', true);
    fixture.detectChanges();
    expect(component.initials()).toBe('NH');

    fixture.componentRef.setInput('sender', { ...hoa, displayName: 'Nguyễn Văn An' });
    fixture.detectChanges();
    expect(component.initials()).toBe('NA');
  });

  it('có avatar tuỳ chỉnh: avatarUrl() trả về ảnh thật thay vì rơi về initials (case A)', () => {
    const withAvatar: User = { ...hoa, avatarUrl: 'https://example.com/avatar.png' };
    fixture.componentRef.setInput('message', baseMessage);
    fixture.componentRef.setInput('sender', withAvatar);
    fixture.componentRef.setInput('isOwn', true);
    fixture.detectChanges();

    expect(component.avatarUrl()).toBe('https://example.com/avatar.png');
  });

  it('tin nhắn người khác: label và initials đều theo tên người gửi, không phải "You"', () => {
    fixture.componentRef.setInput('message', baseMessage);
    fixture.componentRef.setInput('sender', hoa);
    fixture.componentRef.setInput('isOwn', false);
    fixture.detectChanges();

    expect(component.senderLabel()).toBe('Ngô Đức Hòa');
    expect(component.initials()).toBe('NH');
  });
});
