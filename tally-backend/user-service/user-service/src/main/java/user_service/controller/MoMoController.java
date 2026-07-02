package user_service.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import user_service.service.MoMoService;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.logging.Logger;

@RestController
@RequestMapping("/api/momo")
@CrossOrigin(origins = "*")
public class MoMoController {

    private static final Logger log = Logger.getLogger(MoMoController.class.getName());

    @Autowired
    private MoMoService moMoService;

    /**
     * POST /api/momo/pay
     * Body: { "userId", "phoneNumber", "amount", "description", "groupId" }
     *
     * TODO: Add rate limiting before production to prevent abuse of MoMo payment endpoint.
     * Consider using Spring's @RateLimiter (Resilience4j) or a Redis-based solution
     * (e.g. Bucket4j) to limit requests per user/IP.
     */
    @PostMapping("/pay")
    public ResponseEntity<?> initiatePay(@RequestBody Map<String, String> request) {
        try {
            String phoneNumber = request.get("phoneNumber");
            String amountStr   = request.get("amount");
            String description = request.getOrDefault("description", "Tally group settle-up");

            if (phoneNumber == null || phoneNumber.isBlank()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "phoneNumber is required", "success", false));
            }
            if (amountStr == null || amountStr.isBlank()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "amount is required", "success", false));
            }

            BigDecimal amount = new BigDecimal(amountStr);
            if (amount.compareTo(BigDecimal.ZERO) <= 0) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "amount must be greater than zero", "success", false));
            }

            String referenceId = UUID.randomUUID().toString();
            moMoService.requestToPay(phoneNumber, amount, description, referenceId);

            return ResponseEntity.ok(Map.of(
                    "message",     "Payment request sent",
                    "referenceId", referenceId,
                    "status",      "PENDING",
                    "success",     true
            ));

        } catch (Exception e) {
            log.severe("MoMo pay error: " + e.getMessage());
            return ResponseEntity.badRequest()
                    .body(Map.of("error", e.getMessage(), "success", false));
        }
    }

    /**
     * GET /api/momo/status/{referenceId}
     */
    @GetMapping("/status/{referenceId}")
    public ResponseEntity<?> checkStatus(@PathVariable String referenceId) {
        try {
            String status = moMoService.getPaymentStatus(referenceId);
            return ResponseEntity.ok(Map.of(
                    "referenceId", referenceId,
                    "status",      status,
                    "success",     true
            ));
        } catch (Exception e) {
            log.severe("MoMo status error: " + e.getMessage());
            return ResponseEntity.badRequest()
                    .body(Map.of("error", e.getMessage(), "success", false));
        }
    }

    /**
     * GET /api/momo/balance
     * Returns the MoMo collection account balance from the sandbox.
     * The MoMo sandbox balance endpoint returns 503 occasionally — this is normal
     * sandbox behaviour. We return a graceful fallback instead of propagating an error.
     */
    @GetMapping("/balance")
    public ResponseEntity<?> getBalance() {
        try {
            Map<String, String> balance = moMoService.getAccountBalance();
            // Build a new Map<String, Object> so we can add the boolean success field
            Map<String, Object> response = new HashMap<>();
            response.put("availableBalance", balance.getOrDefault("availableBalance", "0"));
            response.put("currency", balance.getOrDefault("currency", ""));
            response.put("status", "available");
            response.put("success", true);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            String msg = e.getMessage() != null ? e.getMessage() : "";
            // Sandbox returns 503 SERVICE_UNAVAILABLE intermittently — treat it as
            // a soft failure and return a fallback so the frontend can degrade gracefully.
            if (msg.contains("503") || msg.contains("SERVICE_UNAVAILABLE")) {
                log.warning("MoMo sandbox balance returned 503 — returning fallback response");
                return ResponseEntity.ok(Map.of(
                        "availableBalance", "0.00",
                        "currency",         "EUR",
                        "status",           "unavailable",
                        "message",          "MoMo service temporarily unavailable",
                        "success",          true
                ));
            }
            log.severe("MoMo balance error: " + e.getMessage());
            return ResponseEntity.badRequest()
                    .body(Map.of("error", e.getMessage(), "success", false));
        }
    }

    /**
     * POST /api/momo/callback
     * Receives MoMo push notifications — log and acknowledge.
     */
    @PostMapping("/callback")
    public ResponseEntity<?> callback(@RequestBody(required = false) Map<String, Object> payload) {
        log.info("MoMo callback received: " + payload);
        return ResponseEntity.ok(Map.of("message", "Callback received", "success", true));
    }
}
