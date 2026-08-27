import { describe, it, expect } from 'vitest';
import { docIcs, taoIcs, TOI_DA_SU_KIEN, type SuKienXuat } from './ics.util';

function suKien(over: Partial<SuKienXuat> = {}): SuKienXuat {
  return {
    id: 'm-1',
    title: 'Sprint review',
    startAt: '2026-09-01T07:30:00.000Z',
    endAt: '2026-09-01T08:00:00.000Z',
    ...over,
  };
}
/** Độ dài theo OCTET — đơn vị mà RFC 5545 dùng, không phải số ký tự. */
const soByte = (s: string) => new TextEncoder().encode(s).length;

describe('taoIcs — viết file', () => {
  it('có khung VCALENDAR/VEVENT đầy đủ', () => {
    const ics = taoIcs([suKien()]);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('END:VEVENT');
    expect(ics).toContain('END:VCALENDAR');
  });

  it('xuống dòng bằng CRLF và file kết thúc bằng CRLF', () => {
    // Apple Calendar từ chối file chỉ dùng LF.
    const ics = taoIcs([suKien()]);
    expect(ics.endsWith('\r\n')).toBe(true);
    expect(/[^\r]\n/.test(ics)).toBe(false);
  });

  it('giờ ghi dạng UTC, KHÔNG dùng TZID', () => {
    // TZID bắt buộc phải kèm cả khối VTIMEZONE mới hợp lệ; dạng UTC thì không.
    const ics = taoIcs([suKien()]);
    expect(ics).toContain('DTSTART:20260901T073000Z');
    expect(ics).toContain('DTEND:20260901T080000Z');
    expect(ics).not.toContain('TZID');
  });

  it('UID bền theo id cuộc họp — nhập lại là cập nhật, không nhân đôi', () => {
    expect(taoIcs([suKien({ id: 'abc' })])).toContain('UID:abc@horizon-hub-harmony');
    expect(taoIcs([suKien({ id: 'abc' })])).toContain('UID:abc@horizon-hub-harmony');
  });

  it('thoát dấu phẩy, chấm phẩy, gạch chéo ngược và xuống dòng', () => {
    const ics = taoIcs([
      suKien({ title: 'Họp A, B; C\\D', description: 'dòng 1\ndòng 2' }),
    ]);
    // Dấu phẩy chưa thoát làm vài trình đọc cắt cụt tiêu đề.
    // `String.raw` vì chuỗi kỳ vọng đầy gạch chéo ngược — viết bằng nháy
    // thường thì `'\;'` lại thành `';'` và bài test tự nó sai.
    expect(ics).toContain(String.raw`SUMMARY:Họp A\, B\; C\\D`);
    expect(ics).toContain(String.raw`DESCRIPTION:dòng 1\ndòng 2`);
  });

  it('KHÔNG dòng nào vượt 75 octet, kể cả tiêu đề tiếng Việt dài', () => {
    // Tiếng Việt có dấu chiếm 2-3 byte/ký tự — đếm theo ký tự là gấp hụt.
    const ics = taoIcs([
      suKien({
        title: 'Cuộc họp tổng kết quý ba của toàn bộ đội ngũ phát triển sản phẩm và thiết kế',
        description: 'x'.repeat(400),
      }),
    ]);
    for (const d of ics.split('\r\n')) {
      expect(soByte(d), `dòng quá dài: ${d}`).toBeLessThanOrEqual(75);
    }
  });

  it('gấp dòng KHÔNG cắt vào giữa ký tự nhiều byte', () => {
    const tieuDe = 'Đ'.repeat(120); // mỗi chữ 2 byte
    const ics = taoIcs([suKien({ title: tieuDe })]);
    // Cắt sai chỗ thì bỏ gấp ra sẽ có ký tự thay thế U+FFFD.
    expect(ics).not.toContain('�');
    expect(docIcs(ics).suKien[0].title).toBe(tieuDe);
  });

  it('kèm VALARM khi có nhắc trước, và KHÔNG kèm khi chọn không nhắc', () => {
    expect(taoIcs([suKien({ remindMinutes: 10 })])).toContain('TRIGGER:-PT10M');
    expect(taoIcs([suKien({ remindMinutes: 0 })])).not.toContain('BEGIN:VALARM');
    expect(taoIcs([suKien()])).not.toContain('BEGIN:VALARM');
  });

  it('ghi người tổ chức và khách mời dạng mailto', () => {
    const ics = taoIcs([
      suKien({
        organizer: { name: 'An Huy', email: 'an@x.com' },
        attendees: [{ name: 'Bình', email: 'binh@x.com' }],
      }),
    ]);
    expect(ics).toContain('ORGANIZER;CN=An Huy:mailto:an@x.com');
    // Dòng ATTENDEE đủ dài để BỊ GẤP (đúng chuẩn), nên `mailto:...` nằm vắt
    // qua hai dòng — phải đọc lại file mới kiểm được, không so chuỗi thô.
    expect(docIcs(ics).suKien[0].attendeeEmails).toContain('binh@x.com');
  });

  it('tên có dấu phẩy trong CN được bọc ngoặc kép, không thoát bằng gạch chéo', () => {
    // Tham số có luật thoát KHÁC giá trị TEXT — dùng `\,` ở đây là sai chuẩn.
    const ics = taoIcs([suKien({ organizer: { name: 'Huy, Trần', email: 'a@x.com' } })]);
    expect(ics).toContain('CN="Huy, Trần"');
    expect(ics).not.toContain('CN=Huy\\,');
  });

  it('link phòng họp vào LOCATION — chỗ Apple/Google hiện nút tham gia', () => {
    const ics = taoIcs([suKien({ location: 'https://meet.google.com/abc-defg-hij' })]);
    expect(ics).toContain('LOCATION:https://meet.google.com/abc-defg-hij');
  });

  it('gói nhiều cuộc họp vào MỘT file', () => {
    const ics = taoIcs([suKien({ id: 'a' }), suKien({ id: 'b' }), suKien({ id: 'c' })]);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(3);
    expect(ics.match(/BEGIN:VCALENDAR/g)).toHaveLength(1);
  });
});

describe('docIcs — báo lỗi file không phù hợp', () => {
  it('file rỗng', () => {
    expect(docIcs('').loi).toContain('empty');
    expect(docIcs('   \n  ').loi).toContain('empty');
  });

  it('file không phải lịch (PDF, ảnh, văn bản thường)', () => {
    // PDF không mang dữ liệu sự kiện có cấu trúc — không nhập vào lịch nào được.
    expect(docIcs('%PDF-1.7\n%âãÏÓ\n1 0 obj').loi).toContain('not a calendar file');
    expect(docIcs('xin chào đây là ghi chú').loi).toContain('not a calendar file');
    expect(docIcs('{"title":"họp"}').loi).toContain('not a calendar file');
  });

  it('file lịch hợp lệ nhưng rỗng sự kiện', () => {
    const ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n';
    expect(docIcs(ics).loi).toContain('no events');
  });

  it('sự kiện thiếu giờ bắt đầu thì bị bỏ và nói rõ', () => {
    const ics =
      'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Không giờ\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';
    const kq = docIcs(ics);
    expect(kq.loi).toContain('usable start time');
    expect(kq.soBoQua).toBe(1);
  });

  it('sự kiện hỏng KHÔNG kéo đổ những sự kiện tốt cùng file', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT', 'SUMMARY:Hỏng', 'END:VEVENT',
      'BEGIN:VEVENT', 'SUMMARY:Tốt', 'DTSTART:20260901T073000Z', 'DTEND:20260901T083000Z', 'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const kq = docIcs(ics);
    expect(kq.loi).toBeNull();
    expect(kq.suKien).toHaveLength(1);
    expect(kq.suKien[0].title).toBe('Tốt');
    expect(kq.soBoQua).toBe(1);
  });

  it('nhận file dù có BOM ở đầu', () => {
    const ics =
      '﻿BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:X\r\nDTSTART:20260901T073000Z\r\nEND:VEVENT\r\nEND:VCALENDAR';
    expect(docIcs(ics).loi).toBeNull();
  });

  it('chặn số sự kiện tối đa, không cho một file cả năm tràn vào', () => {
    const nhieu = ['BEGIN:VCALENDAR'];
    for (let i = 0; i < TOI_DA_SU_KIEN + 20; i++) {
      nhieu.push('BEGIN:VEVENT', `SUMMARY:E${i}`, 'DTSTART:20260901T073000Z', 'END:VEVENT');
    }
    nhieu.push('END:VCALENDAR');
    expect(docIcs(nhieu.join('\r\n')).suKien).toHaveLength(TOI_DA_SU_KIEN);
  });
});

describe('docIcs — đọc đúng mốc thời gian', () => {
  const boc = (than: string[]) =>
    ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', ...than, 'END:VEVENT', 'END:VCALENDAR'].join(
      '\r\n',
    );

  it('giờ UTC đọc nguyên vẹn', () => {
    const kq = docIcs(boc(['SUMMARY:X', 'DTSTART:20260901T073000Z', 'DTEND:20260901T080000Z']));
    expect(kq.suKien[0].startAt).toBe('2026-09-01T07:30:00.000Z');
    expect(kq.suKien[0].endAt).toBe('2026-09-01T08:00:00.000Z');
  });

  it('TZID quy đúng về thời điểm tuyệt đối (Asia/Ho_Chi_Minh = UTC+7)', () => {
    const kq = docIcs(
      boc([
        'SUMMARY:Họp chiều',
        'DTSTART;TZID=Asia/Ho_Chi_Minh:20260901T143000',
        'DTEND;TZID=Asia/Ho_Chi_Minh:20260901T153000',
      ]),
    );
    expect(kq.suKien[0].startAt).toBe('2026-09-01T07:30:00.000Z');
    expect(kq.suKien[0].timeZone).toBe('Asia/Ho_Chi_Minh');
  });

  it('TZID có đổi giờ mùa: New York mùa hè là UTC-4, mùa đông là UTC-5', () => {
    // Cùng một giờ tường, hai mùa, phải ra hai độ lệch khác nhau. Dùng độ lệch
    // cố định là một trong hai mùa sẽ sai đúng một tiếng.
    const he = docIcs(boc(['SUMMARY:H', 'DTSTART;TZID=America/New_York:20260701T090000']));
    expect(he.suKien[0].startAt).toBe('2026-07-01T13:00:00.000Z');

    const dong = docIcs(boc(['SUMMARY:D', 'DTSTART;TZID=America/New_York:20260101T090000']));
    expect(dong.suKien[0].startAt).toBe('2026-01-01T14:00:00.000Z');
  });

  it('múi giờ lạ (tên kiểu Windows của Outlook) → vẫn nhập, kèm CẢNH BÁO', () => {
    const kq = docIcs(
      boc(['SUMMARY:X', 'DTSTART;TZID=Pacific Standard Time:20260901T090000']),
    );
    expect(kq.loi).toBeNull();
    expect(kq.suKien[0].canhBao.join(' ')).toContain('Unknown time zone');
  });

  it('sự kiện cả ngày', () => {
    const kq = docIcs(
      boc(['SUMMARY:Nghỉ lễ', 'DTSTART;VALUE=DATE:20260902', 'DTEND;VALUE=DATE:20260903']),
    );
    expect(kq.suKien[0].allDay).toBe(true);
    expect(new Date(kq.suKien[0].endAt).getTime()).toBeGreaterThan(
      new Date(kq.suKien[0].startAt).getTime(),
    );
  });

  it('DURATION thay cho DTEND', () => {
    const kq = docIcs(boc(['SUMMARY:X', 'DTSTART:20260901T070000Z', 'DURATION:PT1H30M']));
    expect(kq.suKien[0].endAt).toBe('2026-09-01T08:30:00.000Z');
  });

  it('thiếu cả DTEND lẫn DURATION → mặc định 1 giờ và nói rõ', () => {
    const kq = docIcs(boc(['SUMMARY:X', 'DTSTART:20260901T070000Z']));
    expect(kq.suKien[0].endAt).toBe('2026-09-01T08:00:00.000Z');
    expect(kq.suKien[0].canhBao.join(' ')).toContain('No end time');
  });

  it('kết thúc TRƯỚC khi bắt đầu → sửa lại, không đẩy dữ liệu hỏng xuống database', () => {
    // Database có `check (end_at > start_at)` — để lọt xuống là lỗi Postgres 500.
    const kq = docIcs(
      boc(['SUMMARY:X', 'DTSTART:20260901T090000Z', 'DTEND:20260901T080000Z']),
    );
    expect(new Date(kq.suKien[0].endAt).getTime()).toBeGreaterThan(
      new Date(kq.suKien[0].startAt).getTime(),
    );
    expect(kq.suKien[0].canhBao.join(' ')).toContain('not after the start');
  });

  it('sắp xếp theo giờ bắt đầu', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT', 'SUMMARY:Sau', 'DTSTART:20260903T070000Z', 'END:VEVENT',
      'BEGIN:VEVENT', 'SUMMARY:Truoc', 'DTSTART:20260901T070000Z', 'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    expect(docIcs(ics).suKien.map((s) => s.title)).toEqual(['Truoc', 'Sau']);
  });
});

describe('docIcs — chi tiết cú pháp RFC dễ sai', () => {
  it('bỏ gấp dòng TRƯỚC khi tách thuộc tính', () => {
    // Tách trước rồi mới bỏ gấp thì mọi mô tả dài đều vỡ.
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'DTSTART:20260901T070000Z',
      'SUMMARY:Phần đầu của tiêu đề rất dài',
      ' và phần nối tiếp',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    expect(docIcs(ics).suKien[0].title).toBe('Phần đầu của tiêu đề rất dàivà phần nối tiếp');
  });

  it('giá trị chứa dấu hai chấm (URL) không bị cắt', () => {
    const ics = [
      'BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'DTSTART:20260901T070000Z',
      'LOCATION:https://meet.google.com/abc-defg-hij', 'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    expect(docIcs(ics).suKien[0].location).toBe('https://meet.google.com/abc-defg-hij');
  });

  it('đọc được file dùng LF thường thay vì CRLF', () => {
    const ics = 'BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:X\nDTSTART:20260901T070000Z\nEND:VEVENT\nEND:VCALENDAR';
    expect(docIcs(ics).suKien).toHaveLength(1);
  });

  it('DESCRIPTION của VALARM KHÔNG đè lên mô tả của cuộc họp', () => {
    const ics = [
      'BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'DTSTART:20260901T070000Z',
      'SUMMARY:Họp', 'DESCRIPTION:Mô tả thật',
      'BEGIN:VALARM', 'TRIGGER:-PT15M', 'ACTION:DISPLAY', 'DESCRIPTION:Nhắc nhở', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    const sk = docIcs(ics).suKien[0];
    expect(sk.description).toBe('Mô tả thật');
    expect(sk.remindMinutes).toBe(15);
  });

  it('TRIGGER dương (nhắc SAU khi bắt đầu) thì bỏ, không thành nhắc trước', () => {
    const ics = [
      'BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'DTSTART:20260901T070000Z',
      'BEGIN:VALARM', 'TRIGGER:PT15M', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    expect(docIcs(ics).suKien[0].remindMinutes).toBeNull();
  });

  it('gom email khách mời, bỏ trùng', () => {
    const ics = [
      'BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'DTSTART:20260901T070000Z',
      'ATTENDEE;CN=An;RSVP=TRUE:mailto:An@X.com',
      'ATTENDEE;CN=Binh:mailto:binh@x.com',
      'ATTENDEE:mailto:an@x.com',
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    expect(docIcs(ics).suKien[0].attendeeEmails.sort()).toEqual(['an@x.com', 'binh@x.com']);
  });

  it('bỏ thoát đúng khi đọc lại', () => {
    const ics = [
      'BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'DTSTART:20260901T070000Z',
      String.raw`SUMMARY:A\, B\; C\\D`, String.raw`DESCRIPTION:d1\nd2`,
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    const sk = docIcs(ics).suKien[0];
    expect(sk.title).toBe('A, B; C\\D');
    expect(sk.description).toBe('d1\nd2');
  });
});

describe('khứ hồi — xuất rồi nhập lại phải y nguyên', () => {
  it('giữ nguyên tiêu đề, mô tả, giờ, link và mức nhắc', () => {
    const goc: SuKienXuat = {
      id: 'm-99',
      title: 'Họp tổng kết quý 3, đội sản phẩm; phòng A\\B',
      description: 'Chương trình:\n- Điểm tiến độ\n- Rủi ro',
      startAt: '2026-09-01T07:30:00.000Z',
      endAt: '2026-09-01T09:00:00.000Z',
      location: 'https://meet.google.com/abc-defg-hij',
      organizer: { name: 'An', email: 'an@x.com' },
      attendees: [{ name: 'Bình', email: 'binh@x.com' }],
      remindMinutes: 30,
    };

    const sk = docIcs(taoIcs([goc])).suKien[0];
    expect(sk.title).toBe(goc.title);
    expect(sk.description).toBe(goc.description);
    expect(sk.startAt).toBe(goc.startAt);
    expect(sk.endAt).toBe(goc.endAt);
    expect(sk.location).toBe(goc.location);
    expect(sk.remindMinutes).toBe(30);
    expect(sk.attendeeEmails).toContain('binh@x.com');
    expect(sk.uid).toBe('m-99@horizon-hub-harmony');
  });

  it('khứ hồi qua tiêu đề dài phải gấp dòng vẫn nguyên vẹn', () => {
    const title = 'Cuộc họp rà soát toàn bộ tiến độ của đội ngũ phát triển sản phẩm quý ba năm 2026';
    expect(docIcs(taoIcs([suKien({ title })])).suKien[0].title).toBe(title);
  });
});

describe('đọc được file THẬT do Google và Apple xuất ra', () => {
  it('Google Calendar', () => {
    const google = [
      'BEGIN:VCALENDAR', 'PRODID:-//Google Inc//Google Calendar 70.9054//EN', 'VERSION:2.0',
      'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VTIMEZONE', 'TZID:Asia/Ho_Chi_Minh',
      'BEGIN:STANDARD', 'TZOFFSETFROM:+0700', 'TZOFFSETTO:+0700', 'TZNAME:+07',
      'DTSTART:19700101T000000', 'END:STANDARD', 'END:VTIMEZONE',
      'BEGIN:VEVENT',
      'DTSTART;TZID=Asia/Ho_Chi_Minh:20260901T143000',
      'DTEND;TZID=Asia/Ho_Chi_Minh:20260901T153000',
      'DTSTAMP:20260827T030000Z',
      'UID:6f8k2m1p3q@google.com',
      'CREATED:20260820T010000Z',
      'DESCRIPTION:Tham gia bằng Google Meet: https://meet.google.com/abc-defg-hij',
      'LAST-MODIFIED:20260820T010000Z', 'LOCATION:', 'SEQUENCE:0', 'STATUS:CONFIRMED',
      'SUMMARY:Họp tuần đội sản phẩm', 'TRANSP:OPAQUE',
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');

    const kq = docIcs(google);
    expect(kq.loi).toBeNull();
    expect(kq.suKien[0].title).toBe('Họp tuần đội sản phẩm');
    // 14:30 giờ Việt Nam = 07:30 UTC.
    expect(kq.suKien[0].startAt).toBe('2026-09-01T07:30:00.000Z');
    expect(kq.suKien[0].uid).toBe('6f8k2m1p3q@google.com');
  });

  it('Apple Calendar', () => {
    const apple = [
      'BEGIN:VCALENDAR', 'CALSCALE:GREGORIAN',
      'PRODID:-//Apple Inc.//macOS 15.2//EN', 'VERSION:2.0',
      'BEGIN:VEVENT',
      'CREATED:20260820T010000Z',
      'DTEND;TZID=Asia/Ho_Chi_Minh:20260901T153000',
      'DTSTAMP:20260827T030000Z',
      'DTSTART;TZID=Asia/Ho_Chi_Minh:20260901T143000',
      'LAST-MODIFIED:20260820T010000Z',
      'SEQUENCE:0',
      'SUMMARY:Đánh giá thiết kế',
      'UID:3F2504E0-4F89-11D3-9A0C-0305E82C3301',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Nhắc nhở', 'TRIGGER:-PT10M', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');

    const kq = docIcs(apple);
    expect(kq.loi).toBeNull();
    expect(kq.suKien[0].title).toBe('Đánh giá thiết kế');
    expect(kq.suKien[0].startAt).toBe('2026-09-01T07:30:00.000Z');
    expect(kq.suKien[0].remindMinutes).toBe(10);
  });
});

describe('RRULE — xuất', () => {
  it('không lặp thì không có dòng RRULE', () => {
    expect(taoIcs([suKien()])).not.toContain('RRULE');
  });

  it('ghi RRULE vào trong VEVENT', () => {
    const ics = taoIcs([suKien({ quyTac: { freq: 'WEEKLY', count: 4 } })]);
    expect(ics).toContain('RRULE:FREQ=WEEKLY;COUNT=4');
    // Phải nằm giữa BEGIN/END:VEVENT, không phải ở cấp VCALENDAR.
    const than = ics.slice(ics.indexOf('BEGIN:VEVENT'), ics.indexOf('END:VEVENT'));
    expect(than).toContain('RRULE:');
  });

  it('MỘT dòng RRULE cho cả chuỗi, không đẻ ra nhiều VEVENT', () => {
    // Ghi mỗi lần diễn ra thành một VEVENT riêng thì trình lịch coi chúng là
    // những sự kiện rời rạc, và người dùng phải xoá từng cái một.
    const ics = taoIcs([suKien({ quyTac: { freq: 'DAILY', count: 30 } })]);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  });
});

describe('RRULE — nhập', () => {
  const boc = (than: string[]) =>
    ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', ...than, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');

  it('đọc được quy tắc lặp', () => {
    const kq = docIcs(
      boc(['SUMMARY:Daily standup', 'DTSTART:20260901T020000Z', 'RRULE:FREQ=DAILY;COUNT=3']),
    );
    expect(kq.suKien[0].quyTac).toMatchObject({ freq: 'DAILY', count: 3 });
  });

  it('TRẢI thành từng lần diễn ra', () => {
    // Bộ nhắc đặt hẹn giờ theo mốc cụ thể; không trải thì chỉ nhắc lần đầu.
    const kq = docIcs(
      boc(['SUMMARY:Standup', 'DTSTART:20260901T020000Z', 'DTEND:20260901T023000Z',
           'RRULE:FREQ=DAILY;COUNT=3']),
    );
    expect(kq.suKien).toHaveLength(3);
    expect(kq.suKien.map((s) => s.startAt.slice(0, 10))).toEqual([
      '2026-09-01', '2026-09-02', '2026-09-03',
    ]);
  });

  it('mỗi lần trải giữ nguyên độ dài buổi họp', () => {
    const kq = docIcs(
      boc(['SUMMARY:X', 'DTSTART:20260901T020000Z', 'DTEND:20260901T030000Z',
           'RRULE:FREQ=DAILY;COUNT=2']),
    );
    for (const sk of kq.suKien) {
      expect(new Date(sk.endAt).getTime() - new Date(sk.startAt).getTime()).toBe(3600_000);
    }
  });

  it('chỉ lần ĐẦU giữ quy tắc — những lần sau không', () => {
    // Lần nào cũng mang quy tắc thì xuất lại ra .ics sẽ thành nhiều chuỗi lặp
    // chồng lên nhau.
    const kq = docIcs(
      boc(['SUMMARY:X', 'DTSTART:20260901T020000Z', 'RRULE:FREQ=DAILY;COUNT=3']),
    );
    expect(kq.suKien[0].quyTac).toBeTruthy();
    expect(kq.suKien[0].laLanLap).toBe(false);
    expect(kq.suKien.slice(1).every((s) => s.quyTac === null && s.laLanLap)).toBe(true);
  });

  it('quy tắc KHÔNG hỗ trợ được → nhập như sự kiện đơn, kèm cảnh báo', () => {
    const kq = docIcs(boc(['SUMMARY:X', 'DTSTART:20260901T020000Z', 'RRULE:FREQ=HOURLY']));
    expect(kq.suKien).toHaveLength(1);
    expect(kq.suKien[0].canhBao.join(' ')).toContain('not supported');
  });

  it('tắt trải lặp thì chỉ lấy lần đầu', () => {
    const kq = docIcs(
      boc(['SUMMARY:X', 'DTSTART:20260901T020000Z', 'RRULE:FREQ=DAILY;COUNT=5']),
      { traiLap: false },
    );
    expect(kq.suKien).toHaveLength(1);
  });
});

describe('nhập theo KHOẢNG NGÀY', () => {
  const nhieuNgay = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT', 'SUMMARY:Thang 8', 'DTSTART:20260815T020000Z', 'END:VEVENT',
    'BEGIN:VEVENT', 'SUMMARY:Thang 9', 'DTSTART:20260915T020000Z', 'END:VEVENT',
    'BEGIN:VEVENT', 'SUMMARY:Thang 10', 'DTSTART:20261015T020000Z', 'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  it('không chọn khoảng thì lấy tất', () => {
    expect(docIcs(nhieuNgay).suKien).toHaveLength(3);
  });

  it('lọc đúng theo từ ngày — đến ngày', () => {
    const kq = docIcs(nhieuNgay, { tuNgay: '2026-09-01', denNgay: '2026-09-30' });
    expect(kq.suKien.map((s) => s.title)).toEqual(['Thang 9']);
  });

  it('chỉ có "từ ngày" thì lấy mọi thứ sau đó', () => {
    expect(docIcs(nhieuNgay, { tuNgay: '2026-09-01' }).suKien).toHaveLength(2);
  });

  it('bao gồm TRỌN ngày cuối, không cắt ở 00:00', () => {
    // Chọn "đến 15/9" mà cắt ở đầu ngày là mất sạch buổi trong chính ngày đó.
    const kq = docIcs(nhieuNgay, { tuNgay: '2026-09-15', denNgay: '2026-09-15' });
    expect(kq.suKien).toHaveLength(1);
  });

  it('khoảng không chứa sự kiện nào → báo lỗi nói rõ phải làm gì', () => {
    const kq = docIcs(nhieuNgay, { tuNgay: '2027-01-01', denNgay: '2027-01-31' });
    expect(kq.suKien).toHaveLength(0);
    expect(kq.loi).toContain('date range');
  });

  it('chuỗi lặp bắt đầu TRƯỚC khoảng vẫn cho ra các buổi TRONG khoảng', () => {
    // Đây là lý do phải TRẢI trước rồi mới LỌC. Lọc trước là loại luôn cả chuỗi
    // vì mốc bắt đầu gốc nằm ngoài khoảng — và tháng 9 không có gì để nhập, dù
    // thực tế tuần nào cũng có buổi.
    const ics = [
      'BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'SUMMARY:Hop tuan',
      'DTSTART:20260106T020000Z', 'RRULE:FREQ=WEEKLY;COUNT=60',
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    const kq = docIcs(ics, { tuNgay: '2026-09-01', denNgay: '2026-09-30' });
    expect(kq.suKien.length).toBeGreaterThanOrEqual(4);
    expect(kq.suKien.every((s) => s.startAt >= '2026-09-01' && s.startAt <= '2026-10-01')).toBe(true);
  });
});
