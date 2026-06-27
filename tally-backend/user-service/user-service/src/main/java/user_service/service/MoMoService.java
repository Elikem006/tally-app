package user_service.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.math.BigDecimal;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import java.util.logging.Logger;

@Service
public class MoMoService {

    private static final Logger log = Logger.getLogger(MoMoService.class.getName());

    @Value("${momo.subscription.key}")
    private String subscriptionKey;

    @Value("${momo.api.user}")
    private String apiUser;

    @Value("${momo.api.key}")
    private String apiKey;

    @Value("${momo.base.url}")
    private String baseUrl;

    @Value("${momo.environment}")
    private String environment;

    @Value("${momo.currency}")
    private String currency;

    @Value("${momo.callback.url}")
    private String callbackUrl;

    private final RestTemplate restTemplate = new RestTemplate();

    /**
     * Obtain a Bearer access token from the MoMo collections API.
     */
    public String getAccessToken() {
        String credentials = apiUser + ":" + apiKey;
        String basicAuth = "Basic " + Base64.getEncoder().encodeToString(credentials.getBytes());

        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", basicAuth);
        headers.set("Ocp-Apim-Subscription-Key", subscriptionKey);
        headers.setContentType(MediaType.APPLICATION_JSON);

        HttpEntity<String> entity = new HttpEntity<>("", headers);

        ResponseEntity<Map> response = restTemplate.exchange(
                baseUrl + "/collection/token/",
                HttpMethod.POST,
                entity,
                Map.class
        );

        if (response.getBody() == null || !response.getBody().containsKey("access_token")) {
            throw new RuntimeException("Failed to obtain MoMo access token");
        }

        return (String) response.getBody().get("access_token");
    }

    /**
     * Send a Request-to-Pay to the given MSISDN phone number.
     * Returns the referenceId on HTTP 202 Accepted.
     */
    public String requestToPay(String phoneNumber, BigDecimal amount, String description, String referenceId) {
        String token = getAccessToken();

        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", "Bearer " + token);
        headers.set("X-Reference-Id", referenceId);
        headers.set("X-Target-Environment", environment);
        headers.set("Ocp-Apim-Subscription-Key", subscriptionKey);
        headers.setContentType(MediaType.APPLICATION_JSON);

        Map<String, Object> payer = new HashMap<>();
        payer.put("partyIdType", "MSISDN");
        payer.put("partyId", phoneNumber);

        Map<String, Object> body = new HashMap<>();
        body.put("amount",       amount.setScale(2, java.math.RoundingMode.HALF_UP).toPlainString());
        body.put("currency",     currency);
        body.put("externalId",   referenceId);
        body.put("payer",        payer);
        body.put("payerMessage", description);
        body.put("payeeNote",    description);

        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);

        ResponseEntity<String> response = restTemplate.exchange(
                baseUrl + "/collection/v1_0/requesttopay",
                HttpMethod.POST,
                entity,
                String.class
        );

        if (response.getStatusCode() == HttpStatus.ACCEPTED) {
            log.info("MoMo requestToPay accepted. referenceId=" + referenceId);
            return referenceId;
        }

        throw new RuntimeException("MoMo requestToPay returned unexpected status: " + response.getStatusCode());
    }

    /**
     * Check the status of a previously submitted payment.
     * Returns "SUCCESSFUL", "FAILED", or "PENDING".
     */
    public String getPaymentStatus(String referenceId) {
        String token = getAccessToken();

        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", "Bearer " + token);
        headers.set("X-Target-Environment", environment);
        headers.set("Ocp-Apim-Subscription-Key", subscriptionKey);

        HttpEntity<Void> entity = new HttpEntity<>(headers);

        ResponseEntity<Map> response = restTemplate.exchange(
                baseUrl + "/collection/v1_0/requesttopay/" + referenceId,
                HttpMethod.GET,
                entity,
                Map.class
        );

        if (response.getBody() != null && response.getBody().containsKey("status")) {
            return (String) response.getBody().get("status");
        }

        return "PENDING";
    }
}
