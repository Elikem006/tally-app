package user_service.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestTemplate;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.HashMap;
import java.util.Map;
import java.util.logging.Logger;

@Service
public class PaystackService {

    private static final Logger log = Logger.getLogger(PaystackService.class.getName());

    @Value("${paystack.secret.key}")
    private String secretKey;

    @Value("${paystack.base.url}")
    private String baseUrl;

    private final RestTemplate restTemplate = buildRestTemplate();

    private static RestTemplate buildRestTemplate() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(10_000); // 10 seconds
        factory.setReadTimeout(30_000);    // 30 seconds
        return new RestTemplate(factory);
    }

    private HttpHeaders authHeaders() {
        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", "Bearer " + secretKey);
        headers.setContentType(MediaType.APPLICATION_JSON);
        return headers;
    }

    /**
     * Initialize a Paystack transaction.
     * The amount is in GHS; Paystack expects the lowest currency unit (pesewas), so GHS 10.00 → 1000.
     * Returns authorizationUrl, accessCode and reference on success.
     */
    public Map<String, String> initializeTransaction(String email, BigDecimal amount,
                                                     String reference, String callbackUrl) {
        long pesewas = amount.multiply(BigDecimal.valueOf(100))
                .setScale(0, RoundingMode.HALF_UP)
                .longValueExact();

        Map<String, Object> body = new HashMap<>();
        body.put("email", email);
        body.put("amount", String.valueOf(pesewas));
        body.put("reference", reference);
        body.put("currency", "GHS");
        body.put("callback_url", callbackUrl);

        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, authHeaders());

        try {
            ResponseEntity<Map> response = restTemplate.exchange(
                    baseUrl + "/transaction/initialize",
                    HttpMethod.POST,
                    entity,
                    Map.class
            );

            Map<String, Object> responseBody = response.getBody();
            if (responseBody == null || !(responseBody.get("data") instanceof Map)) {
                throw new RuntimeException("Paystack initialize returned an unexpected response");
            }

            @SuppressWarnings("unchecked")
            Map<String, Object> data = (Map<String, Object>) responseBody.get("data");

            log.info("Paystack transaction initialized. reference=" + reference);

            Map<String, String> result = new HashMap<>();
            result.put("authorizationUrl", String.valueOf(data.get("authorization_url")));
            result.put("accessCode", String.valueOf(data.get("access_code")));
            result.put("reference", String.valueOf(data.get("reference")));
            return result;
        } catch (HttpStatusCodeException e) {
            throw new RuntimeException("Paystack initialize failed: " + e.getStatusCode()
                    + " — " + e.getResponseBodyAsString());
        }
    }

    /**
     * Verify a Paystack transaction by reference.
     * Returns status ("success", "failed", "abandoned", ...), amount (in pesewas) and reference.
     */
    public Map<String, Object> verifyTransaction(String reference) {
        HttpEntity<Void> entity = new HttpEntity<>(authHeaders());

        try {
            ResponseEntity<Map> response = restTemplate.exchange(
                    baseUrl + "/transaction/verify/" + reference,
                    HttpMethod.GET,
                    entity,
                    Map.class
            );

            Map<String, Object> responseBody = response.getBody();
            if (responseBody == null || !(responseBody.get("data") instanceof Map)) {
                throw new RuntimeException("Paystack verify returned an unexpected response");
            }

            @SuppressWarnings("unchecked")
            Map<String, Object> data = (Map<String, Object>) responseBody.get("data");

            Map<String, Object> result = new HashMap<>();
            result.put("status", data.get("status") != null ? String.valueOf(data.get("status")) : "failed");
            result.put("amount", data.get("amount"));
            result.put("reference", data.get("reference") != null ? String.valueOf(data.get("reference")) : reference);
            return result;
        } catch (HttpStatusCodeException e) {
            throw new RuntimeException("Paystack verify failed: " + e.getStatusCode()
                    + " — " + e.getResponseBodyAsString());
        }
    }
}
