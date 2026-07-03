package user_service.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import user_service.service.ExpenseService;
import user_service.service.PaystackService;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;
import java.util.logging.Logger;

@RestController
@RequestMapping("/api/paystack")
@CrossOrigin(origins = "*")
public class PaystackController {

    private static final Logger log = Logger.getLogger(PaystackController.class.getName());

    @Autowired
    private PaystackService paystackService;

    @Autowired
    private ExpenseService expenseService;

    // Exceptions like NullPointerException can carry a null message — Map.of rejects null values
    private static String errorMessage(Exception e) {
        return e.getMessage() != null ? e.getMessage() : "An unexpected error occurred";
    }

    /**
     * POST /api/paystack/initialize
     * Body: { "email", "amount", "description"?, "userId" }
     * Creates a Paystack transaction and returns the checkout authorization URL.
     */
    @PostMapping("/initialize")
    public ResponseEntity<?> initialize(@RequestBody Map<String, String> request) {
        try {
            String email = request.get("email");
            String amountStr = request.get("amount");
            String userIdStr = request.get("userId");

            if (email == null || email.isBlank()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "email is required", "success", false));
            }
            if (amountStr == null || amountStr.isBlank()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "amount is required", "success", false));
            }
            if (userIdStr == null || userIdStr.isBlank()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "userId is required", "success", false));
            }

            BigDecimal amount = new BigDecimal(amountStr);
            if (amount.compareTo(BigDecimal.ZERO) <= 0) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "amount must be greater than zero", "success", false));
            }

            String reference = "TALLY-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
            Map<String, String> init = paystackService.initializeTransaction(
                    email, amount, reference, "https://tally.app/payment/callback");

            return ResponseEntity.ok(Map.of(
                    "authorizationUrl", init.get("authorizationUrl"),
                    "accessCode", init.get("accessCode"),
                    "reference", init.get("reference"),
                    "message", "Payment initialized",
                    "success", true
            ));
        } catch (Exception e) {
            log.severe("Paystack initialize error: " + e.getMessage());
            return ResponseEntity.badRequest()
                    .body(Map.of("error", errorMessage(e), "success", false));
        }
    }

    /**
     * POST /api/paystack/verify
     * Body: { "reference", "userId", "amount", "description"?, "category"? }
     * Verifies the transaction with Paystack; on success records the expense
     * with paymentMethod=PAYSTACK.
     */
    @PostMapping("/verify")
    public ResponseEntity<?> verify(@RequestBody Map<String, String> request) {
        try {
            String reference = request.get("reference");
            String userIdStr = request.get("userId");
            String amountStr = request.get("amount");

            if (reference == null || reference.isBlank()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "reference is required", "success", false));
            }
            if (userIdStr == null || userIdStr.isBlank()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "userId is required", "success", false));
            }
            if (amountStr == null || amountStr.isBlank()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "amount is required", "success", false));
            }

            Long userId = Long.parseLong(userIdStr);
            BigDecimal amount = new BigDecimal(amountStr);
            if (amount.compareTo(BigDecimal.ZERO) <= 0) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "amount must be greater than zero", "success", false));
            }

            Map<String, Object> verification = paystackService.verifyTransaction(reference);
            String status = String.valueOf(verification.get("status"));

            if (!"success".equals(status)) {
                return ResponseEntity.ok(Map.of(
                        "status", "failed",
                        "message", "Payment was not successful (Paystack status: " + status + ")",
                        "success", false
                ));
            }

            // Guard against tampering: the charged amount must match the claimed amount
            Object paidObj = verification.get("amount");
            if (paidObj instanceof Number) {
                long paidPesewas = ((Number) paidObj).longValue();
                long expectedPesewas = amount.multiply(BigDecimal.valueOf(100))
                        .setScale(0, RoundingMode.HALF_UP).longValueExact();
                if (paidPesewas != expectedPesewas) {
                    log.warning("Paystack amount mismatch for " + reference
                            + ": paid=" + paidPesewas + " expected=" + expectedPesewas);
                    return ResponseEntity.ok(Map.of(
                            "status", "failed",
                            "message", "Paid amount does not match the expense amount",
                            "success", false
                    ));
                }
            }

            String description = request.get("description");
            String category = request.get("category");
            if (category == null || category.isBlank()) category = "Other";

            expenseService.createExpense(userId, amount, category, description, LocalDate.now(), "PAYSTACK");

            return ResponseEntity.ok(Map.of(
                    "status", "success",
                    "message", "Payment verified and expense recorded",
                    "reference", reference,
                    "success", true
            ));
        } catch (Exception e) {
            log.severe("Paystack verify error: " + e.getMessage());
            return ResponseEntity.badRequest()
                    .body(Map.of("error", errorMessage(e), "success", false));
        }
    }

    /**
     * GET /api/paystack/callback — Paystack redirects here after checkout.
     * Acknowledge with 200 OK; the app verifies transactions explicitly via /verify.
     */
    @GetMapping("/callback")
    public ResponseEntity<?> callback(@RequestParam(required = false) Map<String, String> params) {
        log.info("Paystack callback received: " + params);
        return ResponseEntity.ok(Map.of("message", "Callback received", "success", true));
    }
}
