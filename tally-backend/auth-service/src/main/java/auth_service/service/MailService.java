package auth_service.service;

import jakarta.mail.internet.MimeMessage;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

/**
 * Outbound transactional email. One method today (the password-reset OTP);
 * every message is sent as real multipart (HTML + plain-text alternative) —
 * a text-only or malformed-MIME message is itself a spam signal, independent
 * of which domain/ESP eventually sends it.
 */
@Service
public class MailService {

    @Autowired
    private JavaMailSender mailSender;

    @Value("${mail.from-address}")
    private String fromAddress;

    @Value("${mail.from-name}")
    private String fromName;

    @Value("${mail.reply-to}")
    private String replyTo;

    public void sendPasswordResetOtp(String toEmail, String otp) throws Exception {
        String subject = "Your Tally password reset code";

        String plainText =
                "Hi,\n\n" +
                "Use this code to reset your Tally password:\n\n" +
                "    " + otp + "\n\n" +
                "This code expires in 15 minutes. If you didn't request a password " +
                "reset, you can safely ignore this email — your password won't be " +
                "changed.\n\n" +
                "— Tally";

        String html =
                "<!DOCTYPE html><html><body style=\"margin:0;padding:24px;background:#f5f5f5;" +
                "font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;\">" +
                "<table role=\"presentation\" width=\"100%\" style=\"max-width:480px;margin:0 auto;" +
                "background:#ffffff;border-radius:8px;padding:32px;\">" +
                "<tr><td>" +
                "<p style=\"font-size:15px;line-height:1.5;margin:0 0 16px;\">Hi,</p>" +
                "<p style=\"font-size:15px;line-height:1.5;margin:0 0 16px;\">Use this code to reset your Tally password:</p>" +
                "<p style=\"font-size:28px;font-weight:600;letter-spacing:4px;text-align:center;" +
                "background:#f5f5f5;border-radius:6px;padding:16px;margin:0 0 16px;\">" + otp + "</p>" +
                "<p style=\"font-size:13px;line-height:1.5;color:#666666;margin:0 0 16px;\">" +
                "This code expires in 15 minutes. If you didn't request a password reset, " +
                "you can safely ignore this email — your password won't be changed.</p>" +
                "<p style=\"font-size:13px;line-height:1.5;color:#999999;margin:24px 0 0;\">— Tally</p>" +
                "</td></tr></table></body></html>";

        MimeMessage message = mailSender.createMimeMessage();
        // true = multipart; UTF-8 so the OTP box/dash render correctly everywhere
        MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
        helper.setFrom(fromAddress, fromName);
        helper.setReplyTo(replyTo);
        helper.setTo(toEmail);
        helper.setSubject(subject);
        // Plain-text first, HTML second — the second call marks the message multipart/alternative
        helper.setText(plainText, html);

        mailSender.send(message);
    }
}
