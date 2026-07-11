package user_service.controller;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import user_service.AuthGuard;
import user_service.model.Expense;
import user_service.service.ExpenseService;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/expenses")
@CrossOrigin(origins = "*")
public class ExpenseController {

    @Autowired
    private ExpenseService expenseService;

    // Exceptions like NullPointerException can carry a null message — Map.of rejects null values
    private static String errorMessage(Exception e) {
        return e.getMessage() != null ? e.getMessage() : "An unexpected error occurred";
    }

    @PostMapping
    public ResponseEntity<?> createExpense(@RequestBody Map<String, String> request,
                                           HttpServletRequest httpRequest) {
        try {
            String userIdStr = request.get("userId");
            String amountStr = request.get("amount");
            String category = request.get("category");
            String dateStr = request.get("date");

            if (userIdStr == null || amountStr == null || category == null || dateStr == null) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "userId, amount, category and date are required", "success", false));
            }

            if (category.isEmpty()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Category cannot be empty", "success", false));
            }

            Long userId = Long.parseLong(userIdStr);
            AuthGuard.requireSameUser(httpRequest, userId);
            BigDecimal amount = new BigDecimal(amountStr);

            if (amount.compareTo(BigDecimal.ZERO) == 0) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Amount must not be zero", "success", false));
            }

            String description = request.get("description");
            String paymentMethod = request.getOrDefault("paymentMethod", "CASH");
            LocalDate date = LocalDate.parse(dateStr);

            // Business rule: planned expenses up to 7 days ahead are allowed;
            // anything further in the future is rejected.
            if (date.isAfter(LocalDate.now().plusDays(7))) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Expense date cannot be more than 7 days in the future", "success", false));
            }

            Expense expense = expenseService.createExpense(userId, amount, category, description, date, paymentMethod);

            // Optional extras (Splitwise-style notes, receipt photo)
            String notes = request.get("notes");
            String receiptPhoto = request.get("receiptPhoto");
            if (notes != null || receiptPhoto != null) {
                expense = expenseService.updateExtras(expense.getId(), notes, receiptPhoto);
            }

            return ResponseEntity.status(HttpStatus.CREATED).body(expense);

        } catch (Exception e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", errorMessage(e), "success", false));
        }
    }

    // Authorization: JwtAuthFilter verifies /user/{userId} matches the JWT's userId.
    @GetMapping("/user/{userId}")
    public ResponseEntity<?> getUserExpenses(@PathVariable Long userId,
                                             @RequestParam(required = false) String category) {
        try {
            List<Expense> expenses;
            if (category != null && !category.isEmpty()) {
                expenses = expenseService.getUserExpensesByCategory(userId, category);
            } else {
                expenses = expenseService.getUserExpenses(userId);
            }
            return ResponseEntity.ok(expenses);
        } catch (Exception e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", errorMessage(e), "success", false));
        }
    }

    // Ownership enforced via the JWT: the expense must belong to the
    // authenticated user (query param kept for backward compatibility).
    @DeleteMapping("/{expenseId}")
    public ResponseEntity<?> deleteExpense(@PathVariable Long expenseId,
                                           @RequestParam(required = false) Long userId,
                                           HttpServletRequest httpRequest) {
        try {
            AuthGuard.requireSameUser(httpRequest, userId);
            Long effectiveUserId = userId != null ? userId : AuthGuard.authUserId(httpRequest);
            expenseService.deleteExpense(expenseId, effectiveUserId);
            return ResponseEntity.ok(Map.of("message", "Expense deleted successfully", "success", true));
        } catch (Exception e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", errorMessage(e), "success", false));
        }
    }

    @GetMapping("/user/{userId}/report")
    public ResponseEntity<?> getMonthlyReport(@PathVariable Long userId,
                                              @RequestParam(required = false) Integer month,
                                              @RequestParam(required = false) Integer year) {
        try {
            Map<String, Object> report = expenseService.getMonthlyReport(userId, month, year);
            // Copy to new map so we don't mutate the service-returned object
            Map<String, Object> response = new HashMap<>(report);
            response.put("success", true);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", errorMessage(e), "success", false));
        }
    }

    // Optional pagination: ?page=0&size=20 slices the sorted combined history.
    // Without params the full list is returned (backward compatible).
    @GetMapping("/user/{userId}/history")
    public ResponseEntity<?> getCombinedHistory(@PathVariable Long userId,
                                                @RequestParam(required = false) Integer page,
                                                @RequestParam(required = false) Integer size) {
        try {
            List<Map<String, Object>> history = expenseService.getCombinedHistory(userId);
            if (page != null && size != null && page >= 0 && size > 0) {
                int from = Math.min(page * size, history.size());
                int to = Math.min(from + size, history.size());
                return ResponseEntity.ok(history.subList(from, to));
            }
            return ResponseEntity.ok(history);
        } catch (Exception e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", errorMessage(e), "success", false));
        }
    }

    /**
     * GET /api/expenses/user/{userId}/export?format=csv|pdf
     * csv → text/csv attachment; pdf → cleanly styled HTML table
     * (the app converts it to a PDF on-device with expo-print).
     */
    @GetMapping("/user/{userId}/export")
    public ResponseEntity<?> exportExpenses(@PathVariable Long userId,
                                            @RequestParam(defaultValue = "csv") String format) {
        try {
            if ("csv".equalsIgnoreCase(format)) {
                String csv = expenseService.buildCsvExport(userId);
                return ResponseEntity.ok()
                        .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=tally-expenses.csv")
                        .contentType(MediaType.parseMediaType("text/csv"))
                        .body(csv);
            }
            if ("pdf".equalsIgnoreCase(format)) {
                String html = expenseService.buildHtmlExport(userId);
                return ResponseEntity.ok()
                        .contentType(MediaType.TEXT_HTML)
                        .body(html);
            }
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "format must be csv or pdf", "success", false));
        } catch (Exception e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", errorMessage(e), "success", false));
        }
    }

    /** GET /api/expenses/user/{userId}/recurring — all recurring expenses, soonest due first. */
    @GetMapping("/user/{userId}/recurring")
    public ResponseEntity<?> getRecurringExpenses(@PathVariable Long userId) {
        try {
            return ResponseEntity.ok(expenseService.getRecurringExpenses(userId));
        } catch (Exception e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", errorMessage(e), "success", false));
        }
    }

    /**
     * PUT /api/expenses/{expenseId}/recurring
     * Body: { "isRecurring": "true"|"false", "recurrenceType": "DAILY"|"WEEKLY"|"MONTHLY" }
     */
    @PutMapping("/{expenseId}/recurring")
    public ResponseEntity<?> updateRecurring(@PathVariable Long expenseId,
                                             @RequestBody Map<String, String> request) {
        try {
            boolean isRecurring = Boolean.parseBoolean(request.get("isRecurring"));
            String recurrenceType = request.get("recurrenceType");
            Expense updated = expenseService.updateRecurring(expenseId, isRecurring, recurrenceType);
            return ResponseEntity.ok(updated);
        } catch (Exception e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", errorMessage(e), "success", false));
        }
    }
}
