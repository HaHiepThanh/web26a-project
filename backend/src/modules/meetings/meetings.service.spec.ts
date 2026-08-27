import { Test, TestingModule } from '@nestjs/testing';
import * as fs from 'fs';
import * as path from 'path';
import { MeetingsService } from './meetings.service';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { AccessService } from '../../common/access/access.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

describe('MeetingsService - parseGoogleCalendarPdf', () => {
  let service: MeetingsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MeetingsService,
        {
          provide: SupabaseService,
          useValue: {
            admin: {
              from: jest.fn(),
            },
          },
        },
        {
          provide: AccessService,
          useValue: {
            coQuyenXemBoard: jest.fn(),
            tenHienThi: jest.fn(),
          },
        },
        {
          provide: RealtimeGateway,
          useValue: {
            emitToUser: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<MeetingsService>(MeetingsService);
  });

  it('trích xuất chính xác thông tin từ file PDF xuất từ Google Calendar', async () => {
    const pdfPath =
      '/Users/thanhhhtt/.gemini/antigravity-ide/brain/79dd9838-0985-451e-98e5-146f05808da4/.user_uploaded/media_1787803402708.pdf';

    if (!fs.existsSync(pdfPath)) {
      return;
    }

    const buffer = fs.readFileSync(pdfPath);
    const result = await service.parseGoogleCalendarPdf(buffer);

    expect(result.title).toBe('Kế hoạch Tuần cá nhân sync');
    expect(result.organizer).toBe('Thanh Hà Hiệp');
    expect(result.date).toBe('2026-08-27');
    expect(result.startTime).toBe('11:15');
    expect(result.endTime).toBe('11:45');
    expect(result.duration).toBe(30);
    expect(result.description).toBe('Scheduled from Horizon Hub Harmony.');
    expect(result.attendeeEmails).toContain('thanh.hh01270@sinhvien.hoasen.edu.vn');
  });
});
