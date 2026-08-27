import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { AuthService } from './auth.service';

describe('AuthService - uploadAvatar', () => {
  let service: AuthService;
  let mockSupabase: any;

  beforeEach(async () => {
    mockSupabase = {
      client: {
        storage: {
          from: jest.fn().mockReturnValue({
            upload: jest.fn().mockResolvedValue({ error: null }),
            getPublicUrl: jest.fn().mockReturnValue({
              data: {
                publicUrl:
                  'https://test.supabase.co/avatars/user-1/123.jpg',
              },
            }),
          }),
        },
        from: jest.fn().mockReturnValue({
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: {
                    id: 'u1',
                    email: 'test@dev.com',
                    display_name: 'Test User',
                    avatar_url: 'https://test.supabase.co/avatars/user-1/123.jpg',
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: SupabaseService, useValue: mockSupabase },
        {
          provide: RealtimeGateway,
          useValue: {
            broadcastUserProfileUpdated: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('từ chối khi không có file', async () => {
    await expect(
      service.uploadAvatar({ uid: 'u1', email: 'test@dev.com' }, null as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('từ chối khi file không phải định dạng ảnh được phép', async () => {
    const file = {
      mimetype: 'application/pdf',
      buffer: Buffer.from('fake-pdf'),
    } as Express.Multer.File;

    await expect(
      service.uploadAvatar({ uid: 'u1', email: 'test@dev.com' }, file),
    ).rejects.toThrow(BadRequestException);
  });

  it('upload thành công và trả về publicUrl', async () => {
    const file = {
      mimetype: 'image/jpeg',
      buffer: Buffer.from('fake-image-bytes'),
    } as Express.Multer.File;

    const res = await service.uploadAvatar(
      { uid: 'u1', email: 'test@dev.com' },
      file,
    );
    expect(res).toEqual({
      avatarUrl: 'https://test.supabase.co/avatars/user-1/123.jpg',
    });
    expect(mockSupabase.client.storage.from).toHaveBeenCalledWith('avatars');
  });
});
