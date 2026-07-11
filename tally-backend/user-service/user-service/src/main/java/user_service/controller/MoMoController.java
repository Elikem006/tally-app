package user_service.controller;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import user_service.AuthGuard;
import user_service.RateLimiter;
import user_service.service.ExpenseService;
import user_service.service.MoMoService;

import java.math.BigDecimal;
import java.time.LocalDate;
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

    @Autowired
    private ExpenseService expenseService;

    @Autowired
    private RateLimiter rateLimiter;

    // Sandbox phone format: digits only, 9–15 characters
    private static boolean isValidPhone(String phone) {
        return phone != null && phone.matches("\\d{9,15}");
    }

    // In-memory balance cache — avoids hitting the MoMo sandbox on every Home screen load
    private String cachedBalance = null;
    private String cachedCurrency = "EUR";
    private long lastBalanceFetch = 0;
    private static final long CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

    // Exceptions like NullPointerException can carry a null message — Map.of rejects null values
    private static String errorMessage(Exception e) {
        return e.getMessage() != null ? e.getMessage() : "An unexpected error occurred";
    }

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
            if (!isValidPhone(phoneNumber.trim())) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Phone number must contain only digits (9–15 characters)", "success", false));
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
            moMoService.requestToPay(phoneNumber.trim(), amount, description, referenceId);

            return ResponseEntity.ok(Map.of(
                    "message",     "Payment request sent",
                    "referenceId", referenceId,
                    "status",      "PENDING",
                    "success",     true
            ));

        } catch (Exception e) {
            log.severe("MoMo pay error: " + e.getMessage());
            return ResponseEntity.badRequest()
                    .body(Map.of("error", errorMessage(e), "success", false));
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
                    .body(Map.of("error", errorMessage(e), "success", false));
        }
    }

    /**
     * GET /api/momo/balance
     * Returns the MoMo collection account balance from the sandbox.
     * Caches the result for 5 minutes to avoid hammering the sandbox on every Home screen load.
     * Falls back to the last cached value when the sandbox is unavailable.
     */
    @GetMapping("/balance")
    public ResponseEntity<?> getBalance() {
        long now = System.currentTimeMillis();

        // Serve from cache if still fresh
        if (cachedBalance != null && (now - lastBalanceFetch) < CACHE_DURATION_MS) {
            Map<String, Object> cached = new HashMap<>();
            cached.put("availableBalance", cachedBalance);
            cached.put("currency", cachedCurrency);
            cached.put("status", "available");
            cached.put("cached", true);
            cached.put("success", true);
            return ResponseEntity.ok(cached);
        }

        try {
            Map<String, String> balance = moMoService.getAccountBalance();

            // Update cache
            cachedBalance = balance.getOrDefault("availableBalance", "0.00");
            cachedCurrency = balance.getOrDefault("currency", "EUR");
            lastBalanceFetch = now;

            Map<String, Object> response = new HashMap<>();
            response.put("availableBalance", cachedBalance);
            response.put("currency", cachedCurrency);
            response.put("status", "available");
            response.put("cached", false);
            response.put("success", true);
            return ResponseEntity.ok(response);

        } catch (Exception e) {
            String msg = e.getMessage() != null ? e.getMessage() : "";

            // If we have a stale cached value, return it rather than failing hard
            if (cachedBalance != null) {
                log.warning("MoMo balance fetch failed — serving stale cache: " + msg);
                Map<String, Object> stale = new HashMap<>();
                stale.put("availableBalance", cachedBalance);
                stale.put("currency", cachedCurrency);
                stale.put("status", "cached");
                stale.put("cached", true);
                stale.put("success", true);
                return ResponseEntity.ok(stale);
            }

            // Sandbox 503 is common — return graceful fallback instead of an error
            if (msg.contains("503") || msg.contains("SERVICE_UNAVAILABLE") || msg.contains("timeout")) {
                log.warning("MoMo sandbox balance unavailable (503/timeout) — returning fallback");
                return ResponseEntity.ok(Map.of(
                        "availableBalance", "0.00",
                        "currency",         "EUR",
                        "status",           "unavailable",
                        "message",          "MoMo service temporarily unavailable",
                        "success",          true
                ));
            }

            log.severe("MoMo balance error: " + msg);
            return ResponseEntity.ok(Map.of(
                    "availableBalance", "0.00",
                    "currency",         "EUR",
                    "status",           "unavailable",
                    "message",          "MoMo service temporarily unavailable",
                    "success",          true
            ));
        }
    }

    /**
     * POST /api/momo/transfer
     * Body: { "userId", "recipientPhone", "amount", "description", "category" }
     * Initiates a MoMo disbursement (transfer) to a vendor and records it as an expense.
     */
    @PostMapping("/transfer")
    public ResponseEntity<?> initiateTransfer(@RequestBody Map<String, String> request,
                                              HttpServletRequest httpRequest) {
        try {
            String recipientPhone = request.get("recipientPhone");
            String amountStr      = request.get("amount");
            String description    = request.getOrDefault("description", "MoMo transfer");
            String category       = request.getOrDefault("category", "Other");
            String userIdStr      = request.get("userId");

            // The transfer must be initiated by the authenticated user
            if (userIdStr != null && !userIdStr.isBlank()) {
                AuthGuard.requireSameUser(httpRequest, Long.parseLong(userIdStr));
            }

            // Rate limit: max 10 transfers per user per hour
            String limitKey = "transfer:" + (userIdStr != null && !userIdStr.isBlank()
                    ? userIdStr : String.valueOf(AuthGuard.authUserId(httpRequest)));
            if (!rateLimiter.allow(limitKey, 10, 60 * 60 * 1000)) {
                return ResponseEntity.status(429)
                        .body(Map.of("error", "Transfer limit reached (10 per hour). Please try again later.", "success", false));
            }

            if (!isValidPhone(recipientPhone.trim())) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Recipient phone must contain only digits (9–15 characters)", "success", false));
            }

            if (recipientPhone == null || recipientPhone.isBlank()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "recipientPhone is required", "success", false));
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
            moMoService.transfer(recipientPhone, amount, description, referenceId);

            // Record as personal expense so it shows in History. Status starts
            // PENDING and is resolved to COMPLETED/FAILED when the transfer
            // status is checked (see checkTransferStatus below). The stored
            // referenceId links the expense to the disbursement (unique).
            if (userIdStr != null && !userIdStr.isBlank()) {
                try {
                    Long userId = Long.parseLong(userIdStr);
                    String expenseDesc = "Sent to " + recipientPhone +
                            (description != null && !description.isBlank() ? ": " + description : "");
                    expenseService.createExpense(userId, amount, category, expenseDesc,
                            LocalDate.now(), "MOMO", "PENDING", referenceId);
                } catch (Exception ex) {
                    // Non-fatal — log and continue; the transfer itself succeeded
                    log.warning("Failed to record transfer expense: " + ex.getMessage());
                }
            }

            return ResponseEntity.ok(Map.of(
                    "referenceId", referenceId,
                    "message",     "Transfer initiated. Recipient will receive funds shortly.",
                    "status",      "PENDING",
                    "success",     true
            ));

        } catch (Exception e) {
            log.severe("MoMo transfer error: " + e.getMessage());
            return ResponseEntity.badRequest()
                    .body(Map.of("error", errorMessage(e), "success", false));
        }
    }

    /**
     * GET /api/momo/transfer/status/{referenceId}
     */
    @GetMapping("/transfer/status/{referenceId}")
    public ResponseEntity<?> checkTransferStatus(@PathVariable String referenceId) {
        try {
            String status = moMoService.getTransferStatus(referenceId);

            // Resolve the linked expense's status: SUCCESSFUL → COMPLETED,
            // FAILED → FAILED, anything else stays PENDING.
            if ("SUCCESSFUL".equalsIgnoreCase(status)) {
                expenseService.updateMomoExpenseStatus(referenceId, "COMPLETED");
            } else if ("FAILED".equalsIgnoreCase(status)) {
                expenseService.updateMomoExpenseStatus(referenceId, "FAILED");
            }

            return ResponseEntity.ok(Map.of(
                    "referenceId", referenceId,
                    "status",      status,
                    "success",     true
            ));
        } catch (Exception e) {
            log.severe("MoMo transfer status error: " + e.getMessage());
            return ResponseEntity.badRequest()
                    .body(Map.of("error", errorMessage(e), "success", false));
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
