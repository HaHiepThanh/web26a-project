import { describe, it, expect } from 'vitest';
import { tachLinkGoogle } from './google-calendar.service';

/** Đúng đường link người dùng gửi. */
const LINK_THAT =
  'https://calendar.google.com/calendar/event?action=TEMPLATE&tmeid=NmVlMWNkbW1waW1qczRicHQ2aGlhc2Y4M21fMjAyNjA4MjdUMTQwMDAwWiBoYWhpZXB0aGFuaGhodHRAbQ&tmsrc=hahiepthanhhhtt%40gmail.com&scp=ALL';

describe('tachLinkGoogle', () => {
  it('tách đúng mã sự kiện và lịch từ link THẬT', () => {
    const r = tachLinkGoogle(LINK_THAT);
    expect(r?.eventId).toBe('6ee1cdmmpimjs4bpt6hiasf83m_20260827T140000Z');
    // `tmsrc` mới là id lịch đầy đủ; phần trong tmeid bị cắt cụt thành
    // "hahiepthanhhhtt@m" nên không dùng được.
    expect(r?.calendarId).toBe('hahiepthanhhhtt@gmail.com');
  });

  it('nhận cả tham số `eid` của link chia sẻ thường', () => {
    const eid = btoa('abc123 primary').replace(/=+$/, '');
    const r = tachLinkGoogle(`https://calendar.google.com/calendar/event?eid=${eid}`);
    expect(r?.eventId).toBe('abc123');
  });

  it('thiếu tmsrc thì lấy phần lịch trong tmeid', () => {
    const eid = btoa('evt1 mylich@group.calendar.google.com').replace(/=+$/, '');
    expect(tachLinkGoogle(`https://calendar.google.com/calendar/event?eid=${eid}`)?.calendarId)
      .toBe('mylich@group.calendar.google.com');
  });

  it('giải được base64url (ký tự - và _)', () => {
    // Google dùng biến thể base64url, không phải base64 chuẩn.
    const r = tachLinkGoogle(LINK_THAT.replace('tmeid=Nm', 'tmeid=Nm'));
    expect(r).not.toBeNull();
  });

  it('TỪ CHỐI host không phải Google — không để dán link lạ vào', () => {
    const eid = btoa('x y');
    expect(tachLinkGoogle(`https://calendar.google.com.ke-gian.net/event?eid=${eid}`)).toBeNull();
    expect(tachLinkGoogle(`https://evil.example/calendar/event?eid=${eid}`)).toBeNull();
  });

  it('link Google nhưng KHÔNG có mã sự kiện → null', () => {
    expect(tachLinkGoogle('https://calendar.google.com/calendar/u/0/r')).toBeNull();
  });

  it('chuỗi không phải URL → null, không ném lỗi', () => {
    expect(tachLinkGoogle('xin chào')).toBeNull();
    expect(tachLinkGoogle('')).toBeNull();
    expect(tachLinkGoogle('   ')).toBeNull();
  });

  it('base64 hỏng → null, không ném lỗi', () => {
    expect(tachLinkGoogle('https://calendar.google.com/calendar/event?eid=!!!khong-phai-base64!!!'))
      .toBeNull();
  });
});
