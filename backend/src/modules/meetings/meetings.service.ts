import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { AccessService } from '../../common/access/access.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { ImportMeetingsDto } from './dto/import-meetings.dto';




export interface MeetingAttendee {
  id: string;
  displayName: string | null;
  email: string;
  avatarUrl: string | null;
}

export interface MeetingResponse {
  id: string;
  boardId: string;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string;
  timeZone: string;
  remindMinutes: number;
  googleEventId: string | null;
  googleHtmlLink: string | null;
  meetUrl: string | null;
  createdBy: string | null;
  attendees: MeetingAttendee[];
  canceledAt: string | null;
  /** Quy tắc lặp — chỉ dòng ĐẦU của chuỗi có giá trị. */
  recurrence: string | null;
}

interface MeetingRow {
  id: string;
  board_id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string;
  time_zone: string;
  remind_minutes: number;
  google_event_id: string | null;
  google_html_link: string | null;
  meet_url: string | null;
  created_by: string | null;
  canceled_at: string | null;
  recurrence: string | null;
}

/**
 * LỊCH HỌP GOOGLE CALENDAR — bản sao phía mình.
 *
 * ─── VÌ SAO SERVER LƯU LẠI CÁI ĐÃ CÓ BÊN GOOGLE ───
 *
 * Vì yêu cầu có phần "nhắc trước giờ họp qua chuông 🔔", mà nhắc của Google
 * (`reminders.overrides`) chạy TRONG hệ thống Google: nó bật popup trong Google
 * Calendar và gửi mail, và không gọi về server này. Cơ chế đẩy duy nhất Google
 * có là `events.watch`, và cái đó chỉ bắn khi sự kiện BỊ SỬA — không bắn khi
 * tới giờ nhắc. Nên muốn chuông kêu thì phải tự giữ lịch mà đếm giờ.
 *
 * Đọc ngược lịch từ Google cũng không thay được: đọc lịch của ai thì cần token
 * OAuth của người đó, mà token sống ~1 giờ và chỉ nằm trong tab của chính họ.
 *
 * ─── THỨ TỰ: GOOGLE TRƯỚC, MÌNH SAU ───
 *
 * Sự kiện được tạo trên Google TRƯỚC, rồi client mới gọi `POST /meetings`.
 * Ngược lại sẽ tệ hơn: nếu ghi vào đây trước rồi Google hỏng, ta có một cuộc
 * họp ma — chuông vẫn nhắc, nhưng không ai nhận được lời mời và cũng không có
 * phòng nào để vào.
 *
 * Hệ quả phải chấp nhận: nếu bước ghi này hỏng thì bên Google đã lỡ tạo và lỡ
 * gửi mail. Nên ở đây CỐ Ý kiểm tra rất ít — chỉ giữ những bất biến mà thiếu nó
 * thì không lưu nổi. Mọi kiểm tra "cho vui lòng người dùng" (giờ trong quá khứ,
 * tiêu đề trống...) phải làm ở frontend TRƯỚC khi gọi Google, xem
 * schedule-meeting-modal. Từ chối ở đây chỉ tổ đẻ ra sự kiện mồ côi bên Google.
 */
@Injectable()
export class MeetingsService {
  private readonly logger = new Logger(MeetingsService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly access: AccessService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /**
   * Lưu bản sao một cuộc họp vừa tạo trên Google Calendar.
   *
   * Quyền: owner/admin của tổ chức, khớp với nút "Start meeting" của Meet —
   * hẹn lịch cũng là việc thay mặt cả nhóm.
   */
  async create(uid: string, dto: CreateMeetingDto): Promise<MeetingResponse> {
    const board = await this.access.assertBoardAccess(uid, dto.boardId);
    await this.access.assertCanManage(uid, board.orgId);

    // Bất biến duy nhất kiểm ở đây: database có `check (end_at > start_at)`, và
    // để nó nổ thành lỗi Postgres thì client nhận về 500 không hiểu gì. Bắt
    // trước để trả 400 nói rõ.
    if (new Date(dto.endAt).getTime() <= new Date(dto.startAt).getTime()) {
      throw new BadRequestException('endAt must be after startAt.');
    }

    const {
      uids: nguoiXemDuoc,
      boardName,
      orgSlug,
    } = await this.access.nguoiXemDuocBoard(dto.boardId);

    // ⚠️ LỌC LẠI DANH SÁCH NGƯỜI DỰ, không tin `attendeeIds` gửi lên.
    //
    // Không có bước này thì bất kỳ ai gọi được API cũng ghi tên người lạ vào
    // cuộc họp của board mình, và những người đó sẽ nhận chuông + lời nhắc về
    // một board họ không có quyền xem — vừa là phiền, vừa là rò rỉ tên board.
    const duocPhep = new Set(nguoiXemDuoc);
    const nguoiDu = new Set(dto.attendeeIds.filter((id) => duocPhep.has(id)));

    // Người tạo LUÔN là một người dự — giống Google Calendar (người tổ chức
    // cũng nằm trong danh sách khách). Nhờ vậy mọi truy vấn "ai dự buổi này"
    // chỉ cần nhìn đúng một bảng, không phải hỏi thêm "hoặc tôi là người tạo".
    nguoiDu.add(uid);

    // MỖI LẦN DIỄN RA LÀ MỘT DÒNG.
    //
    // Bảng lưu theo `start_at` — một mốc cụ thể; nó không biết đọc quy tắc lặp.
    // Lưu một dòng kèm "mỗi thứ Hai" thì chỉ có tuần đầu là tồn tại trong dữ
    // liệu, và bản `.ics` xuất ra cũng thiếu.
    //
    // `occurrences` do client trải sẵn (xem ghi chú ở CreateMeetingDto). Ở đây
    // chỉ kiểm lại rồi ghi. Rỗng thì đúng một dòng như cũ.
    const keoDai = new Date(dto.endAt).getTime() - new Date(dto.startAt).getTime();
    const mocBatDau = dto.occurrences?.length ? dto.occurrences : [dto.startAt];

    const dong = mocBatDau.map((moc, i) => ({
      board_id: dto.boardId,
      org_id: board.orgId,
      title: dto.title.trim(),
      description: dto.description?.trim() || null,
      start_at: new Date(moc).toISOString(),
      end_at: new Date(new Date(moc).getTime() + keoDai).toISOString(),
      time_zone: dto.timeZone,
      remind_minutes: dto.remindMinutes,
      google_event_id: dto.googleEventId || null,
      google_html_link: dto.googleHtmlLink || null,
      meet_url: dto.meetUrl || null,
      created_by: uid,
      // CHỈ dòng đầu mang quy tắc: xuất ra .ics phải là MỘT dòng RRULE cho cả
      // chuỗi. Dòng nào cũng mang thì file xuất ra có N chuỗi lặp chồng nhau.
      recurrence: i === 0 ? dto.recurrence || null : null,
    }));

    const { data, error } = await this.supabase.client
      .from('board_meetings')
      .insert(dong)
      .select();

    if (error || !data?.length) {
      this.logger.error(
        `Lưu lịch họp thất bại (board=${dto.boardId}): ${error?.message}`,
      );
      throw new InternalServerErrorException('Failed to save the meeting.');
    }
    const tatCa = data as MeetingRow[];
    // Dòng đầu là dòng đại diện — nó mang quy tắc lặp và là thứ trả về cho client.
    const row = tatCa[0];

    // Người dự phải gắn cho MỌI lần diễn ra, không chỉ lần đầu — nếu không thì
    // từ lần thứ hai trở đi không tra được ai là khách của buổi đó.
    const { error: loiNguoiDu } = await this.supabase.client
      .from('board_meeting_attendees')
      .insert(
        tatCa.flatMap((r) => [...nguoiDu].map((u) => ({ meeting_id: r.id, user_id: u }))),
      );

    if (loiNguoiDu) {
      // Cuộc họp không có người dự thì không ai được nhắc — vô dụng. Dọn luôn
      // dòng vừa tạo thay vì để lại một bản ghi nửa vời, giống cách `create`
      // của boards dọn board chết khi thêm thành viên hỏng.
      await this.supabase.client
        .from('board_meetings')
        .delete()
        .in('id', tatCa.map((r) => r.id));
      this.logger.error(`Lưu người dự thất bại: ${loiNguoiDu.message}`);
      throw new InternalServerErrorException('Failed to save the attendees.');
    }

    void this.baoLichHop(uid, 'meeting.scheduled', row, [...nguoiDu], {
      boardName,
      orgSlug,
    });

    return this.toResponse(row, await this.layNguoiDu([row.id]));
  }


  /**
   * NHẬP HÀNG LOẠT từ file lịch.
   *
   * Khác `create()` ở ba điểm, và cả ba đều cố ý:
   *
   *   1. KHÔNG tạo sự kiện bên Google. File .ics vốn xuất ra TỪ một lịch — đẩy
   *      ngược lên là nhân đôi trong lịch người dùng và bắn lại thư mời cho
   *      những người đã nhận từ lâu.
   *   2. Ghi MỘT lần cho cả loạt thay vì gọi API 30 lần.
   *   3. Báo chuông MỘT lời tóm tắt cho mỗi người, không phải 30 lời. Nhập một
   *      học kỳ mà mỗi buổi một thông báo là chuông của cả nhóm không dùng được
   *      nữa.
   */
  async nhapHangLoat(
    uid: string,
    dto: ImportMeetingsDto,
  ): Promise<{ daTao: number; boQua: number }> {
    const board = await this.access.assertBoardAccess(uid, dto.boardId);
    await this.access.assertCanManage(uid, board.orgId);

    if (dto.events.length === 0) {
      throw new BadRequestException('Pick at least one event to import.');
    }

    const { uids: nguoiXemDuoc, boardName, orgSlug } =
      await this.access.nguoiXemDuocBoard(dto.boardId);

    // Lọc lại người dự, không tin danh sách gửi lên — cùng lý do như `create`.
    const duocPhep = new Set(nguoiXemDuoc);
    const nguoiDu = new Set((dto.attendeeIds ?? []).filter((id) => duocPhep.has(id)));
    nguoiDu.add(uid);

    // Bỏ những buổi có giờ không hợp lệ thay vì để database ném lỗi 500 giữa
    // chừng và người dùng mất cả mẻ.
    const hopLe = dto.events.filter(
      (e) => new Date(e.endAt).getTime() > new Date(e.startAt).getTime(),
    );
    if (hopLe.length === 0) {
      throw new BadRequestException('None of the selected events has a valid time range.');
    }

    const { data, error } = await this.supabase.client
      .from('board_meetings')
      .insert(
        hopLe.map((e) => ({
          board_id: dto.boardId,
          org_id: board.orgId,
          title: e.title.trim().slice(0, 200),
          description: e.description?.trim() || null,
          start_at: new Date(e.startAt).toISOString(),
          end_at: new Date(e.endAt).toISOString(),
          time_zone: dto.timeZone,
          // Buổi nhập từ file KHÔNG tự bật nhắc: nhập một học kỳ mà mỗi buổi
          // đều nhắc là chuông kêu suốt. Người dùng bật lại từng buổi nếu muốn.
          remind_minutes: 0,
          google_event_id: null,
          google_html_link: null,
          meet_url: e.meetUrl || null,
          created_by: uid,
          recurrence: null,
        })),
      )
      .select();

    if (error || !data?.length) {
      this.logger.error(`Nhập lịch thất bại (board=${dto.boardId}): ${error?.message}`);
      throw new InternalServerErrorException('Failed to import the meetings.');
    }
    const tatCa = data as MeetingRow[];

    const { error: loiNguoiDu } = await this.supabase.client
      .from('board_meeting_attendees')
      .insert(
        tatCa.flatMap((r) => [...nguoiDu].map((u) => ({ meeting_id: r.id, user_id: u }))),
      );
    if (loiNguoiDu) {
      await this.supabase.client
        .from('board_meetings')
        .delete()
        .in('id', tatCa.map((r) => r.id));
      this.logger.error(`Lưu người dự thất bại: ${loiNguoiDu.message}`);
      throw new InternalServerErrorException('Failed to save the attendees.');
    }

    void this.baoNhapHangLoat(uid, tatCa.length, [...nguoiDu], {
      boardId: dto.boardId,
      boardName,
      orgSlug,
    });

    return { daTao: tatCa.length, boQua: dto.events.length - hopLe.length };
  }

  /** MỘT thông báo tóm tắt cho cả mẻ nhập — xem ghi chú ở `nhapHangLoat`. */
  private async baoNhapHangLoat(
    actorUid: string,
    soBuoi: number,
    nguoiNhan: string[],
    noi: { boardId: string; boardName: string; orgSlug: string },
  ): Promise<void> {
    try {
      const ten = await this.access.tenHienThi(actorUid);
      for (const uid of nguoiNhan) {
        if (uid === actorUid) continue;
        this.realtime.emitToUser(uid, 'meeting.scheduled', actorUid, {
          meetingId: '',
          boardId: noi.boardId,
          boardName: noi.boardName,
          orgSlug: noi.orgSlug,
          title: `${soBuoi} imported meeting${soBuoi > 1 ? 's' : ''}`,
          startAt: new Date().toISOString(),
          byUserName: ten,
        });
      }
    } catch (e) {
      this.logger.warn(`Không báo được mẻ nhập: ${(e as Error).message}`);
    }
  }


  // ------------------------------------------------------------------ nội bộ

  private async layNguoiDu(
    meetingIds: string[],
  ): Promise<Map<string, MeetingAttendee[]>> {
    const ket = new Map<string, MeetingAttendee[]>();
    if (meetingIds.length === 0) return ket;

    const { data } = await this.supabase.client
      .from('board_meeting_attendees')
      .select('meeting_id, users(id, email, display_name, avatar_url)')
      .in('meeting_id', meetingIds);

    for (const r of data ?? []) {
      const u = r.users as unknown as {
        id: string;
        email: string;
        display_name: string | null;
        avatar_url: string | null;
      } | null;
      if (!u) continue;
      const id = r.meeting_id as string;
      const list = ket.get(id) ?? [];
      list.push({
        id: u.id,
        email: u.email,
        displayName: u.display_name,
        avatarUrl: u.avatar_url,
      });
      ket.set(id, list);
    }
    return ket;
  }

  private toResponse(
    row: MeetingRow,
    nguoiDu: Map<string, MeetingAttendee[]>,
  ): MeetingResponse {
    return {
      id: row.id,
      boardId: row.board_id,
      title: row.title,
      description: row.description,
      startAt: row.start_at,
      endAt: row.end_at,
      timeZone: row.time_zone,
      remindMinutes: row.remind_minutes,
      googleEventId: row.google_event_id,
      googleHtmlLink: row.google_html_link,
      meetUrl: row.meet_url,
      createdBy: row.created_by,
      attendees: nguoiDu.get(row.id) ?? [],
      canceledAt: row.canceled_at,
      recurrence: row.recurrence,
    };
  }

  /**
   * Báo chuông cho người được mời.
   *
   * Nuốt lỗi và không `await` ở nơi gọi: cuộc họp đã tạo xong trên Google và
   * mail mời đã gửi. Thông báo hỏng thì cùng lắm mọi người biết chậm — không
   * đáng để người vừa bấm "Tạo" nhận về một lỗi đỏ cho việc đã thành công.
   */
  private async baoLichHop(
    actorUid: string,
    loai: 'meeting.scheduled',
    row: MeetingRow,
    nguoiNhan: string[],
    noi: { boardName: string; orgSlug: string },
  ): Promise<void> {
    try {
      const tenNguoiTao = await this.access.tenHienThi(actorUid);
      for (const uid of nguoiNhan) {
        // Người vừa bấm nút thì không cần ai báo lại cho họ.
        if (uid === actorUid) continue;
        this.realtime.emitToUser(uid, loai, actorUid, {
          meetingId: row.id,
          boardId: row.board_id,
          boardName: noi.boardName,
          orgSlug: noi.orgSlug,
          title: row.title,
          startAt: row.start_at,
          byUserName: tenNguoiTao,
        });
      }
    } catch (e) {
      this.logger.warn(
        `Không báo được lịch họp (meeting=${row.id}): ${(e as Error).message}`,
      );
    }
  }

  /**
   * Đọc và trích xuất thông tin lịch họp từ file PDF do Google Calendar xuất ra.
   */
  async parseGoogleCalendarPdf(buffer: Buffer): Promise<ParsedMeetingPdf> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-require-imports
      const pdf = require('pdf-parse');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
      const res = (await pdf(buffer)) as { text?: string };
      const rawText: string = res?.text || '';

      if (!rawText.trim()) {
        throw new BadRequestException('The uploaded PDF has no readable text.');
      }

      // Xử lý xuống dòng bị ngắt trong email (ví dụ: `hoasen.\nedu.vn`)
      const unwrapped = rawText
        .replace(
          /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]*\.)\r?\n([a-zA-Z0-9.-]+)/g,
          '$1$2',
        )
        .replace(/([a-zA-Z0-9._%+-]+@)\r?\n([a-zA-Z0-9.-]+)/g, '$1$2');

      const lines = unwrapped
        .split(/\r?\n/)
        .map((l: string) => l.trim())
        .filter(Boolean);

      // 1. Người tạo
      let organizer: string | null = null;
      const orgLine = lines.find((l: string) =>
        /^(?:Người tạo|Organizer):/i.test(l),
      );
      if (orgLine) {
        const orgMatch = orgLine.match(/^(?:Người tạo|Organizer):\s*([^·]+)/i);
        if (orgMatch) organizer = orgMatch[1].trim();
      }

      // 2. Tiêu đề
      let title = '';
      const orgIdx = lines.findIndex((l: string) =>
        /^(?:Người tạo|Organizer):/i.test(l),
      );
      if (orgIdx > 0) {
        const candidateLines = lines
          .slice(0, orgIdx)
          .filter((l: string) => !l.includes('@'));
        title = candidateLines.join(' ').trim();
      }
      if (!title) {
        title =
          lines.find(
            (l: string) =>
              !l.includes('@') &&
              !/^(?:Giờ|Time|Ngày|Date|Mô tả|Description)/i.test(l),
          ) || 'Google Calendar Meeting';
      }

      // 3. Thời gian
      let timeStr = '';
      const timeIdx = lines.findIndex((l: string) => /^(?:Giờ|Time)$/i.test(l));
      if (timeIdx >= 0) {
        timeStr = lines.slice(timeIdx + 1, timeIdx + 4).join(' ');
      } else {
        timeStr = lines.join(' ');
      }

      const timeMatch = timeStr.match(
        /(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?\s*[-–—]\s*(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?/i,
      );
      let startTime: string | null = null;
      let endTime: string | null = null;
      let duration = 30;

      if (timeMatch) {
        const [, h1, m1, ap1, h2, m2, ap2] = timeMatch;
        let numH1 = parseInt(h1, 10);
        let numH2 = parseInt(h2, 10);
        if (ap1) {
          const isPm = ap1.toUpperCase() === 'PM';
          if (isPm && numH1 < 12) numH1 += 12;
          if (!isPm && numH1 === 12) numH1 = 0;
        }
        if (ap2) {
          const isPm = ap2.toUpperCase() === 'PM';
          if (isPm && numH2 < 12) numH2 += 12;
          if (!isPm && numH2 === 12) numH2 = 0;
        } else if (ap1 && !ap2) {
          const isPm = ap1.toUpperCase() === 'PM';
          if (isPm && numH2 < 12) numH2 += 12;
          if (!isPm && numH2 === 12) numH2 = 0;
        }
        startTime = `${String(numH1).padStart(2, '0')}:${m1}`;
        endTime = `${String(numH2).padStart(2, '0')}:${m2}`;
        const diff =
          numH2 * 60 + parseInt(m2, 10) - (numH1 * 60 + parseInt(m1, 10));
        duration = diff > 0 ? diff : 30;
      }

      // 4. Ngày
      let date: string | null = null;
      const dateIdx = lines.findIndex((l: string) =>
        /^(?:Ngày|Date)$/i.test(l),
      );
      const dateSearchBlock =
        dateIdx >= 0
          ? lines.slice(dateIdx + 1, dateIdx + 4).join(' ')
          : lines.join(' ');

      const viDateMatch = dateSearchBlock.match(
        /(\d{1,2})\s+[Tt]háng\s+(\d{1,2}),?\s+(\d{4})/i,
      );
      if (viDateMatch) {
        const [, d, m, y] = viDateMatch;
        date = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      } else {
        const enDateMatch = dateSearchBlock.match(
          /([a-zA-Z]+)\s+(\d{1,2}),?\s+(\d{4})/i,
        );
        if (enDateMatch) {
          const months: Record<string, number> = {
            jan: 1,
            feb: 2,
            mar: 3,
            apr: 4,
            may: 5,
            jun: 6,
            jul: 7,
            aug: 8,
            sep: 9,
            oct: 10,
            nov: 11,
            dec: 12,
            january: 1,
            february: 2,
            march: 3,
            april: 4,
            june: 6,
            july: 7,
            august: 8,
            september: 9,
            october: 10,
            november: 11,
            december: 12,
          };
          const m = months[enDateMatch[1].toLowerCase()];
          if (m) {
            date = `${enDateMatch[3]}-${String(m).padStart(2, '0')}-${String(enDateMatch[2]).padStart(2, '0')}`;
          }
        } else {
          const slashMatch = dateSearchBlock.match(
            /(\d{1,2})\/(\d{1,2})\/(\d{4})/,
          );
          if (slashMatch) {
            date = `${slashMatch[3]}-${String(slashMatch[2]).padStart(2, '0')}-${String(slashMatch[1]).padStart(2, '0')}`;
          }
        }
      }

      // 5. Mô tả
      let description: string | null = null;
      const descIdx = lines.findIndex((l: string) =>
        /^(?:Mô tả|Description)$/i.test(l),
      );
      if (descIdx >= 0) {
        const rawDescLines = lines.slice(descIdx + 1, descIdx + 10);
        const stopIdx = rawDescLines.findIndex((l: string) =>
          /^(?:Ghi chú|My notes|Khách|Guests|Lưu ý)/i.test(l),
        );
        const finalDescLines =
          stopIdx >= 0
            ? rawDescLines.slice(0, stopIdx)
            : rawDescLines.slice(0, 3);
        const joinedDesc = finalDescLines.join('\n').trim();
        description = joinedDesc.length > 0 ? joinedDesc : null;
      }

      // 6. Meet URL
      const meetMatch = unwrapped.match(
        /https:\/\/meet\.google\.com\/[a-z0-9-]+/i,
      );
      const meetUrl = meetMatch ? meetMatch[0] : null;

      // 7. Danh sách email người dự
      const attendeeEmails = [
        ...new Set(
          unwrapped.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ||
            [],
        ),
      ];

      return {
        title,
        organizer,
        date,
        startTime,
        endTime,
        duration,
        timeZone: timeStr.includes('TP Hồ Chí Minh')
          ? 'Asia/Ho_Chi_Minh'
          : null,
        description,
        meetUrl,
        attendeeEmails,
      };
    } catch (err) {
      this.logger.error('Lỗi khi đọc file PDF Google Calendar:', err);
      throw new BadRequestException(
        'Could not parse Google Calendar PDF. Please ensure the file was exported from Google Calendar.',
      );
    }
  }
}

export interface ParsedMeetingPdf {
  title: string;
  organizer: string | null;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  duration: number;
  timeZone: string | null;
  description: string | null;
  meetUrl: string | null;
  attendeeEmails: string[];
}
