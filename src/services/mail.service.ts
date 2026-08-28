import nodemailer from "nodemailer";
import { env, integrationStatus } from "../config/env";

export type PasswordResetEmail = {
  recipient: string;
  resetUrl: string;
  expiresInMinutes: number;
};

export interface MailService {
  sendPasswordResetEmail(message: PasswordResetEmail): Promise<void>;
}

export class MailConfigurationError extends Error {}

class SmtpMailService implements MailService {
  async sendPasswordResetEmail({
    recipient,
    resetUrl,
    expiresInMinutes,
  }: PasswordResetEmail): Promise<void> {
    if (integrationStatus.smtp !== "configured") {
      throw new MailConfigurationError(
        "SMTP chưa được cấu hình đầy đủ cho password reset",
      );
    }

    const transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth:
        env.SMTP_USER && env.SMTP_PASS
          ? {
              user: env.SMTP_USER,
              pass: env.SMTP_PASS,
            }
          : undefined,
    });

    await transporter.sendMail({
      from: env.MAIL_FROM,
      to: recipient,
      subject: `Đặt lại mật khẩu ${env.APP_NAME}`,
      text: [
        `Bạn đã yêu cầu đặt lại mật khẩu ${env.APP_NAME}.`,
        "",
        `Mở liên kết sau để đặt mật khẩu mới: ${resetUrl}`,
        "",
        `Liên kết sẽ hết hạn sau ${expiresInMinutes} phút.`,
        "Nếu bạn không yêu cầu thao tác này, hãy bỏ qua email.",
      ].join("\n"),
      html: `
        <h1>Đặt lại mật khẩu ${env.APP_NAME}</h1>
        <p>Bạn đã yêu cầu đặt lại mật khẩu ${env.APP_NAME}.</p>
        <p><a href="${resetUrl}">Đặt lại mật khẩu</a></p>
        <p>Liên kết sẽ hết hạn sau ${expiresInMinutes} phút.</p>
        <p>Nếu bạn không yêu cầu thao tác này, hãy bỏ qua email.</p>
      `,
    });
  }
}

export const mailService: MailService = new SmtpMailService();
