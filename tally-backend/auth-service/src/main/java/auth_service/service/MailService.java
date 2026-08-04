package auth_service.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;

/**
 * Outbound transactional email via Brevo's HTTP API (not SMTP) — Railway
 * blocks outbound SMTP (ports 465/587/2525) on non-Pro plans, which silently
 * times out every send regardless of ESP/credentials. The HTTP API has no
 * such restriction. One method today (the password-reset OTP); every
 * message is sent with both an HTML and plain-text body — a text-only or
 * malformed-MIME message is itself a spam signal, independent of ESP.
 */
@Service
public class MailService {

    private static final String BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email";

    private static final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    @Autowired
    private ObjectMapper objectMapper;

    @Value("${brevo.api-key}")
    private String apiKey;

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

        // Logo hosted on GitHub raw (the repo is public) — email clients block
        // both inline attachments and embedded/base64 images by default, so it
        // has to be a real public URL. Not a CDN, but fine at password-reset
        // volume; revisit if a proper asset host shows up later.
        String logoUrl = "https://raw.githubusercontent.com/Elikem006/tally-app/main/tally-mobile/assets/icon-tally-email.png";

        String html =
                "<!DOCTYPE html><html><body style=\"margin:0;padding:24px;background:#f5f5f5;" +
                "font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;\">" +
                "<table role=\"presentation\" width=\"100%\" style=\"max-width:480px;margin:0 auto;" +
                "background:#ffffff;border-radius:12px;overflow:hidden;\">" +
                "<tr><td style=\"background:#8B5CF6;padding:28px 32px;text-align:center;\">" +
                "<img src=\"" + logoUrl + "\" width=\"48\" height=\"48\" alt=\"Tally\" " +
                "style=\"display:block;margin:0 auto 8px;border-radius:10px;\">" +
                "<span style=\"color:#ffffff;font-size:18px;font-weight:600;letter-spacing:0.3px;\">Tally</span>" +
                "</td></tr>" +
                "<tr><td style=\"padding:32px;\">" +
                "<p style=\"font-size:15px;line-height:1.5;margin:0 0 16px;\">Hi,</p>" +
                "<p style=\"font-size:15px;line-height:1.5;margin:0 0 16px;\">Use this code to reset your Tally password:</p>" +
                "<p style=\"font-size:28px;font-weight:600;letter-spacing:4px;text-align:center;" +
                "background:rgba(139,92,246,0.1);color:#6D28D9;border-radius:6px;padding:16px;margin:0 0 16px;\">" + otp + "</p>" +
                "<p style=\"font-size:13px;line-height:1.5;color:#666666;margin:0 0 16px;\">" +
                "This code expires in 15 minutes. If you didn't request a password reset, " +
                "you can safely ignore this email — your password won't be changed.</p>" +
                "<p style=\"font-size:13px;line-height:1.5;color:#999999;margin:24px 0 0;\">— Tally</p>" +
                "</td></tr></table></body></html>";

        Map<String, Object> body = Map.of(
                "sender", Map.of("name", fromName, "email", fromAddress),
                "to", List.of(Map.of("email", toEmail)),
                "replyTo", Map.of("email", replyTo),
                "subject", subject,
                "htmlContent", html,
                "textContent", plainText
        );

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(BREVO_SEND_URL))
                .header("api-key", apiKey)
                .header("accept", "application/json")
                .header("content-type", "application/json")
                .timeout(Duration.ofSeconds(10))
                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body)))
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        // Brevo returns 201 with a messageId on success; anything else is a
        // real API-side error (bad key, unverified sender, etc.) with a
        // structured JSON body — surface it so the caller's catch block logs
        // something actionable instead of a generic failure.
        if (response.statusCode() != 201) {
            throw new RuntimeException(
                    "Brevo API returned " + response.statusCode() + ": " + response.body());
        }
    }
}
