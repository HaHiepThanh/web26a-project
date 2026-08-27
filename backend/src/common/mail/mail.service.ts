import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly config: ConfigService) {
    this.initTransporter();
  }

  private initTransporter(): void {
    const host = this.config.get<string>('SMTP_HOST', 'smtp.gmail.com');
    const port = Number(this.config.get<number>('SMTP_PORT', 465));
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');

    if (!user || !pass) {
      this.logger.warn(
        'Chưa cấu hình SMTP_USER hoặc SMTP_PASS trong .env. Email sẽ chỉ được log ra console.',
      );
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    this.logger.log(
      `MailService đã khởi tạo SMTP transporter (${host}:${port}, user: ${user})`,
    );
  }

  /**
   * Server có gửi email thật được không.
   *
   * ⚠️ Cố ý KHÔNG phải là "email này đã gửi thành công chưa". Cờ đó sẽ rò rỉ
   *    việc một địa chỉ có tồn tại hay không (gửi hụt = không có tài khoản),
   *    đúng thứ mà thông điệp chung chung ở `handleForgotPassword` đang tránh.
   *    Cờ này chỉ nói về CẤU HÌNH MÁY CHỦ nên an toàn để lộ ra ngoài.
   */
  get daCauHinh(): boolean {
    return !!this.transporter;
  }

  async sendPasswordResetEmail(
    toEmail: string,
    resetUrl: string,
  ): Promise<boolean> {
    const user = this.config.get<string>(
      'SMTP_USER',
      'noreply@horizon-hub-harmony.com',
    );
    const from = this.config.get<string>(
      'SMTP_FROM',
      `"Horizon Hub Harmony" <${user}>`,
    );

    const htmlContent = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background-color: #ffffff; color: #1e293b; border: 1px solid #e2e8f0; border-radius: 8px;">
  <div style="text-align: center; margin-bottom: 24px;">
    <h1 style="font-size: 20px; font-weight: 800; color: #0f172a; margin: 0 0 6px 0; letter-spacing: -0.02em;">Horizon Hub Harmony</h1>
    <p style="font-size: 13px; color: #64748b; margin: 0;">Smart Project Management &amp; Collaboration Workspace</p>
  </div>

  <div style="border-top: 1px solid #f1f5f9; padding-top: 24px; margin-bottom: 20px;">
    <h2 style="font-size: 16px; font-weight: 700; color: #0f172a; margin: 0 0 12px 0;">Password Reset Request</h2>
    <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 16px 0;">
      Hello, we received a request to reset the password for your account associated with <strong>${toEmail}</strong>.
    </p>
    <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 24px 0;">
      Click the button below to set up a new password for your account:
    </p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${resetUrl}" style="display: inline-block; background-color: #2563eb; color: #ffffff; font-size: 14px; font-weight: 700; text-decoration: none; padding: 12px 28px; border-radius: 6px; box-shadow: 0 4px 10px rgba(37, 99, 235, 0.25);">
        Reset Password &rarr;
      </a>
    </div>

    <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 4px; margin: 24px 0;">
      <p style="font-size: 13px; line-height: 1.5; color: #92400e; margin: 0; font-weight: 600;">
        ⏱️ Security Notice: For your safety, this password reset link will expire in <strong>5 minutes</strong>.
      </p>
    </div>

    <p style="font-size: 13px; line-height: 1.6; color: #64748b; margin: 20px 0 0 0;">
      If you did not request a password reset, you can safely ignore this email. Your current password will remain unchanged.
    </p>
  </div>

  <div style="border-top: 1px solid #f1f5f9; padding-top: 16px; text-align: center;">
    <p style="font-size: 12px; color: #94a3b8; margin: 0;">
      &copy; 2026 Horizon Hub Harmony. All rights reserved.
    </p>
  </div>
</div>`;

    if (!this.transporter) {
      // KHÔNG trả `true`: bản trước báo thành công dù chưa gửi gì, nên phía gọi
      // tưởng email đã đi và người dùng ngồi chờ một lá thư không tồn tại.
      this.logger.warn(
        `CHƯA CẤU HÌNH SMTP — không gửi được email. Link reset cho ${toEmail}: ${resetUrl}`,
      );
      return false;
    }

    try {
      await this.transporter.sendMail({
        from,
        to: toEmail,
        subject: '[Horizon Hub Harmony] Reset your password',
        html: htmlContent,
      });
      this.logger.log(`Đã gửi email reset password thành công tới ${toEmail}`);
      return true;
    } catch (err) {
      this.logger.error(`Gửi mail thất bại tới ${toEmail}:`, err);
      return false;
    }
  }
}
