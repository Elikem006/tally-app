package user_service.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import user_service.service.MoMoService;

import java.math.BigDecimal;
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
     */
    @PostMapping("/pay")
    public ResponseEntity<?> initiatePay(@RequestBody Map<String, String> request) {
        try {
            String phoneNumber = request.get("phoneNumber");
            String amountStr   = request.get("amount");
            String description = request.getOrDefault("description", "Tally group settle-up");

            if (phoneNumber == null || phoneNumber.isBlank()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "phoneNumber is required"));
            }
            if (amountStr == null || amountStr.isBlank()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "amount is required"));
            }

            BigDecimal amount = new BigDecimal(amountStr);
            if (amount.compareTo(BigDecimal.ZERO) <= 0) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "amount must be greater than zero"));
            }

            String referenceId = UUID.randomUUID().toString();
            moMoService.requestToPay(phoneNumber, amount, description, referenceId);

            return ResponseEntity.ok(Map.of(
                    "message",     "Payment request sent",
                    "referenceId", referenceId,
                    "status",      "PENDING"
            ));

        } catch (Exception e) {
            log.severe("MoMo pay error: " + e.getMessage());
            return ResponseEntity.badRequest()
                    .body(Map.of("error", e.getMessage()));
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
                    "status",      status
            ));
        } catch (Exception e) {
            log.severe("MoMo status error: " + e.getMessage());
            return ResponseEntity.badRequest()
                    .body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * POST /api/momo/callback
     * Receives MoMo push notifications — log and acknowledge.
     */
    @PostMapping("/callback")
    public ResponseEntity<?> callback(@RequestBody(required = false) Map<String, Object> payload) {
        log.info("MoMo callback received: " + payload);
        return ResponseEntity.ok(Map.of("message", "Callback received"));
    }
}
